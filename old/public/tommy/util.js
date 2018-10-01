define(['config','cache','moment','i18n','Framework7'],function (config,cache,moment,i18n) {
    var $$ = Dom7;

    var util = {

        //
        // == String, Array and Object manipulation
        //

        replaceWith: function (string, expression, replace) {
            return string.replace(new RegExp(expression, 'g'), replace);
        },

        parameterize: function (str) {
            return str.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
        },

        underscore: function (str) {
            return str.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/(^_|_$)/g,'');
        },

        capitalize: function (str) {
            return str.charAt(0).toUpperCase() + str.slice(1);
        },

        isEmail: function (str) {
            var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
            return re.test(str);
        },

        isEmpty: function (obj) {
            for (var prop in obj) {
                if (obj.hasOwnProperty(prop))
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
                        savedTags[x].type == item.type &&
                        savedTags[x].name == item.name &&
                        savedTags[x].id == item.id) {
                            // console.log('isTagSelected', savedTags[x], item)
                            return true;
                        }
                }
            }
            return false;
        },

        hasRole: function(account, name) {
            if (account && account.roles && account.roles.length) {
                for (var x = 0; x < account.roles.length; x++) {
                    if (account.roles[x] == name)
                        return true;
                }
            }
            return false;
        },

        isTeamOwnerOrManager: function(account) {
            // var account = config.getCurrentAccount();
            return (account && (
              account.type == 'Team' || (
              account.type == 'TeamMember' &&
              util.hasRole(account, 'Team Manager'))));
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
            // TODO: use Dom7.unique(array) ?
            return a.filter(function (item, pos, array) {
                return array.map(function (mapItem){ return mapItem[param]; }).indexOf(item[param]) === pos;
            });
        },

        // Resolve nested item from object/array
        // @param {Object|Array} obj
        // @param {String} path dot separated
        // @param {*} def default value ( if result undefined )
        // @returns {*}
        resolve: function (obj, path, def) {
            var i, len;
            for (i = 0,path = path.split('.'), len = path.length; i < len; i++){
                if (!obj || typeof obj !== 'object') return def;
                obj = obj[path[i]];
            }
            if (obj === undefined) return def;
            return obj;
        },

        //
        // == Platform and Environment
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

        //
        // == Date and Time
        //

        dayNames: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],

        monthNames: ['January','February','March','April','May','June','July','August','September','October','November','December'],

        // @deprecated: use moment
        getWeekDay: function (date) {
            return util.dayNames[(new Date(date)).getDay()];
        },

        // @deprecated: use moment
        getShortWeekDay: function (date) {
            return 'Sun Mon Tue Wed Thu Fri Sat'.split(' ')[(new Date(date)).getDay()];
        },

        // @deprecated: use moment
        getShortMonth: function (date) {
            return 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ')[(new Date(date)).getMonth()];
        },

        // @deprecated: use moment
        getTimeOfDay: function (date) {
            if (!date) return '';
            var h =  date.getHours(),
                m = date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes();
            return (h > 12) ? (h-12 + ':' + m + ' pm') : (h + ':' + m + ' am');
            // date = new Date(date);
            // var h = date.getHours(), m = date.getMinutes();
            // return (h > 12) ? (h-12 + ':' + m + ' PM') : (h + ':' + m + ' AM');
        },

        // timeFormat: function (ms) {
        //     ms = ms * 1000;
        //
        //     var d_second,d_minutes, d_hours, d_days;
        //     var timeNow = new Date().getTime();
        //     var d = (timeNow - ms)/1000;
        //     d_days = Math.round(d / (24*60*60));
        //     d_hours = Math.round(d / (60*60));
        //     d_minutes = Math.round(d / 60);
        //     d_second = Math.round(d);
        //     if (d_days > 0 && d_days < 2) {
        //         return d_days + i18n.global.day_ago;
        //     } else if (d_days <= 0 && d_hours > 0) {
        //         return d_hours + i18n.global.hour_ago;
        //     } else if (d_hours <= 0 && d_minutes > 0) {
        //         return d_minutes + i18n.global.minute_ago;
        //     } else if (d_minutes <= 0 && d_second >= 0) {
        //         return i18n.global.just_now;
        //     } else {
        //         var s = new Date();
        //         s.setTime(ms);
        //         return (s.getFullYear() + '-' + f(s.getMonth() + 1) + '-' + f(s.getDate()) + ' '+ f(s.getHours()) + ':'+ f(s.getMinutes()));
        //     }
        //
        //     function f(n) {
        //         if (n < 10)
        //             return '0' + n;
        //         else
        //             return n;
        //     }
        // },

        humanTime: function (date) {
            var localTime  = moment.utc(date).toDate()
            if (moment(localTime).isValid()) {
                var fromnow = moment(localTime).fromNow(true)
                var now = moment()
                var diff = now.diff(moment(localTime), 'days')
                if (diff === 1)
                    return 'Yesterday ' + moment(localTime).format("h:mm A")
                else if (diff === 0) {
                    // console.log('timeAgo', diff)
                    return 'Today ' + moment(localTime).format("h:mm A")
                }
                else if (diff === -1) {
                    return 'Yesterday ' + moment(localTime).format("h:mm A")
                }
                else if (diff >= 1 && diff <= 8 || diff >= -8 && diff <= -1) {
                    return moment(localTime).format("ddd h:mm A")
                }
                else if (diff >= 365 || diff <= -365)
                    return moment(localTime).format("MMM D, YYYY h:mm A")
                else if (diff >= 8 || diff <= -8)
                    return moment(localTime).format("MMM D h:mm A")
                // else if (diff < -2) {
                //     return moment(localTime).format("ddd h:mm A")
                // }
            }
            else {
                return 'None';
            }
        },

        minutesToHoursAndMinutes: function (value) {
            var hours = 0,
                minutes = 0;
            // if (value > 0) {
            //     minutes = value / 60; // secs to minutes
                if (value > 60) {
                    hours = Math.trunc(value / 60);
                    minutes = value % 60;
                }
                else if (value > 0) {
                    minutes = value;
                }
            // }
            return {
                hours: hours,
                minutes: minutes
            }
        },

        // secondsToHoursAndMinutes: function (seconds) {
        //       var hours = 0,
        //           minutes = 0;
        //       if (seconds > 0) {
        //           minutes = seconds / 60; // secs to minutes
        //           if (minutes > 60) {
        //               hours = Math.trunc(minutes / 60);
        //               minutes = minutes % 60;
        //           }
        //           // else {
        //           //     minutes = value;
        //           // }
        //       }
        //       return {
        //           hours: hours,
        //           minutes: minutes
        //       }
        // },

        createDatePicker: function ($input, initialDate, options) {
            if (!window.tommy.f7) return

            // Parse the date if a string was provided
            if (typeof initialDate === 'string') {
                initialDate = new Date(initialDate)
            }

            // Initialize an empty start date if none was provided
            var wasDateProvided = !!initialDate // || (typeof initialDate !== 'object')
            if (!wasDateProvided) { // if (!initialDate || (typeof initialDate !== 'object')) {
                initialDate = new Date
            }

            // If a date was provided set the initial value
            // var initialValue = false
            // if (initialDate) {
                initialValue = [initialDate.getMonth(), initialDate.getDate(), initialDate.getFullYear(), initialDate.getHours(), (initialDate.getMinutes() < 10 ? '0' + initialDate.getMinutes() : initialDate.getMinutes())]
            // }

            if (!options)
                options = {}
            if (!options.dateFormat)
                options.dateFormat = 'dddd, MMM Do YY, h:mm a'

            console.log('create date picker', initialDate, initialValue)
            return window.tommy.f7.picker(Object.assign({
                input: $input,
                rotateEffect: true,
                inputReadOnly: true,
                // onlyOnPopover: true,
                convertToPopover: false,
                updateValuesOnMomentum: false,
                // updateValuesOnTouchmove: false,
                value: wasDateProvided ? initialValue : false,
                onOpen: function (picker) {
                    // Set the initial date the first time the picker is opened
                    // if none was set at startup
                    if (!wasDateProvided) {
                        wasDateProvided = true
                        picker.setValue(initialValue)
                    }
                },
                onClose: function (picker) {
                },
                onChange: function (picker, values, displayValues) {
                    var daysInMonth = new Date(picker.value[2], picker.value[0]*1 + 1, 0).getDate();
                    if (values[1] > daysInMonth) {
                        picker.cols[1].setValue(daysInMonth)
                    }
                    // console.log('onChange', values, displayValues)
                },
                formatValue: function (picker, values, displayValues) {
                    if (!displayValues[0]) {
                        displayValues[0] = util.monthNames[initialDate.getMonth()]
                    }
                    var str = displayValues[0] + ' ' + values[1] + ', ' + values[2] + ' ' + values[3] + ':' + values[4];
                    var date = new Date(str)

                    // Skip if date is invalid
                    if (isNaN(date.getTime())) {
                        return false
                    }

                    // Set the selected date as a public instance member
                    picker.currentDate = date
                    $input.data('datetime', picker.currentDate.toUTCString())

                    if (options.onFormat)
                        return options.onFormat(picker.currentDate)
                    else
                        return moment(picker.currentDate).format(options.dateFormat);
                    // return displayValues[0] + ' ' + values[1] + ', ' + values[2] + ' ' + values[3] + ':' + values[4];
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
                            var year = initialDate.getFullYear()
                            var arr = [];
                            for (var i = year; i <= year + 10; i++) { arr.push(i); }
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
            }, options));
        },

        //
        // == URL and Query
        //

        getCurrentAccountUpdateURI: function () {
            var account = config.getCurrentAccount();
            switch (account.type) {
                case 'Team':
                    return 'team';
                case 'TeamMember':
                    return 'team/members/' + account.user_id;
                case 'User':
                    return 'me';
                default:
                    throw 'Invalid account type: ' + account.type;
            }
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
        // == Miscellaneous
        //

        // Human readable invitation status
        invitationStatus: function (status) {
            switch (status) {
                case 'requested':
                    return i18n.t('label.sent');
                case 'accepted':
                    return i18n.t('label.added');
                case 'declined':
                    return i18n.t('label.declined');
                default:
                    return '';
            }
        },

        chatTitle: function (chat) {
            if (chat && chat.title)
                return chat.title

            if (chat && chat.users) {
                var currentUserId = config.getCurrentUserId();
                var titleUserNames = []
                for (var i = 0; i < chat.users.length; i++) {
                    if (currentUserId != chat.users[i].user_id)
                        titleUserNames.push(chat.users[i].first_name + ' ' + chat.users[i].last_name);
                }

                return util.formatTags(titleUserNames)
            }

            return 'Unknown'
        },

        getInitialsFromName: function (name) {
          var nameSplitted = name.split(' ');
          var formattedName = name[0];
          formattedName += nameSplitted.length > 1 ? nameSplitted[1][0] : name[1]
          return formattedName
        }
    }

    return util
});
