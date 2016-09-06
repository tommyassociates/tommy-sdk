require(['app','api','util','cache','addons','tplManager'],
function (app,api,util,cache,addons,tplManager) {

    //
    /// Main Calendar Widget
    //

    var Calendar = {

        // Event cache
        cache: {},

        // Framework7 calendar widget
        widget: null,

        // The current selected date
        selectedDate: null,

        init: function (page) {
            var $page = $$(page.container),
                now = new Date();

            console.log('calendar initialize');
            // if (Calendar.widget) {
            //     console.log('calendar already initialized');
            //     Calendar.loadCurrentMonthAndSelectToday();
            //     return;
            // }

            Calendar.widget = app.f7.calendar({
                container: $page.find('#calendar_container'),
                value: [now],
                weekHeader: false,
                toolbarTemplate:
                    '<div class="toolbar calendar-custom-toolbar">' +
                        '<div class="toolbar-inner">' +
                            '<div class="left">' +
                                '<a href="#" class="link icon-only"><i class="material-icons">keyboard_arrow_left</i></a>' +
                            '</div>' +
                            '<div class="center"></div>' +
                            '<div class="right">' +
                                '<a href="#" class="link icon-only"><i class="material-icons">keyboard_arrow_right</i></a>' +
                            '</div>' +
                        '</div>' +
                    '</div>',
                onOpen: function (p) {
                    $page.find('.calendar-custom-toolbar .center').text(util.monthNames[p.currentMonth] +', ' + p.currentYear);
                    $page.find('.calendar-custom-toolbar .left .link').on('click', function () {
                        // Calendar.widget
                        p.prevMonth();
                    });
                    $page.find('.calendar-custom-toolbar .right .link').on('click', function () {
                        // Calendar.widget
                        p.nextMonth();
                    });
                    // setTimeout(Calendar.loadCurrentMonthAndSelectToday)
                    // Calendar.selectDay(year, month, day);

                    var year = p.currentYear,
                        month = p.currentMonth;

                    // Load events for the current month
                    if (!Calendar.eventsForDate(year, month).length) {
                        Calendar.loadMonth(year, month, function (res) {

                            // Select the current day
                            Calendar.selectDay(year, month, now.getDate());
                            // Calendar.getDayElement(year, month, now.getDate()).trigger('click');
                        });
                    }

                },
                onDayClick: function (p, dayContainer, year, month, day) {
                    console.log('onDayClick', p, dayContainer, year, month, day);
                    // calendarLoadDate(p.currentYear, p.currentMonth, p.currentDay);

                    Calendar.selectDay(year, month, day);
                },
                onMonthYearChangeStart: function (p, year, month) {
                    console.log('onMonthYearChangeStart', p, year, month)
                    $page.find('.calendar-custom-toolbar .center').text(util.monthNames[month] +', ' + year);
                    if (!Calendar.eventsForDate(year, month).length) {
                        Calendar.loadMonth(year, month);
                    }
                }
            });
        },

        uninit: function () {
            console.log('calendar uninitialize');
            Calendar.cache = {};
        },

        invalidate: function () {
            console.log('calendar invalidate');

            $$(Calendar.widget.container).find('.picker-calendar-day').removeClass('has-events');
            for (var id in Calendar.cache) {
                var event = Calendar.cache[id];
                Calendar.getDayElement(event.year, event.month, event.startDay).addClass('has-events');

                // TODO: Add event to days between start and end
                if (event.startDay != event.endDay) {
                    Calendar.getDayElement(event.year, event.month, event.endDay).addClass('has-events');
                }
            }

            // Calendar.selectCurrentDay();
        },

        // loadCurrentMonthAndSelectToday: function () {
        //     console.log('calendar loadCurrentMonthAndSelectToday', Calendar.widget);
        //     var year = Calendar.widget.currentYear,
        //         month = Calendar.widget.currentMonth,
        //         day = (new Date()).getDate();
        //
        //     Calendar.loadMonth(year, month, function (res) {
        //         Calendar.selectDay(year, month, day);
        //     });
        // },

        getDayElement: function (year, month, day) {
            return $$(Calendar.widget.container).find('[data-year="' + year + '"][data-month="' + month + '"][data-day="' + day + '"]');
        },

        eventsForDate: function (year, month, day) {
            var events = [];
            for (var id in Calendar.cache) {
                var event = Calendar.cache[id];
                if (event.year == year &&
                    event.month == month &&
                    (event.startDay == day || event.endDay == day || !day)) {
                    events.push(event);
                }
            }
            return events;
        },

        addEvent: function (event) {
            event.startAt = new Date(event.start_at);
            event.year = event.startAt.getFullYear();
            event.month = event.startAt.getMonth();
            // event.zeroMonth = event.startAt.getMonth() - 1; // zero based month index for JS
            event.startDay = event.startAt.getDate();
            if (event.end_at) {
                event.endAt = new Date(event.end_at);
                event.endDay = event.endAt.getDate();
            }

            console.log('event added', event)
            Calendar.cache[event.id] = event;
        },

        loadMonth: function (year, month, callback) {
            if (month)
                month += 1;

            var params = { year: year, month: month };

            // Always query actor events at user scope for now
            params.actor_id = addons.currentActorID();
            params.user_id = addons.currentActorOrUserID();
            params.resource_type = 'AddonInstall';
            params.resource_id = addons.currentAddon().addon_install_id;

            console.log('load events', params);

            api.getEvents(params).then(function (res) {
                console.log('events response', res);
                if (res.length) {
                    for (var i = 0; i < res.length; i++) {
                        Calendar.addEvent(res[i]);
                    }
                }
                if (callback)
                    callback(res);

                Calendar.invalidate();
            });
        },

        selectCurrentDay: function () {
            if (Calendar.selectedDate) {
                Calendar.selectDay(
                    Calendar.selectedDate.getFullYear(),
                    Calendar.selectedDate.getMonth(),
                    Calendar.selectedDate.getDate()
                );
            }
        },

        selectDay: function (year, month, day) {
            var context = {
                date: new Date(year, month, day),
                events: Calendar.eventsForDate(year, month, day)
            };

            tplManager.renderTarget('calendar_eventListTemplate', context, '#calendar_events');

            // Set the `selectedDate` for `selectCurrentDay()` calls
            Calendar.selectedDate = new Date(year, month, day);
        }
    };

    //
    /// Event Form
    //

    var EventForm = {

        init: function(page) {
            var event = Calendar.cache[page.query.event_id] || {},
                $page = $$(page.container),
                $nav = $$(page.navbarInnerContainer);

            tplManager.renderTarget('calendar_eventFormTemplate', event, $page.find('.page-content'));

            // console.log('init event form', page, $nav.find('a.save').length);

            $nav.find('a.save').on('click', function (ev) {
                var data = app.f7.formToJSON($page.find('form'));
                EventForm.saveEvent(data);
                ev.preventDefault();
            });

            // $form = $page.find('form');
            // $form.on('submit', function (ev) {
            //     var data = app.f7.formToJSON($form);
            //     saveEvent(data);
            //     ev.preventDefault();
            // });

            EventForm.createDatePicker($page.find('input[name="start_at"]'), event.startAt || new Date);
            EventForm.createDatePicker($page.find('input[name="end_at"]'), event.endAt || event.startAt || new Date);
            EventForm.createReminderWidget($page.find('.reminder'));
        },

        createReminderWidget: function($element) {
            var picker = app.f7.picker({
                input: $element.find('input[name="reminder_display"]'),
                rotateEffect: true,
                inputReadOnly: true,
                onChange: function (p, values, displayValues) {
                    // console.log('set reminder', values, displayValues)
                    $element.find('input[name="reminder"]').val(values[0]);
                    $element.addClass('has-reminder');
                },
                formatValue: function (p, values, displayValues) {
                    return displayValues[0];
                },
                cols: [
                    {
                        textAlign: 'center',
                        values: [10, 15, 30, 60, 90, 120],
                        displayValues: ['10 minutes before', '15 minutes before', '30 minutes before', '1 hour before', '1.5 hours before', '2 hours before']
                    }
                ]
            });

            $element.find('.reminder-add').click(function (event) {
                picker.open();
                event.preventDefault();
            });

            $element.find('.reminder-delete').click(function (event) {
                $element.find('input[name="reminder"]').val('');
                $element.find('input[name="reminder_display"]').val('');
                $element.removeClass('has-reminder');
                event.preventDefault();
            });

            if ($element.find('input[name="reminder"]').val()) {
                $element.addClass('has-reminder');
            }
        },

        createDatePicker: function($input, initialDate) {
            return app.f7.picker({
                input: $input,
                rotateEffect: true,
                inputReadOnly: true,
                value: [initialDate.getMonth(), initialDate.getDate(), initialDate.getFullYear(), initialDate.getHours(), (initialDate.getMinutes() < 10 ? '0' + initialDate.getMinutes() : initialDate.getMinutes())],
                onChange: function (picker, values, displayValues) {
                    var daysInMonth = new Date(picker.value[2], picker.value[0]*1 + 1, 0).getDate();
                    if (values[1] > daysInMonth) {
                        picker.cols[1].setValue(daysInMonth);
                    }
                },
                formatValue: function (p, values, displayValues) {
                    if (!displayValues.length) {
                        return $input.val();
                    }
                    return displayValues[0] + ' ' + values[1] + ', ' + values[2] + ' ' + values[3] + ':' + values[4];
                },
                cols: [
                    // Months
                    {
                        values: ('0 1 2 3 4 5 6 7 8 9 10 11').split(' '),
                        displayValues: util.monthNames, //('January February March April May June July August September October November December').split(' '),
                        textAlign: 'left'
                    },
                    // Days
                    {
                        values: [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31],
                    },
                    // Years
                    {
                        values: (function () {
                            var arr = [];
                            for (var i = 1950; i <= 2030; i++) { arr.push(i); }
                            return arr;
                        })(),
                    },
                    // Space divider
                    {
                        divider: true,
                        content: '  '
                    },
                    // Hours
                    {
                        values: (function () {
                            var arr = [];
                            for (var i = 0; i <= 23; i++) { arr.push(i); }
                            return arr;
                        })(),
                    },
                    // Divider
                    {
                        divider: true,
                        content: ':'
                    },
                    // Minutes
                    {
                        values: (function () {
                            var arr = [];
                            for (var i = 0; i <= 59; i++) { arr.push(i < 10 ? '0' + i : i); }
                            return arr;
                        })(),
                    }
                ]
            });
        },

        saveEvent: function(data) {
            data.start_at = new Date(data.start_at).toUTCString();
            if (data.end_at && data.end_at.length)
                data.end_at = new Date(data.end_at).toUTCString();

            // For now always save events at actor user scope.
            // Later we may also save account events.
            data.actor_id = addons.currentActorID();
            data.user_id = addons.currentActorOrUserID();
            // data.account_type = 'User';
            // data.account_id = addons.currentActorOrUserID();
            data.resource_type = 'AddonInstall';
            data.resource_id = addons.currentAddon().addon_install_id;
            console.log('save event', data);

            if (data.id) {
                api.updateEvent(data.id, data).then(EventForm.onSave);
            }
            else {
                api.createEvent(data).then(EventForm.onSave);
            }
        },

        onSave: function(res) {
            console.log('event saved', res);
            Calendar.addEvent(res);
            app.f7view.router.back();
        }
    }

    //
    /// Event Details
    //

    var EventDetails = {
        init: function (page) {
            var event = Calendar.cache[page.query.event_id],
                $page = $$(page.container);

            tplManager.renderTarget('calendar_eventDetailsTemplate', event, $page.find('.page-content'));
        }
    }

    //
    /// Router
    //

    //
    /// Calendar

    app.f7.onPageInit('calendar_main', Calendar.init);
    app.f7.onPageBack('calendar_main', Calendar.uninit);
    app.f7.onPageAfterAnimation('calendar_main', Calendar.invalidate);

    //
    /// Event Form

    app.f7.onPageInit('calendar_new-event', EventForm.init);
    app.f7.onPageInit('calendar_edit-event', EventForm.init);

    //
    /// Event Details

    app.f7.onPageInit('calendar_event-details', EventDetails.init);
    app.f7.onPageAfterAnimation('calendar_event-details', EventDetails.init);

    //
    /// Template7 Helpers
    //

    app.t7.registerHelper('calendar_listHeadingDate', function (date) {
        if (!date) return '';
        return (util.dayNames[date.getDay()] + ', ' + util.monthNames[date.getMonth()] + ' ' + date.getDate());
    });

    app.t7.registerHelper('calendar_humanizeMinutes', function (value) {
        if (value > 60) {
            var text = '',
                hours,
                minutes;
            hours = Math.trunc(value / 60);
            minutes = value % 60;
            text += (hours + ' hours');
            if (minutes > 0) {
                text += (' and ' + minutes + ' minutes');
            }
            return text;
        }
        else {
            return value + ' minutes';
        }
    });
});
