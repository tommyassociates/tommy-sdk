define(['config','cache','i18n!nls/lang','Framework7'],function (config,cache,i18n) {
    var $$ = Dom7;

    var util = {

        //
        // String, Array and Object manipulation
        //

        replaceWith: function (string, expression, replace) {
            return string.replace(new RegExp(expression, 'g'), replace);
        },

        parameterize: function (str) {
            return str.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
        },

        capitalise: function (str) {
            return str.charAt(0).toUpperCase() + str.slice(1);
        },

        isEmail: function (str) {
            var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
            return re.test(str);
        },

        isEmpty: function (obj) {
            for (var prop in obj) {
                if(obj.hasOwnProperty(prop))
                    return false;
            }
            return true;
        },

        formatTags: function (array, prefix) {
            var output = '';
            for (var i = 0; i < array.length; i++) {
                if (i > 0)
                    output += ', ';
                if (prefix)
                    output += prefix;
                output += array[i];
            }
            return output;
        },

        isTagSelected: function(savedTags, item) {
            if (savedTags && savedTags.length) {
                for (var x = 0; x < savedTags.length; x++) {
                    if (savedTags[x] &&
                        savedTags[x][0] == item[0] &&
                        savedTags[x][1] == item[1] &&
                        savedTags[x][2] == item[2])
                        return true;
                }
            }
            return false;
        },

        getCharLength: function (str) {
            var iLength = 0;
            for (var i = 0; i < str.length; i++) {
                if (str.charCodeAt(i) > 255) {
                    iLength += 2;
                } else {
                    iLength += 1;
                }
            }
            return iLength;
        },

        // Remove duplicates from an array of object
        // Usage: `uniq(things.thing, 'place');`
        uniq: function (a, param) {
            return a.filter(function (item, pos, array) {
                return array.map(function (mapItem){ return mapItem[param]; }).indexOf(item[param]) === pos;
            });
        },

        //
        // Platform and Environment
        //

        isPhonegap: function () {
            return (typeof(cordova) !== 'undefined' || typeof(phonegap) !== 'undefined');
        },

        checkConnection: function () {
            var networkState = navigator.connection.type;

            var states = {};
            states[Connection.UNKNOWN]  = 'UNKNOWN';
            states[Connection.ETHERNET] = 'ETHERNET';
            states[Connection.WIFI]     = 'WIFI';
            states[Connection.CELL_2G]  = 'CELL_2G';
            states[Connection.CELL_3G]  = 'CELL_3G';
            states[Connection.CELL_4G]  = 'CELL_4G';
            states[Connection.CELL]     = 'CELL';
            states[Connection.NONE]     = 'NoNetwork';

            return states[networkState];
        },

        bindEvents: function (bindings) {
            for (var i in bindings) {
                if (bindings[i].selector) {
                    $$(bindings[i].element)
                        .on(bindings[i].event, bindings[i].selector, bindings[i].handler);
                } else {
                    $$(bindings[i].element)
                        .on(bindings[i].event, bindings[i].handler);
                }
            }
        },

        // Bind submit buttons that exist outside of form scope such as in the
        // navbar or toolbar
        bindDynamicSubmitButtons: function (page) {
            $$(page.container).add(page.navbarInnerContainer).find('a[data-submit]').click(function(event) {
                $$(page.container).find('form' + $$(this).data('submit')).trigger('submit');
                event.preventDefault();
            });
        },

        // bindDynamicVisibility: function (scope) {
        // },

        //
        // Date and Time
        //

        dayNames: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],

        monthNames: ['January','February','March','April','May','June','July','August','September','October','November','December'],

        getWeekDay: function (date) {
            return util.dayNames[(new Date(date)).getDay()];
        },

        getShortWeekDay: function (date) {
            return 'Sun Mon Tue Wed Thu Fri Sat'.split(' ')[(new Date(date)).getDay()];
        },

        getShortMonth: function (date) {
            return 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[(new Date(date)).getMonth()];
        },

        getTimeOfDay: function (date) {
            if (!date) return '';
            var h =  date.getHours(),
                m = date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes();
            return (h > 12) ? (h-12 + ':' + m + ' pm') : (h + ':' + m + ' am');
            // date = new Date(date);
            // var h = date.getHours(), m = date.getMinutes();
            // return (h > 12) ? (h-12 + ':' + m + ' PM') : (h + ':' + m + ' AM');
        },

        timeFormat: function (ms) {
            ms = ms * 1000;

            var d_second,d_minutes, d_hours, d_days;
            var timeNow = new Date().getTime();
            var d = (timeNow - ms)/1000;
            d_days = Math.round(d / (24*60*60));
            d_hours = Math.round(d / (60*60));
            d_minutes = Math.round(d / 60);
            d_second = Math.round(d);
            if (d_days > 0 && d_days < 2) {
                return d_days + i18n.global.day_ago;
            } else if (d_days <= 0 && d_hours > 0) {
                return d_hours + i18n.global.hour_ago;
            } else if (d_hours <= 0 && d_minutes > 0) {
                return d_minutes + i18n.global.minute_ago;
            } else if (d_minutes <= 0 && d_second >= 0) {
                return i18n.global.just_now;
            } else {
                var s = new Date();
                s.setTime(ms);
                return (s.getFullYear() + '-' + f(s.getMonth() + 1) + '-' + f(s.getDate()) + ' '+ f(s.getHours()) + ':'+ f(s.getMinutes()));
            }

            function f(n) {
                if (n < 10)
                    return '0' + n;
                else
                    return n;
            }
        },

        //
        // URL and Query
        //

        getCurrentAccountUpdateURI: function () {
            var url = '';
            switch (config.getCurrentAccount().type) {
                case 'Team':
                    url = 'team';
                    break;
                case 'TeamMember':
                    url = 'team_member';
                    break;
                case 'User':
                    url = 'user';
                    break;
            }
            return url;
        },

        matchUrl: function (string) {
            var reg = /((http|ftp|https):\/\/)?[\w\-_]+(\.[\w\-_]+)+([\w\-\.,@?^=%&;:\/~\+#]*[\w\-\@?^=%&;\/~\+#])?/g;

            string = string.replace(reg,function (a) {
                if(a.indexOf('http') !== -1 || a.indexOf('ftp') !== -1) {
                    return '<a href=\"#\" onclick=\"event.stopPropagation();window.open(\'' + a + '\',\'_blank\')\">' + a + '</a>';
                }
                else
                {
                    return '<a href=\"#\" onclick=\"event.stopPropagation();window.open(\'http://' + a + '\',\'_blank\')\">' + a + '</a>';
                }
            });
            return string;
        },

        joinPath: function (/* path segments */) { //parts, sep
            var parts = [];
            for (var i = 0, l = arguments.length; i < l; i++) {
              parts = parts.concat(arguments[i].split("/"));
            }
            var separator = '/'; //sep ||
            var replace   = new RegExp(separator+'{1,}', 'g');
            return parts.join(separator).replace(replace, separator);
        },

        addonAssetUrl: function (package, version, file, appendToken) {
            var url = config.getApiUrl();
            if (typeof(SDK_URL) !== 'undefined') {
                url = SDK_URL;
            }
            else {
                url = config.getApiUrl().slice(0, -1);
            }
            url += util.addonAssetPath(package, version, file, appendToken);
            return url;
        },

        addonAssetPath: function (package, version, file, appendToken) {
            // var path = util.joinPath('/addons/', package, '/versions/', version);
            var path = '/addons/' + package + '/versions/' + version + '/files/';
            if (file) {
                path += file;
            }
            if (appendToken) {
                path += ('?token=' + config.getSessionToken());
            }
            return path;
        },

        //
        // App Helpers
        // TODO: move to app.js
        //

        setPageTitle: function (html) {
           $$('.view-main').find('.navbar-on-center .center').html(html);
        },

        hideToolbar: function () {
            tommyApp.hideToolbar('.toolbar');
        },

        showToolbar: function () {
            tommyApp.showToolbar('.toolbar');
        },

        showLoader: function (text, force) {
            tommyApp.showIndicator();
        },

        hideLoader: function () {
            tommyApp.hideIndicator();
        },

        renderCurrentAvatar: function () {
            // console.log('renderCurrentAvatar', $$('.current-avatar').length, config.getCurrentAvatar());
            $$('.current-avatar').attr('src', config.getCurrentAvatar());
            $$('.current-avatar-background').attr('style', 'background-image: url(' + config.getCurrentAvatar() + ');');
        },

        handleAPIError: function (err, baseMessage) {
            if (!err) return false;
            var message = '';
            if (baseMessage) {
                message += baseMessage;
                message += ': ';
            }
            message += err;
            tommyApp.alert(message);
            return true;
        }

        // getPageNameInUrl: function (url) {
        //     url = url || '';
        //     var arr = url.split('.');
        //     return arr[0];
        // },

        // optionList : {
        //     shiftRepeats :'None|Daily|Weekly|Monthy|Every Monday|Every Tuesday|Every Wednesday|Every Thursday|Every Friday|Every Saturday|Every Sunday',
        // },

        // // Format date
        // formatDay: function (d) {
        //     var date = new Date(d);
        //     var weekDay = 'Sunday Monday Tuesday Wednesday Thursday Friday Saturday'.split(' ')[date.getDay()];
        //     var day = date.getDate();
        //     var month = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[date.getMonth()];
        //     return weekDay + ', ' + month + ' ' + day;
        // },

        // showSuccess: function (page) {
        //     $$('#loading').hide();
        //     $$('#success').show();
        //     setTimeout(function () {
        //         $$('#success').hide();
        //         tommyView.router.back();
        //      }, 300);
        // },
        //
        // showSuccessAndReload: function (force) {
        //     if(window.from === 'left' && !force)
        //         return;
        //     $$('#loading').hide();
        //     $$('#success').show();
        //     setTimeout(function () {
        //         $$('#success').hide();
        //         tommyView.router.refreshPage();
        //      }, 300);
        // },
        //
        // showLoader: function (text, force) {
        //     if((window.from === 'left' || !window.show_loader) && !force)
        //         return;
        //     $$('#loading').hide();
        //     $$('#success').hide();
        //     if(text)
        //         $$('#load-text').html(text);
        //     else
        //         $$('#load-text').html('Loading');
        //     $$('#loading').show();
        // },
        //
        // hideLoader: function () {
        //     $$('#loading').hide();
        // },

        // getTaxEmploymentStatus: function (id) {
        //     if(id === '1')
        //         return 'Skipped';
        //     else if(id === '2')
        //         return 'Resident';
        //     else if(id === '3')
        //         return 'Temporary Work Visa';
        //     else if(id === '4')
        //         return 'Working Holiday Visa';
        //     else
        //         return 'Select Employment Status';
        // },
        //
        // getTaxTFNStatus: function (id) {
        //     if(id === '1')
        //         return 'I have my TFN';
        //     else if(id === '2')
        //         return 'Under age';
        //     else if(id === '3')
        //         return 'Pensioner';
        //     else if(id === '4')
        //         return 'Made inquiry';
        //     else
        //         return 'Select File Tax Status';
        // },
        //
        // setTimePicker: function (el, hour, min, period) {
        //     time = {
        //          input: el,
        //          value: [ hour ,min, period ],
        //          rotateEffect: true,
        //          formatValue: function (p, values, displayValues) {
        //                 return values[0] + ':' + values[1] + ' ' + values[2];
        //             },
        //          cols: [// Hours
        //             {
        //                 values: (function () {
        //                     var arr = [];
        //                     for (var i = 1; i <= 12; i++) { arr.push(i); }
        //                     return arr;
        //                 })(),
        //             },
        //             // Divider
        //             {
        //                 divider: true,
        //                 content: ':'
        //             },
        //             // Minutes
        //             {
        //                 values: (function () {
        //                     var arr = [];
        //                     for (var i = 0; i <= 59; i++) { arr.push(i < 10 ? '0' + i : i); }
        //                     return arr;
        //                 })(),
        //             },
        //             // Divider
        //             {
        //              values: ('AM PM').split(' ')
        //             } ]
        //     };
        //     return time;
        // },
        //
        // setSimplePicker: function (el, defaultVal, val) {
        //     list = {
        //          input: el,
        //          value: [ defaultVal ],
        //          rotateEffect: true,
        //          cols: [
        //             {
        //              values: val.split('|')
        //             }]
        //     };
        //     return list;
        // },
        //
        // setNumberPicker: function (el, defaultVal, min, max) {
        //     list = {
        //          input: el,
        //          value: [ defaultVal ],
        //          rotateEffect: true,
        //          cols: [
        //             {
        //              values: (function () {
        //                     var arr = [];
        //                     for (var i = min; i <= max; i++) { arr.push(i); }
        //                     return arr;
        //                 })(),
        //             }]
        //     };
        //     return list;
        // },
    };

    return util;
});
