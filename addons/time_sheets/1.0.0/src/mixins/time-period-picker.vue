<script>
  import API from '../api';

  export default {
    methods: {
      openTimePeriodPicker() {
        const self = this;
        self.timePeriodPickerInstance.open();
      },

      /**
       *
       * @param startDay - mon, tue, wed, thu, fri, sat, sun
       * @param duration - week, fortnight, month
       */
      createTimePeriodPicker(startDay = 'mon', duration = 'week') {
        const self = this;
        const maxItems = 200;
        let currentItem = 1;
        let currentDate = self.$moment();
        let displayValues = [];
        let values = [];

        //find startDay
        switch (duration.toUpperCase()) {
          case 'WEEK':
            while (currentDate.format('ddd').toUpperCase() !== startDay.toUpperCase()) {
              currentDate = currentDate.subtract('1', 'day');
            }
            break;

          case 'FORTNIGHT':

            //Get start day.
            while (currentDate.format('ddd').toUpperCase() !== startDay.toUpperCase()) {
              currentDate = currentDate.subtract('1', 'day');
            }

            //Get the week number
            const weekNumber = currentDate.week() - self.$moment(currentDate).startOf('month').week() + 1;

            //Check if we need to subtract a week from the current date. We will if its an even weekNumber
            const isOdd = x => x % 2 === 1;
            if (!isOdd(weekNumber)) {
              currentDate = currentDate.subtract('1', 'week');
            }

            console.log('weekNumber', weekNumber);

            break;

          case 'MONTH':
            currentDate = currentDate.startOf('month');

            break;

          default:
          //custom range
          //TODO.
        }


        while (currentItem <= maxItems) {
          const startDate = self.$moment(currentDate);
          const endDate = self.getEndDate(duration, currentDate);
          switch (duration.toUpperCase()) {
            case 'WEEK':
              // const endDate = self.getEndDate(duration, currentDate);
              displayValues.push(`${startDate.format('DD MMM YY')} - ${endDate.format('DD MMM YY')}`);
              values.push(startDate.format('YYYY-MM-DD'));
              currentDate = currentDate.subtract('1', duration);
              break;

            case 'FORTNIGHT':
              //TODO.
              // const endDate = self.getEndDate(duration, currentDate);
              displayValues.push(`${startDate.format('DD MMM YY')} - ${endDate.format('DD MMM YY')}`);
              values.push(startDate.format('YYYY-MM-DD'));
              currentDate = currentDate.subtract('2', 'week');
              break;

            case 'MONTH':
              displayValues.push(`${startDate.format('MMM YY')}`);
              values.push(startDate.format('YYYY-MM-DD'));
              currentDate = currentDate.subtract('1', duration);
              break;

            default:
            //custom range
            //TODO.
          }

          currentItem++;

        }


        self.timePeriodPickerInstance = self.$f7.picker.create({
          inputEl: '#timePeriodPicker',
          toolbar: true,
          rotateEffect: true,
          openIn: 'popover',
          cols: [
            {
              textAlign: 'center',
              values,
              displayValues,
            },
          ]
        });
        self.timePeriodPickerInstance.on("close", () => {
          const self = this;
          console.log('timePeriodPickerInstance', self.timePeriodPickerInstance.value);

          // let date_new = new Date(self.detail_data.timestamp);
          // date_new.setHours(Number(self.timePeriodPickerInstance.value[0]));
          // date_new.setMinutes(Number(self.timePeriodPickerInstance.value[1]));
          // date_new = date_new.toISOString();
          // self.detail_data.timestamp = date_new;

          const selectedTimesheet = self.timesheetsData
            .find(timesheet => String(timesheet.start_date) === String(self.timePeriodPickerInstance.value));

          if (selectedTimesheet) {
            const url = `/time-sheets/detail/${selectedTimesheet.id}`;
            console.log(url);
            self.$f7router.navigate(url);
          } else {
            //create a timesheet.

            const startDate = self.$moment(self.timePeriodPickerInstance.value[0]).format('YYYY-MM-DD');
            const endDate = self.getEndDate(duration, self.$moment(startDate)).format('YYYY-MM-DD');
            const newTmesheetData = {
              start_date: startDate,
              end_date: endDate,
              team_id: self.$root.account.team_id,
              user_id: self.$root.account.user_id,
              status: 'unsubmitted',
            };
            console.log('newTmesheetData', newTmesheetData);
            API.createTimesheet(newTmesheetData).then(timesheet => {
              console.log('timesheet created', timesheet);
              const url = `/time-sheets/detail/${timesheet.id}`;
              self.$f7router.navigate(url);
              self.$events.$emit("time_sheets:timesheet_created", timesheet);
            })
          }
        });
      },

      getEndDate(duration, currentDate) {
        const self = this;
        switch (duration.toUpperCase()) {
          case 'WEEK':
            return self.$moment(currentDate).add('6', 'days');

          case 'FORTNIGHT':
            return self.$moment(currentDate).add('13', 'days');
            break;

          case 'MONTH':
            return self.$moment(currentDate).endOf('month');
        }
      },
    }
  };
</script>
