require(['app','api','util','cache','tplManager','moment'],
function (app,api,util,cache,tplManager,moment) {

    //
    /// Timesheets Context
    //

    var Timesheets = {

        // Item cache
        cache: {},

        timesheetsGroupByStatus: function () {
            var items = {};
            for (var id in Timesheets.cache) {
                var item = Timesheets.cache[id],
                    status = util.capitalize(item.status);
                if (item.endAt > (new Date()))
                    status = 'Current';
                if (!items[status])
                    items[status] = [];
                items[status].push(item);
                // if (item.year == year &&
                //     item.month == month &&
                //     (item.startDay == day || item.endDay == day || !day)) {
                //     items.push(item);
                // }
            }
            return items;
        },

        timesheetsFilterByStatus: function (status) {
            var items = [];
            for (var id in Timesheets.cache) {
                var item = Timesheets.cache[id];
                if (item.status == status)
                    items.push(item);
            }
            return items;
        },

        timesheetsStatusCounts: function () {
            var items = {};
            for (var id in Timesheets.cache) {
                var item = Timesheets.cache[id];
                if (!items[item.status])
                    items[item.status] = { count: 0 };
                items[item.status].count++;
            }
            return items;
        },

        getScheduleEvent: function (scheduleId, eventId) {
            var schedule = Timesheets.cache[scheduleId];
            if (schedule) {
                if (schedule.events) {
                    for (var i = 0; i < schedule.events.length; i++) {
                        var event = schedule.events[i];
                        if (event.id == eventId) {
                            return event;
                        }
                    }
                }
            }
        },

        addScheduleEvent: function (scheduleId, event) {
            var schedule = Timesheets.cache[scheduleId];
            if (schedule) {
                if (schedule.events) {
                    for (var i = 0; i < schedule.events.length; i++) {
                        if (schedule.events[i].id == event.id) {
                            schedule.events[i] = event;
                            return;
                        }
                    }
                }
                else {
                    schedule.events = [];
                }
                event = Timesheets.coerceScheduleEvent(event);
                schedule.events.push(event);
            }
            else {
                alert('Cannot add event for unknown schedule ' + scheduleId);
            }
        },

        addSchedule: function (item) {
            item = Timesheets.coerceSchedule(item);
            Timesheets.cache[item.id] = item;
            console.log('item added', item)
        },

        addSchedules: function (items) {
            if (items && items.length) {
                for (var i = 0; i < items.length; i++) {
                    Timesheets.addSchedule(items[i]);
                }
            }
        },

        loadSchedules: function (params, callback) { //year, month,
            console.log('load timesheets', params);

            api.getSchedules(params).then(function (res) { // year: year, month: month
                console.log('items response', res);
                Timesheets.addSchedules(res);

                if (callback)
                    callback(res);
            });
        },

        coerceSchedule: function (item) {
            item.startAt = new Date(item.start_date);
            item.startDay = item.startAt.getDate();
            if (item.end_date) {
                item.endAt = new Date(item.end_date);
                item.endDay = item.endAt.getDate();
            }

            if (item.events && item.events.length) {
                for (var i = 0; i < item.events.length; i++) {
                    item.events[i] = Timesheets.coerceScheduleEvent(item.events[i]);
                }
            }

            return item;
        },

        coerceScheduleEvent: function (item) {
            item.startAt = new Date(item.start_at);
            item.startDay = item.startAt.getDate();
            if (item.end_at) {
                item.endAt = new Date(item.end_at);
                item.endDay = item.endAt.getDate();
            }

            return item;
        }
    };

    // -------------------------------------------------------------------------
    // CLIENT

    var Client = {

        //
        /// Timesheets Context
        //

        Main: {

            // Framework7 page element
            // page: null,

            init: function (page) {
                // Client.Main.page = page;
                Timesheets.loadSchedules({}, function() {
                    Client.Main.invalidate(page);
                });
            },

            invalidate: function (page) {
                console.log('invalidating timesheets', Timesheets.timesheetsGroupByStatus())
                tplManager.renderInline('timesheets_timesheetListGroupTemplate', Timesheets.timesheetsGroupByStatus(), page.container);
            }
        },

        //
        /// Timesheet Details
        //

        TimesheetDetails: {
            init: function (page) {
                var item = Timesheets.cache[page.query.schedule_id],
                    $page = $$(page.container);

                tplManager.renderInline('timesheets_timesheetDetailsTemplate', item, $page);
                tplManager.renderInline('timesheets_itemListTemplate', item.events, $page);
            }
        },

        //
        /// Item Form
        //

        ItemForm: {

            init: function(page) {
                var item = Timesheets.getScheduleEvent(page.query.schedule_id, page.query.event_id), //cache[page.query.event_id] || {},
                    $page = $$(page.container),
                    $nav = $$(page.navbarInnerContainer),
                    $form;

                console.log('init item form', page, item);

                tplManager.renderTarget('timesheets_itemFormTemplate', item, $page.find('.page-content'));

                // $nav.find('a.save').on('click', function (ev) {
                //     var data = app.f7.formToJSON($page.find('form'));
                //     Client.ItemForm.saveItem(data);
                //     ev.preventDefault();
                // });

                $form = $page.find('form');
                $form.on('submit', function (ev) {
                    var data = app.f7.formToJSON($form);
                    Client.ItemForm.saveItem(data);
                    ev.preventDefault();
                });

                Client.ItemForm.createDatePicker($page.find('input[name="start_at"]'), item.startAt || new Date);
                Client.ItemForm.createDatePicker($page.find('input[name="end_at"]'), item.endAt || item.startAt || new Date);
                // Client.ItemForm.createReminderWidget($page.find('.reminder'));
            },

            // createReminderWidget: function($element) {
            //     var picker = app.f7.picker({
            //         input: $element.find('input[name="reminder_display"]'),
            //         rotateEffect: true,
            //         inputReadOnly: true,
            //         onChange: function (p, values, displayValues) {
            //             // console.log('set reminder', values, displayValues)
            //             $element.find('input[name="reminder"]').val(values[0]);
            //             $element.addClass('has-reminder');
            //         },
            //         formatValue: function (p, values, displayValues) {
            //             return displayValues[0];
            //         },
            //         cols: [
            //             {
            //                 textAlign: 'center',
            //                 values: [10, 15, 30, 60, 90, 120],
            //                 displayValues: ['10 minutes before', '15 minutes before', '30 minutes before', '1 hour before', '1.5 hours before', '2 hours before']
            //             }
            //         ]
            //     });
            //
            //     $element.find('.reminder-add').click(function (item) {
            //         picker.open();
            //         item.preventDefault();
            //     });
            //
            //     $element.find('.reminder-delete').click(function (item) {
            //         $element.find('input[name="reminder"]').val('');
            //         $element.find('input[name="reminder_display"]').val('');
            //         $element.removeClass('has-reminder');
            //         item.preventDefault();
            //     });
            //
            //     if ($element.find('input[name="reminder"]').val()) {
            //         $element.addClass('has-reminder');
            //     }
            // },

            createDatePicker: function($input, initialDate) {
                console.log('create date picker', initialDate.getMonth(), initialDate.getDate(), initialDate.getFullYear(), initialDate.getHours(), (initialDate.getMinutes() < 10 ? '0' + initialDate.getMinutes() : initialDate.getMinutes()))
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

            saveItem: function(data) {
                data.start_at = new Date(data.start_at).toUTCString();
                if (data.end_at && data.end_at.length)
                    data.end_at = new Date(data.end_at).toUTCString();
                console.log('save item', data);

                if (data.id) {
                    api.updateEvent(data.id, data).then(Client.ItemForm.onSave);
                }
                else {
                    api.createEvent(data).then(Client.ItemForm.onSave);
                }
            },

            onSave: function(res) {
                console.log('item saved', res);
                Timesheets.addScheduleEvent(res.resource_id, res);
                app.f7view.router.back();
            }
        },

        //
        /// Item Details
        //

        ItemDetails: {
            init: function (page) {
                var item = Timesheets.getScheduleEvent(page.query.schedule_id, page.query.event_id),
                    $page = $$(page.container);

                console.log('show item details', page.query, item, Timesheets.cache)

                tplManager.renderInline('timesheets_itemDetailsTemplate', item, $page);

                api.getEventAttendances(item.id, {}).then(function(response) {
                    console.log('loaded item attendances', response)
                    tplManager.renderInline('timesheets_attendanceListTemplate', response, $page);
                });
            }
        }
    }

    //
    /// Router
    //

    //
    /// Client Main

    app.f7.onPageInit('timesheets_main', Client.Main.init);
    app.f7.onPageAfterAnimation('timesheets_main', Client.Main.invalidate);

    //
    /// Timesheet Details

    app.f7.onPageInit('timesheets_timesheet-details', Client.TimesheetDetails.init);
    app.f7.onPageAfterAnimation('timesheets_timesheet-details', Client.TimesheetDetails.init);

    //
    /// Item Form

    app.f7.onPageInit('timesheets_new-item', Client.ItemForm.init);
    app.f7.onPageInit('timesheets_edit-item', Client.ItemForm.init);

    //
    /// Item Details

    app.f7.onPageInit('timesheets_item-details', Client.ItemDetails.init);
    app.f7.onPageAfterAnimation('timesheets_item-details', Client.ItemDetails.init);


    // -------------------------------------------------------------------------
    // MANAGER

    var Manager = {

        Main: {

            init: function (page) {
                Timesheets.loadSchedules({}, function() {
                    Manager.Main.invalidate(page);
                });
            },

            invalidate: function (page) {
                console.log('invalidating manager timesheets', Timesheets.timesheetsStatusCounts())
                tplManager.renderInline('timesheets_managerTimesheetStatusListTemplate', Timesheets.timesheetsStatusCounts(), page.container);
            },
        },

        ModerateTimesheets: {

            init: function (page) {
                var items = Timesheets.timesheetsFilterByStatus(page.query.status),
                    $page = $$(page.container);
                console.log('manager moderate timesheets', items)
                tplManager.renderInline('timesheets_timesheetManagerApprovalListTemplate', items, $page);

                $page.find('a[data-status]').click(function(event) {
                    var $link = $$(this);
                    api.updateSchedulesStatus([ $link.data('schedule-id') ], $link.data('status')).then(function(response) {
                        console.log('save approved timesheets response', response);
                        Timesheets.addSchedules(response);
                        $link.parents('li.swipeout').remove();
                    });
                });
            },

            // invalidate: function (page) {
            //     console.log('invalidating manager timesheets', Timesheets.timesheetsStatusCounts())
            //     tplManager.renderInline('timesheets_managerTimesheetStatusListTemplate', Timesheets.timesheetsStatusCounts(), page.container);
            // },
        },

        ApproveTimesheets: {

            init: function (page) {
                var items = Timesheets.timesheetsFilterByStatus(page.query.status),
                    $page = $$(page.container),
                    $form;

                console.log('manager approve timesheets', items)
                tplManager.renderInline('timesheets_timesheetListSelectTemplate', items, $page);

                $form = $page.find('form');
                $form.submit(function(event) {
                    var values = app.f7.formToJSON($form);
                    console.log('save approved timesheets', values);
                    api.updateSchedulesStatus(values['schedule_ids[]'], 'approved').then(function(response) {
                        console.log('save approved timesheets response', response);
                        Timesheets.addSchedules(response);
                        app.f7view.router.back();
                    })
                    return false;
                });
            },

            // invalidate: function (page) {
            //     console.log('invalidating manager timesheets', Timesheets.timesheetsStatusCounts())
            //     tplManager.renderInline('timesheets_managerTimesheetStatusListTemplate', Timesheets.timesheetsStatusCounts(), page.container);
            // },
        },

        // timesheet-approval-form
    }

    //
    /// Timesheets

    app.f7.onPageInit('timesheets_manager', Manager.Main.init);
    app.f7.onPageAfterAnimation('timesheets_manager', Manager.Main.invalidate);

    //
    /// Moderate Timesheets

    app.f7.onPageInit('timesheets_moderate-timesheets', Manager.ModerateTimesheets.init);
    app.f7.onPageAfterAnimation('timesheets_moderate-timesheets', Manager.ModerateTimesheets.init);

    //
    /// Approve Timesheets

    app.f7.onPageInit('timesheets_approve-timesheets', Manager.ApproveTimesheets.init);
    app.f7.onPageAfterAnimation('timesheets_approve-timesheets', Manager.ApproveTimesheets.init);


    // -------------------------------------------------------------------------
    // HELPERS

    //
    /// Template7 Helpers
    //

    app.t7.registerHelper('timesheets_itemDurationIcon', function (seconds) {
        var text = '',
            data = util.minutesToHoursAndMinutes(seconds / 60);
        // if (value > 0) {
        //     value /= 60; // secs to minutes
        //     if (value > 60) {
        //         hours = Math.trunc(value / 60);
        //         minutes = value % 60;
        //     }
        //     else {
        //         minutes = value;
        //     }
        // }
        text += ('<span class="hours">' + data.hours + 'h</span>');
        // if (minutes > 0) {
            text += ('<small class="minutes">' + data.minutes + 'm</small>');
        // }
        return text;
    });

    app.t7.registerHelper('timesheets_itemDurationHours', function (seconds) {
        var data = util.minutesToHoursAndMinutes(seconds / 60);
        if (data.minutes < 10) {
            data.minutes = '0' + data.minutes;
        }
        return data.hours + ':' + data.minutes;
    });


    app.t7.registerHelper('timesheets_humanizeMinutes', function (minutes) {
        var text = '',
            data = util.minutesToHoursAndMinutes(minutes);
        if (data.minutes > 60) {
            // var text = ''; //,
                // hours,
                // minutes;
            // hours = Math.trunc(value / 60);
            // minutes = value % 60;
            text += (data.hours + ' hours');
            if (data.minutes > 0) {
                text += (' and ' + data.minutes + ' minutes');
            }
        }
        else {
            text += (data.minutes + ' minutes');
        }
        return text;
    });


    // -------------------------------------------------------------------------
    // TESTS

    //
    /// Test Fixtures
    //

    var Fixtures = {
        create: function () {
            console.log('creating schedule fixtures')

            // loop weeks for the next 100 days

            var now = moment(),
                startDate = now.clone().startOf('day').subtract(100, 'days'),
                endDate = now.clone().startOf('day'),
                currDate = startDate.clone().startOf('day');

            // console.log('DIFF', startDate.format('M/D/YYYY'), endDate.format('M/D/YYYY'), currDate.format('M/D/YYYY'), currDate.add('days', 1).diff(endDate));
            while(currDate.add(7, 'days').diff(endDate) < 0) {
                var startWeekDate = currDate.clone(),
                    endWeekDate = currDate.clone().add('days', 7);
                var data = {
                    start_date: startWeekDate.format('D/M/YYYY'),
                    end_date: endWeekDate.format('D/M/YYYY')
                }
                console.log('create schedule', data);
                api.createSchedule(data).then(function(response) {
                    console.log('created schedule', response);

                    // create shift event every two days
                    while(startWeekDate.add(2, 'days').diff(endWeekDate) < 0) {
                        var eventData = {
                            title: 'Bartender',
                            location: 'Sydney',
                            start_at: startWeekDate.format(),
                            end_at: startWeekDate.clone().add('hours', 8.2).format(),
                            resource_id: response.id,
                            resource_type: 'Schedule'
                        }
                        console.log('create event', eventData);
                        api.createEvent(eventData).then(function(eventResponse) {
                            console.log('created event', eventResponse);
                        });
                        // return;
                    }
                });
                // return;
            }
        }
    }

    // Fixtures.create();
});
