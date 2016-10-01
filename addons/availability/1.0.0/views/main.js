require(['app','api','addons','util','cache','tplManager','moment'],
function (app,api,addons,util,cache,tplManager,moment) {

    //
    /// Availability Context

    var Availability = {

        // Item cache
        cache: {},

        initCache: function () {
            var today = moment().startOf('day'),
                current = today.clone().subtract(1, 'day'), // added back on by iterator
                end = today.clone().add(1, 'week').endOf('week');

            // while (current.add(1, 'day').diff(end) < 0) {
            while (current.add(1, 'day') < end) {
                var date = current.format('YYYY-MM-DD');
                if (!Availability.cache[date]) {
                    Availability.cache[date] = {
                        time: current.format()
                    };
                    // Availability.addAvailability({
                    //     time: current.format()
                    // });
                }
            }
        },

        addAvailability: function (item) {
            var date = moment(item.time).format('YYYY-MM-DD'); // index by date
            Availability.cache[date] = item;
            console.log('availability added', item)
        },

        addAvailabilities: function (items) {
            if (items && items.length) {
                for (var i = 0; i < items.length; i++) {
                    Availability.addAvailability(items[i]);
                }
            }
        },

        loadAvailabilities: function (params) {
            console.log('load availabilities', params);

            params = Object.assign({
                kind: 'Availability',
                resource_type: 'AddonInstall',
                resource_id: addons.currentAddonInstallId()
            }, params);
            return api.getFragments(params).then(Availability.addAvailabilities);
        }
    };

    //
    /// Main View

    var Main = {
        loaded: false,

        init: function (page) {
            Availability.initCache();
            Availability.loadAvailabilities().then(function() {
                Main.loaded = true;
                Main.invalidate(page);
            });

            var $nav = $$(page.navbarInnerContainer);
            $nav.find('.save').on('click', function() {
                $$(page.container).find('form[data-changed]').removeAttr('data-changed').each(function() {
                    var json = app.f7.formToJSON(this),
                        date = json.time,
                        item = Availability.cache[date];

                    item = Object.assign(item, {
                        kind: 'Availability',
                        resource_type: 'AddonInstall',
                        resource_id: addons.currentAddonInstallId(),
                        data: JSON.stringify({ AM: !!json.AM.length, PM: !!json.PM.length, NS: !!json.NS.length }),
                        time: date
                    });

                    if (item.id) {
                        api.updateFragment(item.id, item).then(function(response) {
                            console.log('updated availability fragment', response);
                            Availability.cache[date] = response;
                        });
                    }
                    else {
                        api.createFragment(item).then(function(response) {
                            console.log('created availability fragment', response);
                            Availability.cache[date] = response;
                        });
                    }
                });
            });
        },

        invalidate: function (page) {
            if (!Main.loaded) return;

            console.log('invalidating main availability');
            tplManager.renderInline('availability__availabilityListGroupTemplate', Availability.cache, page.container);

            $$(page.container).find('.list-block a.availability__toggle-availability').click(function(event) {
                var $link = $$(this),
                    availability = $link.data('availability'),
                    $form = $link.parent().find('form'),
                    $input = $form.find('input[name="' + availability + '"]');
                $link.toggleClass('unavailable');
                $input.prop('checked', !$input.prop('checked'));
                $form.attr('data-changed', true);

                // var data = app.f7.formToJSON($link.parent().find('form'));
                // console.log('update availabilities', data);

                // console.log('create schedule', $input.length, $input.prop('checked'));
                // switch (availability) {
                //     case 'AM':
                //         break;
                //     case 'PM':
                //         break;
                //     case 'NS':
                //         $link.prevAll('a[data-availability]').addClass('unavailable');
                //         break;
                // }
                // var data = {
                //     start_date: $link.data('start'),
                //     end_date: $link.data('end')
                // }
                // console.log('create schedule', data);
                // api.createSchedule(data).then(function(response) {
                //     console.log('created schedule', response);
                //     Timesheets.addSchedule(response);
                //     Client.Main.invalidate(page);
                //     app.f7.closeModal();
                // });
                return false;
            });
        }
    }

    //
    /// Router

    app.f7.onPageInit('availability__main', Main.init);
    app.f7.onPageAfterAnimation('availability__main', Main.invalidate);

    //
    /// Template7 Helpers
    //

    app.t7.registerHelper('availability__unavailableProperty', function (shift, data, prop) {
        if (data && data[shift] == true)
            return prop;
        return '';
    });
});
