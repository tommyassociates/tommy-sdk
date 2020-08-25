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
       * @param startDay - monday, tueday, wednesday, thursday, friday, saturday, sunday
       * @param duration - weekly, fortnightly, monthly
       * @param payrollPeriodStart - the date of the payroll period from the API.
       */
      createTimePeriodPicker({startDay = 'sunday', duration = 'weekly', payrollPeriodStart = ''}) {
        const self = this;
        const config = {
          futureItems: 25,
          pastItems: 25,
          dayOfWeekFormat: 'dddd',
        }

        let currentItem = 1;
        let currentDate = self.$moment(payrollPeriodStart);
        let displayValues = [];
        let values = [];

        //find start date.
        currentDate = currentDate.add(config.futureItems, self.getDurationValue(duration));

        const totalItems = +config.futureItems + +config.pastItems;
        while (currentItem <= totalItems) {
          const startDate = self.$moment(currentDate);
          const endDate = self.getEndDate(duration, currentDate);
          switch (duration.toUpperCase()) {
            case 'WEEKLY':
              // const endDate = self.getEndDate(duration, currentDate);
              displayValues.push(`${startDate.format('DD MMM YY')} - ${endDate.format('DD MMM YY')}`);
              values.push(startDate.format('YYYY-MM-DD'));
              currentDate = currentDate.subtract('1', self.getDurationValue(duration));
              break;

            case 'FORTNIGHTLY':
              //TODO.
              // const endDate = self.getEndDate(duration, currentDate);
              displayValues.push(`${startDate.format('DD MMM YY')} - ${endDate.format('DD MMM YY')}`);
              values.push(startDate.format('YYYY-MM-DD'));
              currentDate = currentDate.subtract('2', 'week');
              break;

            case 'MONTHLY':
              displayValues.push(`${startDate.format('MMM YY')}`);
              values.push(startDate.format('YYYY-MM-DD'));
              currentDate = currentDate.subtract('1', self.getDurationValue(duration));
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
          ],
          value: [payrollPeriodStart],
        });
        self.timePeriodPickerInstance.on("close", () => {
          const self = this;
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
              team_id: self.$store.state.account.account.team_id,
              user_id: self.$store.state.account.account.user_id,
              status: 'unsubmitted',
            };

            API.createTimesheet(newTmesheetData).then(timesheet => {
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
          case 'WEEKLY':
            return self.$moment(currentDate).add('6', 'days');

          case 'FORTNIGHTLY':
            return self.$moment(currentDate).add('13', 'days');
            break;

          case 'MONTHLY':
            return self.$moment(currentDate).endOf('month');
        }
      },

      getDurationValue(duration) {
        return duration.toLowerCase().replace('ly', '');
      },
    }
  };
</script>
