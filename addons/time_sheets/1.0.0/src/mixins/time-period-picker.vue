<script>
  export default {
    methods: {
      openTimePeriodPicker(){
        const self = this;
        self.timePeriodPickerInstance.open();
      },
      createTimePeriodPicker(startDay = 'mon', duration = 'week') {
        const self = this;
        const maxItems = 50;
        let currentItem = 1;
        let currentDate = self.$moment();
        let values = [];

        //find startDay
        while (currentDate.format('ddd').toUpperCase() !== startDay.toUpperCase()) {
          currentDate = currentDate.subtract('1', 'day');
        }

        while(currentItem <= maxItems) {
          const startDate = self.$moment(currentDate);
          const endDate = self.$moment(currentDate).add('6', 'days');
          values.push(`${startDate.format('DD MMM YY')} - ${endDate.format('DD MMM YY')}`);
          currentItem++;
          currentDate = currentDate.subtract('1', duration);
        }


        self.timePeriodPickerInstance = self.$f7.picker.create({
          inputEl: '#timePeriodPicker',
          toolbar: true,
          rotateEffect: true,
          openIn: 'popover',
          cols: [
            {
              textAlign: 'center',
              values
            },
          ]
        });
        self.timePeriodPickerInstance.on("close", () => {
          const self = this;
          // let date_new = new Date(self.detail_data.timestamp);
          // date_new.setHours(Number(self.timePeriodPickerInstance.value[0]));
          // date_new.setMinutes(Number(self.timePeriodPickerInstance.value[1]));
          // date_new = date_new.toISOString();
          // self.detail_data.timestamp = date_new;
        });
      }
    }
  };
</script>
