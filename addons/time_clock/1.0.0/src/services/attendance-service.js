const AttendanceService = {
  test: undefined,

  /**
   * Appends user information to the attendances.
   * @param data
   * @param self
   * @returns {*}
   */
  prepareAttendances(data, self) {

    data.forEach(e => {
      const user = self.$root.teamMembers.find(
        member => member.user_id === e.user_id
      );
      e.user_name = `${user.first_name} ${user.last_name}`;
      e.icon_url = user.icon_url;
    });
    return data;
  },

  /**
   * Appends user information to the attendance.
   * @param data
   * @param self
   * @returns {*[]}
   */
  prepareAttendance(data, self) {

    if (data === null) return null;

    const user = self.$root.teamMembers.find(
      member => member.user_id === data.user_id
    );
    data.user_name = `${user.first_name} ${user.last_name}`;
    data.icon_url = user.icon_url;
    return data;


  },

  /**
   * Will split the attendance records into days starting with "Today", "Yesterday" and then a date format for
   * each other day.
   * @param data
   * @param self
   * @returns {*}
   */
  splitAttendanceIntoDays(data = [], self) {

    //format the data.
    const today = self.$moment(new Date()).subtract(1, 'day');
    const yesterday = self.$moment(new Date()).subtract(2, 'day');

    const days = data.reduce((days, attendance) => {
      const date = attendance.timestamp.split('T')[0];
      if (!days[date]) {

        //work out title.
        let title = '';
        if (self.$moment(date).isSame(today, 'day')) {
          title = self.$t('time_clock.index.today_title');
        } else if (self.$moment(date).isSame(yesterday, 'day')) {
          title = self.$t('time_clock.index.yesterday_title');
        } else {
          title = self.$moment(date).format('ddd Do MMM, YYYY');
        }

        days[date] = {
          title: title,
          attendances: []
        };
      }
      days[date].attendances.push(attendance);
      return days;
    }, {});

    return days;
  },

  /**
   * Return the data format for use by the <Events> component.
   * @param data
   * @param self
   * @returns {{[p: string]: {title: *, attendances: [*]}, active: {title: *, attendances: [*]}}}
   */
  formatAttendanceActive(data = [], self) {
    const title = self.$t('time_clock.index.active_title');
    return {
      ['active']: {
        title,
        attendances: data ? [data] : null
      }
    };
  },
};


export default AttendanceService;
