(function(T) {
    var $page = $$('div.page[data-page="calendar_main"]'),
        basePath = $page.data('path'),
        dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August' , 'September' , 'October', 'November', 'December'],
        eventCache = {},
        calendar,
        today = new Date();

    // Initialize the Calendar widget
    calendar = T.env.f7App.calendar({
        container: $page.find('#calendar_container'),
        value: [today],
        weekHeader: false,
        toolbarTemplate:
            '<div class="toolbar calendar-custom-toolbar">' +
                '<div class="toolbar-inner">' +
                    '<div class="left">' +
                        '<a href="#" class="link icon-only"><i class="icon icon-back"></i></a>' +
                    '</div>' +
                    '<div class="center"></div>' +
                    '<div class="right">' +
                        '<a href="#" class="link icon-only"><i class="icon icon-forward"></i></a>' +
                    '</div>' +
                '</div>' +
            '</div>',
        onOpen: function(p) {
            $page.find('.calendar-custom-toolbar .center').text(monthNames[p.currentMonth] +', ' + p.currentYear);
            $page.find('.calendar-custom-toolbar .left .link').on('click', function () {
                calendar.prevMonth();
            });
            $page.find('.calendar-custom-toolbar .right .link').on('click', function () {
                calendar.nextMonth();
            });
            loadMonth(p.currentYear, p.currentMonth, function(err, res) {
                // console.log('!!!!!!!selectDay', p, p.currentYear, p.currentMonth, p.currentDay)
                selectDay(p.currentYear, p.currentMonth, today.getDate());
            });
        },
        onDayClick: function (p, dayContainer, year, month, day) {
            //console.log('onDayClick', p, dayContainer, year, month, day);
            // calendarLoadDate(p.currentYear, p.currentMonth, p.currentDay);
            selectDay(year, month, day);
        },
        onMonthYearChangeStart: function(p, year, month) {
            console.log('onMonthYearChangeStart', p, year, month)
            $page.find('.calendar-custom-toolbar .center').text(monthNames[month] +', ' + year);
            if (!eventsForDate(year, month).length) {
                loadMonth(year, month);
            }
        }
    });

    // $page.find('a[data-load-template]').click(function() {
    //     var $e = $$(this),
    //         template = $e.data('load-template');
    //     var compiledTemplate = Template7.compile($$('#' + template).html());
    //     // var html = compiledTemplate(context);
    //     T.env.f7View.router.load({
    //       template: compiledTemplate, //Template7.templates[template],
    //       context: {}
    //     });
    //     return false;
    // });

    // function eventsForMonth(year, month) {
    //     if (eventCache[year] &&
    //         eventCache[year][month] &&
    //         eventCache[year][month].all) {
    //         return eventCache[year][month].all;
    //     }
    //     return [];
    // }

    function getDayElement(year, month, day) {
        return $$(calendar.container).find('[data-year="' + year + '"][data-month="' + month + '"][data-day="' + day + '"]');
    }

    function eventsForDate(year, month, day) {
        var events = [];
        for (id in eventCache) {
            var event = eventCache[id];
            if (event.year == year &&
                event.month == month &&
                (event.startDay == day || event.endDay == day || !day)) {
                events.push(event);
            }
            // itemRows += '<div class="item-text">' + item.text + '</div>';
        }
        // if (eventCache[year] &&
        //     eventCache[year][month] &&
        //     eventCache[year][month][day] &&
        //     eventCache[year][month][day].length) {
        //     return eventCache[year][month][day];
        // }
        return events;
    }

    function addEvent(event) {
        event.startAt = new Date(event.start_at);
        event.year = event.startAt.getFullYear();
        event.month = event.startAt.getMonth();
        event.startDay = event.startAt.getDate();

        if (event.end_at) {
            event.endAt = new Date(event.end_at);
            event.endDay = event.endAt.getDate();
        }
        // var year = item.startAt.getFullYear(),
        //     month = item.startAt.getMonth(),
        //     startDay = item.startAt.getDate(),
        //     endDay = item.endAt.getDate();

        //console.log('insert calendar event', year, month, startDay, endDay, item);

        eventCache[event.id] = event;
        // if (!eventCache[year])
        //     eventCache[year] = {};
        // if (!eventCache[year][month])
        //     eventCache[year][month] = { all: [] };
        // if (!eventCache[year][month][startDay])
        //     eventCache[year][month][startDay] = [];
        // eventCache[year][month].all.push(item);
        // eventCache[year][month][startDay].push(item);
        getDayElement(event.year, event.month, event.startDay).addClass('has-events');

        // TODO: Add event to days between start and end
        if (event.startDay != event.endDay) {
            // if (!eventCache[year][month][endDay])
            //     eventCache[year][month][endDay] = [];
            // eventCache[year][month][endDay].push(item);
            getDayElement(event.year, event.month, event.endDay).addClass('has-events');
        }
    }

    function loadMonth(year, month, callback) {
        //console.log('events load', year, month);
        T.env.f7App.showPreloader('Loading Events...');

        T.api.get('/events', { year: year, month: month }, function(err, res) {
            //console.log('events response', err, res);
            T.env.f7App.hidePreloader();
            if (err) {
                T.env.f7App.alert('Could not fetch events');
                return;
            }

            if (res.length) {
                for (var i = 0; i < res.length; i++) {
                    addEvent(res[i]);
                }
            }

            if (callback)
                callback(err, res);

            //console.log('events loaded', eventCache);
            // T.util.renderTemplate7('calendar_eventListTemplate', res, '#calendar_events');
        });
    }

    function selectDay(year, month, day) {
        var context = {
            date: new Date(year, month, day),
            events: eventsForDate(year, month, day),
            basePath: basePath
        };

        T.util.renderTemplate7('calendar_eventListTemplate', context, '#calendar_events');
    }

    function initEventForm(page) {
        var event = eventCache[page.query.event_id] || {},
            $formPage = $$(page.container),
            $formNav = $$(page.navbarInnerContainer);

        T.util.renderTemplate7('calendar_eventFormTemplate', event, $formPage.find('.page-content'));

        console.log('init event form', page, $formNav.find('a.save').length);

        $formNav.find('a.save').on('click', function(ev) {
            var data = T.env.f7App.formToJSON($formPage.find('form'));
            saveEvent(data);
            ev.preventDefault();
        });

        // save
        // $form = $page.find('form');
        // $form.on('submit', function(ev) {
        //     var data = T.env.f7App.formToJSON($form);
        //     saveEvent(data);
        //     ev.preventDefault();
        // });

        initDatePicker($formPage.find('input[name="start_at"]'));
        initDatePicker($formPage.find('input[name="end_at"]'));
    }

    function initDatePicker(input) {
        return T.env.f7App.picker({
            input: input,
            rotateEffect: true,

            value: [today.getMonth(), today.getDate(), today.getFullYear(), today.getHours(), (today.getMinutes() < 10 ? '0' + today.getMinutes() : today.getMinutes())],

            onChange: function (picker, values, displayValues) {
                var daysInMonth = new Date(picker.value[2], picker.value[0]*1 + 1, 0).getDate();
                if (values[1] > daysInMonth) {
                    picker.cols[1].setValue(daysInMonth);
                }
            },

            formatValue: function (p, values, displayValues) {
                if (!displayValues.length) {
                    return $$(input).val();
                }
                return displayValues[0] + ' ' + values[1] + ', ' + values[2] + ' ' + values[3] + ':' + values[4];
            },

            cols: [
                // Months
                {
                    values: ('0 1 2 3 4 5 6 7 8 9 10 11').split(' '),
                    displayValues: monthNames, //('January February March April May June July August September October November December').split(' '),
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
    }

    function saveEvent(data) {
        T.env.f7App.showPreloader('Saving Event');
        T.api.create('/events', data, function(err, res) {
            console.log('create event', data, err, res);
            T.env.f7App.hidePreloader();
            if (T.util.handleAPIError(err, 'Failed to save event')) {
                return;
            }
            addEvent(res);
            T.env.f7View.router.back();
        });
    }

    //
    /// Router
    //

    //
    /// Event Form

    T.env.f7App.onPageInit('calendar_new-event', initEventForm);
    T.env.f7App.onPageInit('calendar_edit-event', initEventForm);

    //
    /// Event Details

    T.env.f7App.onPageInit('calendar_event-details', function(page) {
        var event = eventCache[page.query.event_id],
            $page = $$(page.container);

        T.util.renderTemplate7('calendar_eventDetailsTemplate', event, $page.find('.page-content'));
    });

    //
    /// Template Helpers
    //

    T.env.t7.registerHelper('calendar_listHeadingDate', function(date) {
        if (!date) return '';
        return (dayNames[date.getDay()] + ', ' + monthNames[date.getMonth()] + ' ' + date.getDate());
    });

    T.env.t7.registerHelper('calendar_simpleTime', function(date) {
        if (!date) return '';
        var h =  date.getHours(),
            m = date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes();
        return (h > 12) ? (h-12 + ':' + m + ' pm') : (h + ':' + m + ' am');
    });

    T.env.t7.registerHelper('calendar_dateTime', function(date) {
        if (!date) return '';
        var y = date.getFullYear(),
            m = date.getMonth(),
            d = date.getDate(),
            h = date.getHours(),
            min = date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes();
        return monthNames[m] + ' ' + d + ', ' + y + ' ' + h + ':' + min;
    });

})(Tommy);
