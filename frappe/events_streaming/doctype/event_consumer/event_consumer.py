# -*- coding: utf-8 -*-
# Copyright (c) 2019, Frappe Technologies and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
import time
import json
import requests
from frappe.model.document import Document
from frappe.frappeclient import FrappeClient
from frappe.events_streaming.doctype.event_producer.event_producer import get_current_node
from frappe.utils.background_jobs import get_jobs

class EventConsumer(Document):
	def on_update(self):
		if not self.incoming_change:
			self.update_consumer_status()
		else:
			frappe.db.set_value(self.doctype, self.name, 'incoming_change', False)

	def update_consumer_status(self):
		consumer_site = get_consumer_site(self.callback_url)
		event_producer = consumer_site.get_doc('Event Producer', get_current_node())
		config = event_producer.event_configuration
		event_producer.event_configuration = []
		for entry in config:
			if entry.get('has_mapping'):
				ref_doctype = consumer_site.get_value('Document Type Mapping', entry.get('mapping'), 'remote_doctype')
			else:
				ref_doctype = entry.get('ref_doctype')

			entry['status'] = frappe.db.get_value('Event Subscribed Document Type', {'parent': self.name, 'ref_doctype': ref_doctype}, 'status')

		event_producer.event_configuration = config
		# when producer doc is updated it updates the consumer doc, set flag to avoid deadlock
		event_producer.incoming_change = True
		consumer_site.update(event_producer)

	def get_consumer_status(self):
		response = requests.get(self.callback_url)
		if response.status_code != 200:
			return 'offline'
		return 'online'

@frappe.whitelist(allow_guest=True)
def register_consumer(data):
	consumer = frappe.new_doc('Event Consumer')
	data = json.loads(data)
	consumer.callback_url = data['event_consumer']
	consumer.user = data['user']
	consumer.incoming_change = True
	subscribed_doctypes = json.loads(data['subscribed_doctypes'])

	for entry in subscribed_doctypes:
		consumer.append('subscribed_doctypes', {
			'ref_doctype': entry,
			'status': 'Pending'
		})

	api_key = frappe.generate_hash(length=10)
	api_secret = frappe.generate_hash(length=10)
	consumer.api_key = api_key
	consumer.api_secret = api_secret
	consumer.insert(ignore_permissions = True)

	# consumer's 'last_update' field should point to the latest update in producer's update log when subscribing
	# so that, updates after subscribing are consumed and not the old ones.
	last_update = str(get_last_update())
	return json.dumps({'api_key': api_key, 'api_secret': api_secret, 'last_update': last_update})

def get_consumer_site(consumer_url):
	consumer_doc = frappe.get_doc('Event Consumer', consumer_url)
	consumer_site = FrappeClient(
		url=consumer_url,
		api_key=consumer_doc.api_key,
		api_secret=consumer_doc.get_password('api_secret'),
		frappe_authorization_source='Event Producer'
	)
	return consumer_site

@frappe.whitelist()
def get_last_update():
	updates = frappe.get_list('Update Log', 'creation', ignore_permissions=True)
	if updates != []:
		return updates[0].creation
	return frappe.utils.now_datetime()

@frappe.whitelist()
def notify_event_consumers(doctype):
	event_consumers = frappe.get_all('Event Subscribed Document Type', ['parent'], {'ref_doctype': doctype, 'status': 'Approved'})
	for entry in event_consumers:
		consumer = frappe.get_doc('Event Consumer', entry.parent)
		consumer.flags.notified = False
		notify(consumer)

@frappe.whitelist()
def notify(consumer):
	consumer_status = consumer.get_consumer_status()
	if consumer_status == 'online':
		try:
			client = get_consumer_site(consumer.callback_url)
			client.post_request({
				'cmd': 'frappe.events_streaming.doctype.event_producer.event_producer.new_event_notification',
				'producer_url': get_current_node()
			})
			consumer.flags.notified = True
		except Exception:
			consumer.flags.notified = False
	else:
		consumer.flags.notified = False

	#enqueue another job if the site was not notified
	if not consumer.flags.notified:
		time.sleep(20)
		enqueued_method = 'frappe.events_streaming.doctype.event_consumer.event_consumer.notify'
		jobs = get_jobs()
		if not jobs or enqueued_method not in jobs[frappe.local.site] and not consumer.flags.notifed:
			frappe.enqueue(enqueued_method, queue = 'long', enqueue_after_commit = True, **{'consumer': consumer})