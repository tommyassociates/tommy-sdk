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
      //const itemsString = items.length === 1 ? self.$t('time_sheets.index.items_label_singular') : self.$t('time_sheets.index.items_label_plural');
      const description = `${items.length} Items`;
      const workHours = items.reduce((totalHours, item) => +totalHours + +item.work_hours, 0);
      const hours = Math.floor(workHours);
      const minutes = String(parseFloat(workHours - hours).toFixed(2)).replace('0.', '');

      const data = {
        id: timesheet.id,
        title,
        description,
        hours,
        minutes,
      };

      formattedData.push(data);

    });
    return formattedData;
  },

  formatTimesheetsItemsData(timesheetsItemsData, self) {
    let formattedData = [];
    timesheetsItemsData.forEach(timesheetItem => {

      const title = self.$moment(timesheetItem.start_date).format('ddd, D MMM');
      const description = timesheetItem.address;
      const workHours = timesheetItem.work_hours;
      const hours = Math.floor(workHours);
      const minutes = String(parseFloat(workHours - hours).toFixed(2)).replace('0.', '');

      const data = {
        id: timesheetItem.id,
        title,
        description,
        hours,
        minutes,
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
};


export default TimesheetService;
