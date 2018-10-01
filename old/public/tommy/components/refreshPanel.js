define(['app','util','config','api','i18n','moment'],
function (app,util,config,api,i18n,moment) {
    var refreshPanel = {
        init: function ($element) {
            var showAfter = 41 * 1000 //60 * 1000
            var intervalMS = 20 * 1000 //60 * 1000
            var interval = setInterval(function() {
                var lastUpdated = $element.data('last-updated')
                if (!lastUpdated || Math.abs(moment().diff(lastUpdated)) < showAfter) {
                    console.log('refresh panel skip')
                    $element.hide()
                    return
                }
                console.log('refresh panel show')
                $element.show().find('.time').html(moment(lastUpdated).fromNow())
            }, intervalMS)

            $element.data('refresh-interval', interval)
            $element.hide()
            $element.find('.refresh').click(function() {
                $$(this).addClass('disabled')
            })
        },

        uninit: function ($element) {
            if ($element.data('refresh-interval')) {
                clearInterval($element.data('refresh-interval'))
                $element.data('refresh-interval', null)
            }
            $element.hide()
        },

        onRefreshComplete: function ($element) {
            console.log('refresh complete')
            $element.hide().find('.refresh').removeClass('disabled')
        }
    };

    return refreshPanel;
});
