require(['app','api','util','cache','tplManager','moment'],
function (app,api,util,cache,tplManager,moment) {

    //
    /// Timesheets Context
    //

    var Timesheets = {

        // Item cache
        cache: {},

        timesheetsGroupByStatus: function (useCurrent) {
            var items = {
                'Current': [],
                'Unsubmitted': [],
                'Submitted': [],
                'Denied': [],
                'Approved': []
            };
            for (var id in Timesheets.cache) {
                var item = Timesheets.cache[id],
                    status = Helpers.timesheetStatusCategory(item, useCurrent);
                if (!items[status])
                    items[status] = [];
                items[status].push(item);
            }
            for (var status in items) {
                if (items[status].length == 0)
                    delete items[status];
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
            var items = {
                'unsubmitted': 0,
                'submitted': 0,
                'denied': 0,
                'approved': 0
            };
            for (var id in Timesheets.cache) {
                var item = Timesheets.cache[id];
                items[item.status]++;
            }
            for (var status in items) {
                if (items[status] == 0)
                    delete items[status];
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

        removeScheduleEvent: function (scheduleId, eventId) {
            var schedule = Timesheets.cache[scheduleId];
            if (schedule) {
                if (schedule.events) {
                    for (var i = 0; i < schedule.events.length; i++) {
                        var event = schedule.events[i];
                        if (event.id == eventId) {
                            schedule.events.splice(i, 1);
                            schedule.duration -= event.duration;
                            return true;
                        }
                    }
                }
            }
            return false;
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
                schedule.duration += event.duration;
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
    // Client Controller

    var Client = {

        //
        /// Timesheets Context
        //

        Main: {

            // Framework7 page element
            // page: null,

            init: function (page) {
                var $page = $$(page.container),
                    $nav = $$(page.navbarInnerContainer);

                Timesheets.loadSchedules({}, function() {
                    Client.Main.invalidate(page);
                });

                // Handle adding new Timesheets
                $nav.find('.new-timesheet').on('click', function () {
                    var startDate = moment().subtract(30, 'days'),
                        endDate = moment().day('Monday').add('days', 7)
                        dates = [];
                    for (var m = moment(startDate); m.isBefore(endDate); m.add(7, 'days')) {
                        dates.push({
                            start_date: m.format('YYYY-MM-DD'),
                            end_date: m.clone().add('days', 7).format('YYYY-MM-DD')
                        });
                    }
                    console.log('displaying new timesheet modal', dates);

                    var modal = app.f7.modal({
                        title: 'Select Week',
                        text: tplManager.render('timesheets_newTimesheetDateRageList', dates),
                        buttons: [
                            {
                                text: 'Done'
                            }
                        ]
                    });

                    $$(modal).find('.list-block a').click(function(event) {
                        var $link = $$(this);
                        var data = {
                            start_date: $link.data('start'),
                            end_date: $link.data('end')
                        }
                        console.log('create schedule', data);
                        api.createSchedule(data).then(function(response) {
                            console.log('created schedule', response);
                            Timesheets.addSchedule(response);
                            Client.Main.invalidate(page);
                            app.f7.closeModal();
                        });
                        return false;
                    });

                    return false;
                });
            },

            invalidate: function (page) {
                console.log('invalidating timesheets', Timesheets.timesheetsGroupByStatus())
                tplManager.renderInline('timesheets_timesheetListGroupTemplate', Timesheets.timesheetsGroupByStatus(true), page.container);
            }
        },

        //
        /// Timesheet Details
        //

        TimesheetDetails: {
            init: function (page) {
                var scheduleId = page.query.schedule_id,
                    schedule = Timesheets.cache[scheduleId],
                    $page = $$(page.container);

                Client.TimesheetDetails.invalidate(page);
            },

            cloneScheduleItem: function(page, schedule, eventToClone) {
                var currentDate = moment(schedule.start_date),
                    endDate = moment(schedule.end_date),
                    allDates = [],
                    modal;

                function copyEventForSelectedDates() {
                    var dates = app.f7.formToJSON($$(modal).find('form')).dates,
                        prevStart = moment(eventToClone.start_at),
                        prevEnd = moment(eventToClone.end_at),
                        diff = prevEnd.diff(prevStart, 'minutes');

                    for (var i = 0; i < dates.length; i++) {
                        var newDate = moment(dates[i]),
                            newContext = {
                              'year': newDate.get('year'),
                              'month': newDate.get('month') + 1,
                              'date': newDate.get('date')
                            };

                        // diff two dates, change date part of timestamp,
                        // and add diff to end date
                        var data = Object.assign({}, eventToClone, {
                          start_at: prevStart.clone().set(newContext).format(),
                          end_at: prevStart.clone().set(newContext).add(diff, 'minutes').format()
                        })

                        console.log('cloning schedule item', data)
                        api.createEvent(data).then(function(response) {
                            Timesheets.addScheduleEvent(schedule.id, response);
                            Client.TimesheetDetails.invalidate(page);
                        });
                    }
                }

                while(currentDate.add(1, 'day') < endDate) {
                    allDates.push(currentDate.format('YYYY-MM-DD'));
                }
                modal = app.f7.modal({
                    title: 'Choose Dates',
                    text: tplManager.render('timesheets_copyItemDateList', allDates),
                    buttons: [
                        { text: 'Cancel' },
                        { text: 'Done', onClick: copyEventForSelectedDates }
                    ]
                });
            },

            invalidate: function(page) {
                var scheduleId = page.query.schedule_id,
                    schedule = Timesheets.cache[scheduleId],
                    $page = $$(page.container);

                tplManager.renderInline('timesheets_timesheetDetailsTemplate', schedule, $page);
                tplManager.renderInline('timesheets_itemListTemplate', schedule.events, $page);

                $page.find('a[data-interaction]').click(function() {
                    var $link = $$(this),
                        interaction = $link.data('interaction'),
                        eventId = $link.data('event-id');
                    if (interaction == 'copy-event') {
                        var event = Timesheets.getScheduleEvent(scheduleId, eventId);
                        Client.TimesheetDetails.cloneScheduleItem(page, schedule, event);
                    }
                    else if (interaction == 'delete-event') {
                        api.deleteEvent(eventId).then(function(response) {
                            Timesheets.removeScheduleEvent(scheduleId, eventId);
                            Client.TimesheetDetails.invalidate(page);
                        });
                    }
                });
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

                // Initialize the object on creation
                if (!item) {
                    item = {
                        resource_type: 'Schedule',
                        resource_id: page.query.schedule_id
                    };
                }

                console.log('init item form', page, item);

                tplManager.renderInline('timesheets_itemFormTemplate', item, $page);

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
                data.kind = 'shift';
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

                // NOTE: Disabling attendances/item timeline for now
                // api.getEventAttendances(item.id, {}).then(function(response) {
                //     console.log('loaded item attendances', response)
                //     tplManager.renderInline('timesheets_attendanceListTemplate', response, $page);
                // });
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
    // Manager Controller

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
    // Helpers

    var Helpers = {
        timesheetStatusCategory: function (timesheet, useCurrent) {
            switch (timesheet.status) {
                case 'unsubmitted':
                    if (useCurrent && timesheet.endAt > (new Date()))
                        return 'Current';
                    return 'Unsubmitted';
                case 'submitted':
                    return 'Submitted';
                case 'approved':
                    return 'Approved';
                case 'denied':
                    return 'Denied';
            }
            alert('Invalid timesheet status: ' + timesheet.status);
        },

        timesheetStatus: function (timesheet) { //, useNew
            switch (timesheet.status) {
                case 'unsubmitted':
                    // if (useNew && timesheet.endAt > (new Date()))
                    //     return 'New';
                    return 'New';
                case 'submitted':
                    return 'Pending Approval';
                case 'approved':
                    return 'Approved';
                case 'denied':
                    return 'Denied';
            }
            alert('Invalid timesheet status: ' + timesheet.status);
        }
    }

    //
    /// Template7 Helpers
    //

    app.t7.registerHelper('timesheets_timesheetStatus', function (timesheet) {
        return Helpers.timesheetStatus(timesheet);
    });

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
    // Tests

    //
    /// Test Fixtures
    //

    var Fixtures = {
        create: function () {
            console.log('creating schedule fixtures')

            var now = moment(),
                startDate = now.clone().startOf('day').subtract(100, 'days'),
                endDate = now.clone().startOf('day'),
                currDate = startDate.clone().startOf('day');

            // Loop weeks for the last 100 days
            while(currDate.add(7, 'days') < endDate) {
                var startWeekDate = currDate.clone(),
                    endWeekDate = currDate.clone().add('days', 7);
                var data = {
                    start_date: startWeekDate.format('D/M/YYYY'),
                    end_date: endWeekDate.format('D/M/YYYY')
                }
                console.log('create schedule', data);
                api.createSchedule(data).then(function(response) {
                    console.log('created schedule', response);

                    // Create shift event every two days
                    while(startWeekDate.add(2, 'days') < endWeekDate) {
                        var eventData = {
                            title: 'Bartender',
                            location: 'Sydney',
                            start_at: startWeekDate.format(),
                            end_at: startWeekDate.clone().add('hours', 8.2).format(),
                            resource_id: response.id,
                            resource_type: 'Schedule',
                            kind: 'Shift'
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
