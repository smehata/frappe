// Copyright (c) 2015, Frappe Technologies Pvt. Ltd. and Contributors
// License: GNU General Public License v3. See license.txt

frappe.provide("frappe.setup");
frappe.provide("frappe.ui");

frappe.ui.Slide = class Slide {
	constructor(slide = null) {
		$.extend(this, slide);
		this.setup();
	}

	setup() {
		this.$wrapper = $('<div class="slide-wrapper hidden"></div>')
			.attr({"data-slide-id": this.id, "data-slide-name": this.name})
			.appendTo(this.parent);
	}

	// Make has to be called manually, to account for on-demand use cases
	make() {
		if(this.before_load) { this.before_load(this); }

		this.$body = $(`<div class="slide-body">
			<div class="content text-center">
				<p class="lead">${this.title}</p>
			</div>
			<div class="form-wrapper">
				<div class="form"></div>
				<div class="text-center" style="margin-top: 5px;">
					<a class="form-more-btn hide btn btn-default btn-xs">${__("Add More")}</a>
				</div>
			</div>
		</div>`).appendTo(this.$wrapper);

		this.$content = this.$body.find(".content");
		this.$form = this.$body.find(".form");

		if(this.help) this.$content.append($(`<p>${this.help}</p>`));
		if(this.image_src) this.$content.append(
			$(`<img src="${this.image_src}" style="margin: 20px;">`));

		this.refresh();
	}

	refresh() {
		if(!this.done) {
			this.make_primary_button();
			this.setup_form();
		} else {
			this.render_parent_dots();
			this.setup_done_state();
		}
	}

	setup_form() {
		this.form = new frappe.ui.FieldGroup({
			fields: this.get_atomic_fields(),
			body: this.$form[0],
			no_submit_on_enter: true
		});
		this.form.make();

		this.set_reqd_fields();

		if(this.add_more) this.bind_more_button();
		this.bind_fields_to_primary_btn();

		if(this.onload) { this.onload(this); }
		this.set_reqd_fields();
		this.bind_fields_to_primary_btn();
		this.reset_primary_btn();
	}

	// Form methods
	get_atomic_fields() {
		var fields = JSON.parse(JSON.stringify(this.fields));
		if(this.add_more) {
			this.count = 1;
			fields = fields.map((field, i) => {
				if(field.fieldname) {
					field.fieldname += '_1';
				}
				if(i === 1 && this.mandatory_entry) {
					field.reqd = 1;
				}
				if(!field.static) {
					if(field.label) field.label += ' 1';
				}
				return field;
			});
		}
		return fields;
	}

	set_reqd_fields() {
		var dict = this.form.fields_dict;
		this.reqd_fields = [];
		Object.keys(dict).map(key => {
			if(dict[key].df.reqd) {
				this.reqd_fields.push(dict[key]);
			}
		});
	}

	set_values() {
		this.values = this.form.get_values();
		if(this.values===null) {
			return false;
		}
		if(this.validate && !this.validate()) {
			return false;
		}
		return true;
	}

	bind_more_button() {
		this.$more = this.$body.find('.form-more-btn');
		this.$more.removeClass('hide')
			.on('click', () => {
				this.count++;
				var fields = JSON.parse(JSON.stringify(this.fields));
				this.form.add_fields(fields.map(field => {
					if(field.fieldname) field.fieldname += '_' + this.count;
					if(!field.static) {
						if(field.label) field.label += ' ' + this.count;
					}
					return field;
				}));
				if(this.count === this.max_count) {
					this.$more.addClass('hide');
				}
			});
	}

	// Primary button
	bind_fields_to_primary_btn() {
		var me = this;
		this.reqd_fields.map((field) => {
			field.$wrapper.on('change input', () => {
				me.reset_primary_btn();
			});
		});
	}

	reset_primary_btn() {
		var empty_fields = this.reqd_fields.filter((field) => {
			return !field.get_value();
		});
		if(empty_fields.length) {
			this.$primary_btn.addClass('disabled');
		} else {
			this.$primary_btn.removeClass('disabled');
		}
	}

	show_slide() { this.$wrapper.removeClass("hidden");}
	hide_slide() { this.$wrapper.addClass("hidden");}
};

