require(['app','api','addons','util','cache','tplManager','moment','refreshPanel'],
function (app,api,addons,util,cache,tplManager,moment,refreshPanel) {

    //
    /// Availability Context

    var Availability = {

        // Item cache
        cache: {},

        // Data loaded boolean
        loaded: false,

        // Last updated timestamp
        lastUpdated: false,

        // Date range for availabilities
        startAt: false,
        endAt: false,

        init: function () {
            Availability.cache = {}
            Availability.startAt = moment().subtract(1, 'day').startOf('day')
            Availability.endAt = moment().add(2, 'weeks').endOf('week')
            var current = Availability.startAt.clone()
            while (current.add(1, 'day') < Availability.endAt) {
                var date = current.format('YYYY-MM-DD')
                if (!Availability.cache[date]) {
                    Availability.cache[date] = {
                        start_at: current.format()
                    }
                }
            }
        },

        uninit: function () {
            Availability.loaded = false
            Availability.cache = {}
        },

        addAvailability: function (item) {
            var date = moment(item.start_at).format('YYYY-MM-DD') // index by date
            Availability.cache[date] = item
            console.log('availability added', item)
        },

        onAvailabilities: function (items) {
            Availability.loaded = true
            Availability.lastUpdated = new Date

            if (items && items.length) {
                for (var i = 0; i < items.length; i++) {
                    Availability.addAvailability(items[i])
                }
            }
        },

        loadAvailabilities: function (params) {
            params = Object.assign({
                addon: 'availability',
                kind: 'Availability',
                user_id: addons.currentActorOrUserId(),
                date_range: [
                    Availability.startAt.utc().format(),
                    Availability.endAt.utc().format()
                ]
            }, params)
            console.log('load availabilities', params)
            return api.getFragments(params, {cache: false}).then(Availability.onAvailabilities)
        }
    }


    //
    /// Index Controller

    var IndexController = {
        init: function (page) {
            Availability.init()
            IndexController.bind(page)
            IndexController.refresh(page)
        },

        uninit: function (page) {
            var $page = $$(page.container)
            console.log('uninitialize availability addon')
            Availability.uninit()
            refreshPanel.uninit($page.find('[data-last-updated]'))
        },

        refresh: function (page) {
            return Availability.loadAvailabilities().then(function() {
                IndexController.invalidate(page)

                $$(page.container).find('[data-last-updated]').data('last-updated', Availability.lastUpdated)
            })
        },

        bind: function (page) {
            var $page = $$(page.container)
            var $nav = $$(page.navbarInnerContainer)

            $nav.find('.save').on('click', function() {
                $$(page.container).find('form[data-changed]').removeAttr('data-changed').each(function() {
                    var json = app.f7.formToJSON(this),
                        date = json.start_at,
                        item = Availability.cache[date]

                    // console.log('availability', item, Availability.cache, json)
                    item = Object.assign(item, {
                        addon: 'availability',
                        kind: 'Availability',
                        data: JSON.stringify({ am: !!json.am.length, pm: !!json.pm.length, ns: !!json.ns.length }),
                        start_at: date,
                        user_id: addons.currentActorOrUserId()
                    })

                    if (item.id) {
                        api.updateFragment(item.id, item).then(function(response) {
                            console.log('updated availability fragment', response)
                            Availability.cache[date] = response
                        })
                    }
                    else {
                        api.createFragment(item).then(function(response) {
                            console.log('created availability fragment', response)
                            Availability.cache[date] = response
                        })
                    }
                })
            })

            var $lastUpdated = $page.find('[data-last-updated]')
            refreshPanel.init($lastUpdated)
            $lastUpdated.find('.refresh').click(function() {
                IndexController.refresh(page).catch(function(){}).then(function() {
                    refreshPanel.onRefreshComplete($lastUpdated)
                })
            })
        },

        invalidate: function (page) {
            if (!Availability.loaded) return;

            console.log('invalidating availability index', Availability.cache)
            tplManager.renderInline('availability__availabilityListGroupTemplate', Availability.cache, page.container)

            $$(page.container).find('.list-block a.availability__toggle-availability').click(function(event) {
                var $link = $$(this),
                    availability = $link.data('availability'),
                    $form = $link.parent().find('form'),
                    $input = $form.find('input[name="' + availability + '"]')
                $link.toggleClass('unavailable')
                $input.prop('checked', !$input.prop('checked'))
                $form.attr('data-changed', true)

                return false;
            })
        }
    }

    //
    /// Router

    app.f7.onPageInit('availability__main', IndexController.init)
    app.f7.onPageBack('availability__main', IndexController.uninit)
    app.f7.onPageAfterAnimation('availability__main', IndexController.invalidate)

    //
    /// Template7 Helpers

    app.t7.registerHelper('availability__unavailableProperty', function (shift, data, prop) {
        if (data && data[shift] == true)
            return prop
        return ''
    })
})
