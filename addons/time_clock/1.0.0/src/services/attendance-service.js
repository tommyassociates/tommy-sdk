const AttendanceService = {
  test: undefined,

  /**
   * Appends user information to the attendances.
   * @param data
   * @param self
   * @returns {*}
   */
  prepareAttendances(data, self) {
    console.log('TIMECLOCK - prepareAttendances');
    if (data === null) return null;
    console.log('TIMECLOCK - prepareAttendances - after data check.');


    data.forEach(e => {
      // const user = self.$root.teamMembers.find(
      //   member => member.user_id === e.user_id
      // );

      console.log('TIMECLOCK - prepareAttendances - after data check. data - e', JSON.stringify(e));

      const user = self.$store.state.teamMembers.teamMembers.find(
        member => member.user_id === e.user_id
      );
      console.log('TIMECLOCK - prepareAttendances - after data check. data - user', JSON.stringify(user));
      if (user) {
        e.user_name = `${user.first_name} ${user.last_name}`;
        e.icon_url = e.image ? e.image.url : user.icon_url;
      } else {
        console.log('TIMECLOCK - prepareAttendances - after data check. data - user not found.');
      }
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
    console.log('TIMECLOCK - prepareAttendance');
    if (data === null) return null;
    console.log('TIMECLOCK - prepareAttendance - after data check.');

    // const user = self.$root.teamMembers.find(
    //   member => member.user_id === data.user_id
    // );

    const user = self.$store.state.teamMembers.teamMembers.find(
      member => member.user_id === data.user_id
    );
    data.user_name = `${user.first_name} ${user.last_name}`;
    data.icon_url = data.image ? data.image.url : user.icon_url;
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
    console.log('TIMECLOCK - splitAttendanceIntoDays');

    //format the data.
    const today = self.$moment(new Date()).format('YYYY-MM-DD');
    const yesterday = self.$moment(today).subtract(1, 'day').format('YYYY-MM-DD');

    const days = data.reduce((days, attendance) => {
      const dateTimestamp = attendance.timestamp; //.split('T')[0];
      console.log('TIMECLOCK - splitAttendanceIntoDays - dateTimestamp', dateTimestamp);
      const date = self.$moment(dateTimestamp).format('YYYY-MM-DD');
      if (!days[date]) {

        //work out title.
        let title = '';
        if (self.$moment(dateTimestamp).format('YYYY-MM-DD') === today) {
          title = self.$t('time_clock.index.today_title');
        } else if (self.$moment(dateTimestamp).format('YYYY-MM-DD') === yesterday) {
          title = self.$t('time_clock.index.yesterday_title');
        } else {
          title = self.$moment(dateTimestamp).format('ddd Do MMM, YYYY');
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
