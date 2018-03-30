define(['config','util','moment','i18n'/*,'i18n!nls/lang'*/,'Framework7'],
function (config,util,moment,i18n/*,i18n*/) {
    var $$ = Dom7;
    var t7 = Template7;

    var tplHelpers = {
        init: function () {

            t7.registerHelper('if_compare', function (a, operator, b, options) {
                var match = false;
                if ((operator === '==' && a == b) ||
                    (operator === '===' && a === b) ||
                    (operator === '!=' && a != b) ||
                    (operator === '>' && a > b) ||
                    (operator === '<' && a < b) ||
                    (operator === '>=' && a >= b) ||
                    (operator === '<=' && a <= b) ) {
                    match = true;
                }
                if (match)
                    return options.fn(this)
                else
                    return options.inverse(this)
            })

            t7.registerHelper('if_contains', function (value, array, options) {
                // if non array was passed then attempt to split comma separated string
                if (!$$.isArray(array))
                    array = array.split(',')
                // convert value to string
                value = value + ''
                var match = false;
                if (value && array && array.length) {
                    for (var i = 0; i < array.length; i++) {
                      if (array[i] === value) { match = true; break; }
                    }
                }
                if (match)
                    return options.fn(this)
                else
                    return options.inverse(this)
            })

            t7.registerHelper('if_any', function (object, options) {
                var match = false;
                if (object) {
                    if (object.length)
                        match = true;
                    if (!match)
                        for (var item in object) { match = true; break; }
                }
                if (match)
                    return options.fn(this)
                else
                    return options.inverse(this)
            })

            t7.registerHelper('if_empty', function (array, options) {
                var match = !array || array.length == 0;
                if (match)
                    return options.fn(this)
                else
                    return options.inverse(this)
            })

            t7.registerHelper('count', function (array, options) {
                if (array)
                    return array.length;
                return 0;
            })

            t7.registerHelper('t', function (key, options) {

                // Translate the addon namespace and fallback to default
                // namespace if translation is unavailable
                var keys = []
                if (t7.global.currentAddonInstall &&
                    t7.global.currentAddonInstall.package)
                    keys.push(t7.global.currentAddonInstall.package + ':' + key)
                keys.push(key)
                
                return i18n.i18next.t(keys, options.hash)
            })

            //
            /// String Manipulation
            //

            t7.registerHelper('json', function (object, options) {
              return JSON.stringify(this)
            })

            t7.registerHelper('capitalize', function (text) {
                return util.capitalize(text)
            })

            t7.registerHelper('isSelected', function (a, b) {
                if (a === b) return 'selected';
                else return '';
            })

            t7.registerHelper('chkstr', function (text) {
                if (text)
                    return text;
                else
                    return '';
            })

            // t7.registerHelper('format_lastshift', function (text) {
            //   if (text)
            //     return 'Last Shift: ' + moment(text).fromNow()
            //   else
            //     return 'No shift started yet';
            // })

            // t7.registerHelper('truncateText', function (text, less) {
            //     if (!text)
            //         return '';
            //     if (!less)
            //         less = 5;
            //     var w = $$( window ).width()
            //     var max_w = (w/9) - less;
            //     if (text.length > max_w)
            //         return text.substring(0, max_w)+'...';
            //     else
            //         return text;
            // })

            t7.registerHelper('sentenceCase', function (text) {
                text = text.replace(/[_-]/g, " ")
                return text.charAt(0).toUpperCase() + text.slice(1)
            })

            t7.registerHelper('lowerCase', function (text) {
                return text.toLowerCase()
            })

            t7.registerHelper('tagList', function (array, array1, array2) {
                var output = '';
                if ($$.isArray(array) && array.length) { output += util.formatTags(array) }
                if ($$.isArray(array1) && array1.length) {
                    if (!!output.length) output += ', ';
                    output += util.formatTags(array1)
                }
                if ($$.isArray(array2) && array2.length) {
                    if (!!output.length) output += ', ';
                    output += util.formatTags(array2)
                }
                return output;
            })

            //
            /// URL and Paths
            //

            // var backButton = '<a href="#" class="back link icon-only"><i class="material-icons md-36">keyboard_arrow_left</i></a>';

            t7.registerHelper('backButton', function (type) {
                // console.log('render back button', window.tommy.native, type)
                // if (window.tommy.native && type == 'native')
                //     return '<a href="tommy://backToApp" class="back link icon-only external"><i class="material-icons md-36">keyboard_arrow_left</i></a>';
                return '<a href="#" class="back link icon-only"><i class="material-icons md-36">keyboard_arrow_left</i></a>';
            })

            // t7.registerHelper('nativeBackButton', function (type) {
            //     return backButton;
            // })

            // t7.registerHelper('addonAssetPath', function (file) {
            //     if (!t7.global.currentAddon)
            //         throw 'Cannot render addon asset path: ' + file;
            //     return util.addonAssetPath(
            //         t7.global.currentAddonInstall.package,
            //         t7.global.currentAddonInstall.version, file)
            // })

            t7.registerHelper('addonAssetUrl', function (file) {
                if (!t7.global.currentAddonInstall)
                    throw 'Cannot render addon asset URL: ' + file;
                return util.addonAssetUrl(
                    t7.global.currentAddonInstall.package,
                    t7.global.currentAddonInstall.version, file, true)
            })

            t7.registerHelper('apiUrl', function (part, part1, part2) {
                var url = config.getApiUrl() + part;
                if (part1 && typeof part1 !== 'object') { url += ('/' + part1) }
                if (part2 && typeof part2 !== 'object') { url += ('/' + part2) }
                return url + '?token=' + config.getSessionToken()
            })

            // Renders an avatar for a user, account or message object.
            t7.registerHelper('circleAvatar', function (object, options) {
                // console.log('circleAvatar', object, options.hash)
                var opts = options.hash;

                // User, Contact or Team Member object
                var data = {};
                if (object.first_name) {
                    data.user_id = object.user_id;
                    data.initials = object.first_name[0] + object.last_name[0];
                    data.icon_url = object.icon_url;
                    data.current = config.getCurrentUserId() == object.id;
                    data.notification_count = object.notification_count;
                    data.online = object.online;
                }
                // Account object
                else if (object.name) {
                    data.user_id = object.user_id;
                    data.initials = util.getInitialsFromName(object.name)
                    data.icon_url = object.icon_url;
                    data.current = config.isCurrentAccount(object)
                    data.notification_count = object.notification_count;
                    data.online = object.online;
                }
                // Message object
                else if (object.sender) {
                    data.initials = util.getInitialsFromName(object.chat.title)
                    data.icon_url = object.chat.icon_url;
                }
                // Message object without sender (no icon)
                else if (object.chat_title) {
                    data.initials = object.chat_title[0] + object.chat_title[1];
                }
                else {
                    data.initials = 'TO'; // Tommy?
                }

                var html = '<span class="avatar-circle">';

                if (opts.onlineBadge)
                    html += '<span class="badge ' + (!!data.online ? ' online' : ' offline') + '" data-online-state="' + data.user_id + '">&nbsp;</span>';

                if (opts.notificationBadge)
                    html += '<span class="badge ' + (!!data.notification_count ? '' : ' hide') + '">' + data.notification_count + '</span>';

                html += '<span class="initials">' + data.initials + '</span>';
                if (data.icon_url)
                    html += '<img src="' + data.icon_url + '" class="' + (data.current ? 'current-avatar' : '') + '" />';
                html += '</span>';
                return html;
            })

            // Human readable invitation status
            t7.registerHelper('invitationStatus', function (status) {
                return util.invitationStatus(status)
            })

            // Return or generate the chat title
            t7.registerHelper('chatTitle', function (chat) {
                return util.chatTitle(chat)
            })

            //
            /// Account Access
            //

            t7.registerHelper('ifExistsInArrayOfObjects', function (array, key, value, options) {
                if (array && array.filter(function (v) { return v[key] === value; }).length)
                    return options.fn(this)
                else
                    return options.inverse(this)
            })

            t7.registerHelper('ifCurrentAccount', function (them, options) {
                var us = config.getCurrentAccount()
                if (us.type == them.type && us.id == them.id)
                    return options.fn(this)
                else
                    return options.inverse(this)
            })

            t7.registerHelper('ifNotCurrentAccount', function (them, options) {
                var us = config.getCurrentAccount()
                if (us.type != them.type || us.id != them.id)
                    return options.fn(this)
                else
                    return options.inverse(this)
            })

            t7.registerHelper('ifCanManageAccount', function (them, options) {
                var us = config.getCurrentAccount(),
                    access = false;

                // Manage ourselves
                if (us.type == them.type && us.id == them.id) {
                    access = true;
                }

                // Manage other team members as team owner or manager
                if ((util.hasRole(us, 'Team Admin') || util.hasRole(us, 'Team Manager')) && util.hasRole(us, 'Team Member')) {
                    access = true;
                }

                if (access)
                    return options.fn(this)
                else
                    return options.inverse(this)
            })

            t7.registerHelper('ifCanEditTeamMember', function (user_id, options) {
                var us = config.getCurrentAccount(),
                    user = config.getCurrentUser()

                if (util.hasRole(us, 'Team Admin') || util.hasRole(us, 'Team Manager') || (user.id == user_id))
                    return options.fn(this)
                else
                    return options.inverse(this)
            })

            t7.registerHelper('ifCanDeleteTeamMember', function (user_id, options) {
                var us = config.getCurrentAccount(),
                    user = config.getCurrentUser(),
                    team = config.getCurrentTeam()

                if ((util.hasRole(us, 'Team Admin') || util.hasRole(us, 'Team Manager') || user.id == user_id) &&
                    (team.user_id != user_id))
                    return options.fn(this)
                else
                    return options.inverse(this)
            })

            t7.registerHelper('ifCurrentUser', function (user_id, options) {
                var us = config.getCurrentUser()

                if (us && us.id == user_id)
                    return options.fn(this)
                else
                    return options.inverse(this)
            })

            t7.registerHelper('ifNotCurrentUser', function (them_id, options) {
                var us = config.getCurrentUser()

                if (!us || us.id != them_id)
                    return options.fn(this)
                else
                    return options.inverse(this)
            })

            t7.registerHelper('hideIfDefaultAccount', function (account) {
                var us = config.getCurrentAccount()
                if (us.id === account.id &&
                    us.type === account.type)
                    return 'hide';
            })

            //
            /// Date and Time
            //

            t7.registerHelper('timeOfDay', function (date) {
                return util.getTimeOfDay(date)
            })

            t7.registerHelper('dateTime', function (date) {
                  if (!date) return '';
                  var y = date.getFullYear(),
                      m = date.getMonth(),
                      d = date.getDate(),
                      h = date.getHours(),
                      min = date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes()
                  return util.monthNames[m] + ' ' + d + ', ' + y + ' ' + h + ':' + min;
            })

            t7.registerHelper('fromnow', function (text) {
                // var localTime = moment.utc(text).toDate()
                // var fromnow = moment(localTime).fromNow(true)
                // var now = moment()
                // var diff = now.diff(moment(localTime), 'days')
                // return moment(localTime).format("MMM D")

                // var localTime = moment.utc(text).toDate()
                return moment(text).fromNow()

                // if (diff >= 1 && diff < 8) {
                //     return moment(localTime).format("ddd")
                // }
                // else if (diff >= 8)
                //     return moment(localTime).format("MMM D")
                // else if (diff >= 365)
                //     return moment(localTime).format("MMM D, YYYY")
                // else {
                //     // hours, minutes, and seconds
                //     var diff_hours = now.diff(moment(localTime), 'hours')
                //     var diff_mins = now.diff(moment(localTime), 'minutes')
                //     var diff_secs = now.diff(moment(localTime), 'seconds')
                //     if (diff_mins > 60 &&  diff_hours < 22)
                //         return diff_hours + ' hours';
                //     else if (diff_mins > 55 &&  diff_mins <= 60)
                //         return '1 hour';
                //     else if (diff_mins > 1 &&  diff_mins <= 55)
                //         return diff_mins + ' mins';
                //     else if (diff_mins == 1)
                //         return '1 min';
                //     else
                //         return 'now';
                //     // else if (diff_secs >= 2 &&  diff_secs <= 55)
                //     //     return diff_secs+' secs';
                //     // else if (diff_secs >= 0 &&  diff_secs <= 2)
                //     //     return 'now';
                //     // else
                //     //     return moment(text).fromNow(true)
                // }
            })

            // This is used for displaying the date properly on timed message.
            t7.registerHelper('humanTime', util.humanTime)

            t7.registerHelper('formatDate', function (text,format) {
                var localTime = moment.utc(text).toDate()
                // console.log('localTime', localTime)
                // var day = moment(localTime, "YYYY-MM-DD")
                // console.log('day', day.toDate(), text, format)
                return moment(localTime).format(format)
            })

            t7.registerHelper('formatDateTime', function (text,format) {
                return moment(text).format(format)
            })

            t7.registerHelper('dayOrToday', function (time) {
                time = moment(time)
                if (time.isSame(moment(), 'day'))
                    return 'Today';
                return time.format('dddd')
            })

            t7.registerHelper('ifPastDate', function (date, options) {
                // var diff = moment().diff(moment(date), 'days')
                if (new Date(date) < new Date)
                    return options.fn(this)
                else
                    return options.inverse(this)
            })

            t7.registerHelper('ifTodaysDate', function (date, options) {
                var diff = moment().diff(moment(date), 'days')
                if (diff === 0)
                    return options.fn(this)
                else
                    return options.inverse(this)
            })
        }
    };

    return tplHelpers;
})