frappe.setup.UserProgressSlide = class UserProgressSlide extends frappe.ui.Slide {
	constructor(slide = null) {
		super(slide);
	}

	make() {
		super.make();
	}

	make_primary_button() {
		this.$make = this.slides_footer.find('.make-btn')
			.attr('tabIndex', 0)
			.click(this.make_records.bind(this));
		this.$primary_btn = this.$make;
	}

	setup_done_state() {
		this.$body.find(".form-wrapper").hide();
		this.make_done_state();
		this.bind_done_state();
	}

	make_done_state() {
		this.$done_state = $(`<div class="done-state text-center">
			<p><i class="octicon octicon-check text-success" style="font-size: 30px;"></i></p>
			<p style="font-size: 16px;">${__("Completed!")}</p>
			<div class="actions">
				<div class="doctype-actions text-center hide">
					<a class="list-btn btn btn-primary btn-sm"></a>
					<a class="sec-list-btn btn btn-default btn-sm hide"></a>
					<a class="import-btn btn btn-default btn-sm"></a>
				</div>
				<div class="doc-actions text-center hide">
					<a class="doc-btn btn btn-primary btn-sm">${__("Check it out")}</a>
				</div>
			</div>
		</div>`).appendTo(this.$body);
	}

	bind_done_state() {
		if(this.doctype) {
			this.$body.find('.doctype-actions').removeClass("hide");
			this.$list = this.$body.find('.list-btn')
				.html("Go to " + this.name)
				.on('click', () => {
					frappe.set_route("List", this.doctype);
				});
			if(this.sec_doctype) {
				this.$sec_list = this.$body.find('.sec-list-btn')
					.removeClass("hide")
					.html("Go to " + this.sec_doctype + "s")
					.on('click', () => {
						frappe.set_route("List", this.sec_doctype);
					});
			}
			this.$import = this.$body.find('.import-btn')
				.html("Import " + this.name)
				.on('click', () => {
					frappe.set_route("data-import-tool");
				});
		} else if (this.route) {
			this.$body.find('.doc-actions').removeClass("hide");
			this.$doc = this.$body.find('.doc-btn').on('click', () => {
				frappe.set_route(this.route);
			});
		}
	}

	// Primary button action
	make_records() {
		var me = this;
		if(this.set_values()) {
			frappe.call({
				method: me.method,
				args: {args_data: me.values},
				callback: function() {
					me.done = 1;
					// hide Create button
					me.$primary_btn.hide();
					me.refresh();
					let completed = 0;
					me.container.slides.map((slide, i) => {
						if(me.container.slide_dict[i]) {
							if(me.container.slide_dict[i].done) completed++;
						} else {
							if(slide.done) completed++;
						}
					});
					let percent = completed * 100 / me.container.slides.length;
					$('.user-progress .progress-bar').css({'width': percent + '%'});
					if(percent === 100) {
						$(document).trigger("user-initial-setup-complete");
					}
				},
				freeze: true
			});
		}
	}
};

