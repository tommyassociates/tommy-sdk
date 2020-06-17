const TimesheetService = {
  test: undefined,


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

  formatTimesheetsData(timesheetsData, timesheetsItemsData, self) {
    let formattedData = [];
    timesheetsData.forEach(timesheet => {

      const items = timesheetsItemsData.filter(timesheetsItem => +timesheetsItem.timesheet_id === +timesheet.id);
      const title = TimesheetService.dateRangeFormat(timesheet.start_date, timesheet.end_date, self);
      const itemsString = items.length === 1 ? self.$t('time_sheets.index.items_label_singular') : self.$t('time_sheets.index.items_label_plural');
      const description = `${items.length} ${itemsString}`;
      const workHours = items.reduce((totalHours, item) => +totalHours + +item.work_hours, 0);
      const hours = Math.floor(workHours);
      const minutes = String(parseFloat(workHours - hours).toFixed(2)).replace('0.', '');
      const extraCssClasses = timesheet.status === 'unsubmitted'
        ? 'circle--red'
        : timesheet.status === 'submitted'
          ? 'circle--orange'
          : 'circle--green';

      const data = {
        id: timesheet.id,
        title,
        description,
        hours,
        minutes,
        extra_css_classes: extraCssClasses,
      };

      formattedData.push(data);

    });
    return formattedData;
  },

  formatTimesheetsShiftsData(timesheetsShiftsData, self) {
    let formattedData = [];
    timesheetsShiftsData.forEach(timesheetShift => {

      const title = self.$moment(timesheetShift.start_date).format('ddd, D MMM');
      const description = timesheetShift.address;
      const workHours = timesheetShift.work_hours;
      const hours = Math.floor(workHours);
      const minutes = String(parseFloat(workHours - hours).toFixed(2)).replace('0.', '');

      const data = {
        id: timesheetShift.id,
        title,
        description,
        hours,
        minutes,
        work_hours: workHours,
      };

      formattedData.push(data);

    });
    return formattedData;
  },

  dateRangeFormat(startDate = '', endDate = '', self) {
    const dateFormat = 'DD MMM YY';
    const startDateFormatted = startDate ? self.$moment(startDate).format(dateFormat) : '';
    const endDateFormatted = endDate ? self.$moment(endDate).format(dateFormat) : '';
    return startDateFormatted && endDateFormatted
      ? `${startDateFormatted} - ${endDateFormatted}`
      : `${startDateFormatted}${endDateFormatted}`;
  },

  formattedManagerTimesheetsData(managerTimesheetsData, managerTimesheetsShiftsData, status, self) {
    let formattedData = [];
    managerTimesheetsData
      .filter(managerTimesheet => managerTimesheet.status === status)
      .forEach(managerTimesheet => {

        const teamMember = self.$root.teamMembers.find(teamMember => +teamMember.id === +managerTimesheet.user_id);
        const title = teamMember ? String(`${teamMember.first_name} ${teamMember.last_name}`).trim() : 'TO';
        const timesheetsShifts = managerTimesheetsShiftsData
          .filter(timesheetShift => timesheetShift.timesheet_id === +managerTimesheet.id);
        const itemsString = timesheetsShifts.length === 1
          ? self.$t('time_sheets.index.items_label_singular')
          : self.$t('time_sheets.index.items_label_plural');
        const workHours = timesheetsShifts.reduce((totalHours, item) => +totalHours + +item.work_hours, 0);
        const workHoursString = workHours === 1
          ? self.$t('time_sheets.index.hours_label_singular')
          : self.$t('time_sheets.index.hours_label_plural');
        const description = `${timesheetsShifts.length} ${itemsString} ${workHours} ${workHoursString}`;
        const isSelected = managerTimesheet.isSelected;

        const data = {
          id: managerTimesheet.id,
          teamMember,
          title,
          description,
          isSelected,
        };

        formattedData.push(data);

      });
    return formattedData;
  },

  formattedManagerAttendancesData(managerAttendancesData, self) {
    let formattedData = [];
    managerAttendancesData
      .forEach(attendance => {

        const attendanceDate = self.$moment(attendance.timestamp).format('ddd, D MMM YY');
        const startTime = self.$moment(attendance.timestamp).format('h:mma');
        const data = {
          id: attendance.id,
          status: attendance.status,
          hours: 10,
          attendanceDate,
          startTime,
        };

        formattedData.push(data);

      });
    return formattedData;
  },
};


export default TimesheetService;
