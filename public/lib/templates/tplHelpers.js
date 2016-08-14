define(['config','util','moment','Framework7'], function (config,util,moment) {
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
                  return options.fn(this);
              else
                  return options.inverse(this);
            });

            t7.registerHelper('if_any', function (array, options) {
              var match = array && array.length > 0;
              if (match)
                  return options.fn(this);
              else
                  return options.inverse(this);
            });

            t7.registerHelper('if_empty', function (array, options) {
              var match = !array || array.length == 0;
              if (match)
                  return options.fn(this);
              else
                  return options.inverse(this);
            });

            //
            // String Manipulation
            //

            t7.registerHelper('json', function (object, options) {
              return JSON.stringify(this);
            });

            t7.registerHelper('capitalize', function (text) {
                return text.charAt(0).toUpperCase() + text.slice(1);
            });

            t7.registerHelper('isSelected', function (a, b) {
                if (a === b) return 'selected';
                else return '';
            });

            t7.registerHelper('chkstr', function (text) {
                if (text)
                    return text;
                else
                    return '';
            });

            // t7.registerHelper('format_lastshift', function (text) {
            //   if (text)
            //     return 'Last Shift: ' + moment(text).fromNow();
            //   else
            //     return 'No shift started yet';
            // });

            // t7.registerHelper('truncateText', function (text, less) {
            //     if (!text)
            //         return '';
            //     if (!less)
            //         less = 5;
            //     var w = $$( window ).width();
            //     var max_w = (w/9) - less;
            //     if (text.length > max_w)
            //         return text.substring(0, max_w)+'...';
            //     else
            //         return text;
            // });

            t7.registerHelper('sentenceCase', function (text) {
                text = text.replace(/[_-]/g, " ");
                return text.charAt(0).toUpperCase() + text.slice(1);
            });

            t7.registerHelper('tagList', function (array, array1, array2) {
                var output = '';
                if ($$.isArray(array)) { output += util.formatTags(array); }
                if ($$.isArray(array1)) {
                    if (!!output.length) output += ', ';
                    output += util.formatTags(array1);
                }
                if ($$.isArray(array2)) {
                    if (!!output.length) output += ', ';
                    output += util.formatTags(array2);
                }
                return output;
            });

            //
            // URL and Paths
            //

            // t7.registerHelper('addonAssetPath', function (file) {
            //     if (!t7.global.lastVisibleAddon)
            //         throw 'Cannot render addon asset path: ' + file;
            //     return util.addonAssetPath(
            //         t7.global.lastVisibleAddon.package,
            //         t7.global.lastVisibleAddon.version, file);
            // });

            t7.registerHelper('addonAssetUrl', function (file) {
                if (!t7.global.lastVisibleAddon)
                    throw 'Cannot render addon asset URL: ' + file;
                return util.addonAssetUrl(
                    t7.global.lastVisibleAddon.package,
                    t7.global.lastVisibleAddon.version, file, true);
            });

            t7.registerHelper('apiUrl', function (part, part1, part2) {
                var url = config.getApiUrl() + part;
                if (part1 && typeof part1 !== 'object') { url += ('/' + part1); }
                if (part2 && typeof part2 !== 'object') { url += ('/' + part2); }
                return url + '?token=' + config.getSessionToken();
            });

            //
            // Account Access
            //

            t7.registerHelper('ifExistsInArrayOfObjects', function (array, key, value, options) {
                if (array && array.filter(function (v) { return v[key] === value; }).length)
                    return options.fn(this);
                else
                    return options.inverse(this);
            });

            t7.registerHelper('ifCurrentAccount', function (them, options) {
                var us = config.getCurrentAccount();
                if (us.type == them.type && us.id == them.id)
                    return options.fn(this);
                else
                    return options.inverse(this);
            });

            t7.registerHelper('ifNotCurrentAccount', function (them, options) {
                var us = config.getCurrentAccount();
                if (us.type != them.type || us.id != them.id)
                    return options.fn(this);
                else
                    return options.inverse(this);
            });

            t7.registerHelper('ifCanManageAccount', function (them, options) {
                var us = config.getCurrentAccount(),
                    access = false;

                // Manage ourselves
                if (us.type == them.type && us.id == them.id) {
                    access = true;
                }

                // Manage other team members as team owner or manager
                if ((us.team || us.team_manager) && them.team_member) {
                    access = true;
                }

                if (access)
                    return options.fn(this);
                else
                    return options.inverse(this);
            });

            t7.registerHelper('ifCanEditTeamMember', function (user_id, options) {
                var us = config.getCurrentAccount(),
                    user = config.getCurrentUser();

                if (us.team || us.team_manager || (user.id == user_id))
                    return options.fn(this);
                else
                    return options.inverse(this);
            });

            t7.registerHelper('ifCanDeleteTeamMember', function (user_id, options) {
                var us = config.getCurrentAccount(),
                    user = config.getCurrentUser(),
                    team = config.getCurrentTeam();

                if ((us.team || us.team_manager || user.id == user_id) && (team.owner_id != user_id))
                    return options.fn(this);
                else
                    return options.inverse(this);
            });

            t7.registerHelper('ifCurrentUser', function (user_id, options) {
                var us = config.getCurrentUser();

                if (us && us.id == user_id)
                    return options.fn(this);
                else
                    return options.inverse(this);
            });

            t7.registerHelper('ifNotCurrentUser', function (them_id, options) {
                var us = config.getCurrentUser();

                if (!us || us.id != them_id)
                    return options.fn(this);
                else
                    return options.inverse(this);
            });

            t7.registerHelper('hideIfdefaultAccount', function (account_id, name, title, location_id) {
                if (config.getCurrentAccount().id === account_id &&
                    config.getCurrentAccount().name === name &&
                    config.getCurrentAccount().title === title) //  &&
                    // config.getCurrentAccount().location_id === location_id
                    return 'hide';
            });

            //
            // Date and Time
            //

            t7.registerHelper('timeOfDay', function (date) {
                return util.getTimeOfDay(date);
            });

            t7.registerHelper('dateTime', function (date) {
                  if (!date) return '';
                  var y = date.getFullYear(),
                      m = date.getMonth(),
                      d = date.getDate(),
                      h = date.getHours(),
                      min = date.getMinutes() < 10 ? '0' + date.getMinutes() : date.getMinutes();
                  return util.monthNames[m] + ' ' + d + ', ' + y + ' ' + h + ':' + min;
            });

            t7.registerHelper('fromnow', function (text) {
                var localTime = moment.utc(text).toDate();
                var fromnow = moment(localTime).fromNow(true);
                var now = moment();
                var diff = now.diff(moment(localTime), 'days');
                if (diff >= 1 && diff < 8) {
                    return moment(localTime).format("ddd");
                }
                else if (diff >= 8)
                    return moment(localTime).format("MMM D");
                else if (diff >= 365)
                    return moment(localTime).format("MMM D, YYYY");
                else {
                    // hours, minutes, and seconds
                    var diff_hours = now.diff(moment(localTime), 'hours');
                    var diff_mins = now.diff(moment(localTime), 'minutes');
                    var diff_secs = now.diff(moment(localTime), 'seconds');
                    if (diff_mins > 60 &&  diff_hours < 22)
                        return diff_hours + ' hours';
                    else if (diff_mins > 55 &&  diff_mins <= 60)
                        return '1 hour';
                    else if (diff_mins > 1 &&  diff_mins <= 55)
                        return diff_mins + ' mins';
                    else if (diff_mins == 1)
                        return '1 min';
                    else
                        return 'now';
                    // else if (diff_secs >= 2 &&  diff_secs <= 55)
                    //     return diff_secs+' secs';
                    // else if (diff_secs >= 0 &&  diff_secs <= 2)
                    //     return 'now';
                    // else
                    //     return moment(text).fromNow(true);
                }
            });

            // This is used ins displaying the date properly on chat message.
            // NOTE: framework.js was manually edited to call this helper
            t7.registerHelper('messageDate', function (text) {
                var localTime  = moment.utc(text).toDate();
                if (moment(localTime).isValid()) {
                    var fromnow = moment(localTime).fromNow(true);
                    var now = moment();
                    var diff = now.diff(moment(localTime), 'days');
                    if (diff >= 1 && diff < 8) {
                        return moment(localTime).format("ddd h:mm A");
                    }
                    else if (diff >= 8)
                        return moment(localTime).format("MMM D h:mm A");
                    else if (diff >= 365)
                        return moment(localTime).format("MMM D, YYYY h:mm A");
                    else if (diff === 1)
                        return 'Yesterday '+ moment(localTime).format("h:mm A");
                    else
                        return 'Today '+ moment(localTime).format("h:mm A");
                }
                else {
                    return 'None';
                }
            });

            t7.registerHelper('formatDate', function (format,text) {
                var localTime  = moment.utc(text).toDate();
                var day = moment(localTime, "YYYY-MM-DD");
                return moment(day).format(format);
            });

            t7.registerHelper('formatDateTime', function (format,text) {
                // var localTime  = moment.utc(text).toDate();
                return moment(text).format(format);
            });

            // t7.registerHelper('actionConditionOptions', function (selected, options) {
            //     var html = '',
            //         conditions = ['equals',
            //                       'not_equal_to',
            //                       'less_than',
            //                       'less_than_or_equal_to',
            //                       'greater_than',
            //                       'greater_than_or_equal_to',
            //                       'contains',
            //                       'does_not_contain',
            //                       'starts_with',
            //                       'does_not_start_with',
            //                       'ends_with',
            //                       'does_not_end_with'];
            //     for (var i = 0; i < conditions.length; i++) {
            //         var cond = conditions[i];
            //         html += '<option value="' + cond + '" ' + (cond == selected ? 'selected' : '') + '>' + cond + '</option>';
            //
            //     }
            // });

            // t7.registerHelper('join_roles', function (text) {
            //     alert('fixme: join_roles remove underscore');
            //     // var roleNames = _.pluck(text, 'name');
            //     // return roleNames.join();
            // });

            // t7.registerHelper('heightrs', function (text) {
            //     if (text)
            //         return parseInt(text)*86;
            //     else
            //         return '86';
            // });

            // t7.registerHelper('heightweekday', function (text) {
            //     if (text)
            //         return parseInt(text.length)*84;
            //     else
            //         return '84';
            // });

            // Tax Employment Status
            // t7.registerHelper('chktes', function (text) {
            //     if (text  === '1' || text  === 1)
            //         return 'Skipped';
            //     else if (text  === '2' || text  === 2)
            //         return 'Resident';
            //     else if (text  === '3' || text  === 3)
            //         return 'Temporary Work Visa';
            //     else if (text  === '4' || text  === 4)
            //         return 'Working Holiday Visa';
            //     else
            //         return '';
            // });
            //
            // t7.registerHelper('employmentStatus', function (text) {
            //     if (text  === '1')
            //         return 'Employed';
            //     else if (text  === '0')
            //         return 'On-boarding';
            //     else if (text  === '3')
            //         return 'Terminated';
            //     else
            //         return 'Others';
            // });
            //
            // t7.registerHelper('employmentEnded', function (text) {
            //     if (text)
            //         return text;
            //     else
            //         return 'Current';
            // });
            //
            // t7.registerHelper('entityType', function (id) {
            //     var taxEntityList = [];
            //         taxEntityList[1] =  "Sole Trader";
            //         taxEntityList[2] =  "Partnership";
            //         taxEntityList[3] =  "Trust";
            //         taxEntityList[4] =  "Company";
            //
            //     if (id)
            //         return taxEntityList[id];
            //     else
            //         return '';
            // });
            //
            // t7.registerHelper('repeatText', function (text) {
            //     if (text === 'none')
            //         return '';
            //     else
            //         return 'Repeats ' + text;
            // });
            //
            // t7.registerHelper('truncateChatMessage', function (text) {
            //     var w = $(window).width();
            //     var max_w = ((w/9) - 3)*2;
            //     if (text.length > max_w)
            //         return text.substring(0, max_w)+'...';
            //     else
            //         return text;
            // });
        }
    };

    return tplHelpers;
});