frappe.ui.Slides = class Slides {
	constructor({
		parent = null,
		slides = [],
		slide_class = null,
		unidirectional = 0,
		done_state = 0,
		before_load = null
	}) {
		this.parent = parent;
		this.slides = slides;
		this.slide_class = slide_class;
		this.unidirectional = unidirectional;
		this.done_state = done_state;
		this.before_load = before_load;
		this.make();
	}

	make() {
		this.container = $('<div>').addClass("slides-wrapper")
			.appendTo(this.parent);
		this.$slide_progress = $(`<div>`).addClass(`slides-progress text-center text-extra-muted`)
			.appendTo(this.container);
		this.$body = $(`<div>`).addClass(`slide-container`)
			.appendTo(this.container);
		this.$footer = $(`<div>`).addClass(`footer`)
			.appendTo(this.container);

		this.setup();

		this.render_progress_dots();
		this.make_prev_next_buttons();
		if(this.before_load) { this.before_load(this.$footer); }

		this.show_slide(0);
	}

	setup() {
		this.slide_dict = {};
		this.slides.map((slide, id) => {
			if(!this.slide_dict[id]) {
				this.slide_dict[id] = new (this.slide_class)(
					$.extend(this.slides[id], {
						parent: this.$body,
						slides_footer: this.$footer,
						render_parent_dots: this.render_progress_dots.bind(this),
						id: id,
					})
				);
				this.slide_dict[id].make();
			}
		});
	}

	refresh(id) {
		this.render_progress_dots();
		this.show_hide_prev_next(id);
		this.$body.find('.form-control').first().focus();
	}

	render_progress_dots() {
		// Depends on this.unidirectional and this.done_state
		// Can be called by a slide to update states
		this.$slide_progress.empty();

		this.slides.map((slide, id) => {
			let $dot = $(`<i class="fa fa-fw fa-circle"> </i> `)
				.attr({'data-step-id': id});

			if(this.done_state && (this.slide_dict[id] &&
				this.slide_dict[id].done || slide.done)) {
				$dot.addClass('text-success');
			}
			if((this.unidirectional && id <= this.current_id) ||
				id === this.current_id) {
				$dot.addClass('active');
			}
			// Add pointer event for non-unidirectional
			this.$slide_progress.append($dot);
		});

		if(!this.unidirectional) this.bind_progress_dots();
	}

	make_prev_next_buttons() {
		$(`<div class="row">
			<div class="col-sm-6">
				<a class="prev-btn btn btn-default btn-sm">${__("Previous")}</a>
			</div>
			<div class="col-sm-6 text-right">
				<a class="next-btn btn btn-default btn-sm">${__("Next")}</a>
			</div>
		</div>`).appendTo(this.$footer);

		this.$prev_btn = $('.footer').find('.prev-btn').attr('tabIndex', 0)
			.on('click', () => { this.show_slide(this.current_id - 1); });

		this.$next_btn = $('.footer').find('.next-btn').attr('tabIndex', 0)
			.on('click', () => { this.show_slide(this.current_id + 1); });
	}

	bind_progress_dots() {
		var me = this;
		this.$slide_progress.find('.fa-circle').on('click', function() {
			let id = $(this).attr('data-step-id');
			me.show_slide(id);
		});
	}

	show_slide(id) {
		if(this.current_slide) this.current_slide.hide_slide();
		this.current_id = id;
		this.current_slide = this.slide_dict[id];
		this.current_slide.show_slide();
		this.refresh(id);
	}

	show_hide_prev_next(id) {
		(id === 0) ?
			this.$prev_btn.hide() : this.$prev_btn.show();
		(id + 1 === this.slide_class.length) ?
			this.$next_btn.hide() : this.$next_btn.show();
	}
};

frappe.setup.UserProgressDialog  = class UserProgressDialog {
	constructor({
		slides = []
	}) {
		this.slides = slides;
		this.setup();
	}

	setup() {
		this.dialog = new frappe.ui.Dialog({title: __("Complete Setup")});
		this.slide_container = new frappe.ui.Slides({
			parent: this.dialog.body,
			slides: this.slides,
			slide_class: frappe.setup.UserProgressSlide,
			done_state: 1,
			before_load: ($footer) => {
				$footer.find('.text-right').prepend(
					$(`<a class="make-btn btn btn-primary btn-sm">
				${__("Create")}</a>`));
			}
		});
		this.make_dismiss_button();
	}

	make_dismiss_button() {
		this.dialog.set_primary_action(__('Dismiss'), () => {
			$('.user-progress').addClass('hide');
			this.dialog.hide();
		});
		this.$dismiss_button = this.dialog.header.find('.btn-primary').addClass('dismiss-btn');
		// hidden by default
		this.$dismiss_button.addClass('hide');

		$(document).on("user-initial-setup-complete", () => {
			this.show_dismiss_button();
		});
	}

	show_dismiss_button() {
		this.$dismiss_button.removeClass('hide');
	}

	show() {
		this.dialog.show();
	}
};