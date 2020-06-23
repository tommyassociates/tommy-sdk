<script>
  export default {
    methods: {
      openBreakHoursTimePicker() {
        const self = this;
        self.breakkHoursTimePickerInstance.open();
      },
      createBreakHoursTimePicker(target) {
        const self = this;
        const time = target !== undefined ? target.split('.') : '0.0'.split('.');
        const hours = time.length === 2 ? time[0] : time;
        const minutes = time.length === 2 ? time[1] : '00';
        const hoursArr = [];
        const hoursDisplayArr = [];
        const minutesArr = [];
        const minutesDisplayArr = [];
        for (let i = 0; i <= 23; i += 1) {
          const hour = i < 10 ? `0${i}` : i;
          hoursArr.push(i);
          hoursDisplayArr.push(hour);
        }
        for (let i = 0; i <= 59; i += 1) {
          const minute = i < 10 ? `0${i}` : i;
          minutesArr.push(i);
          minutesDisplayArr.push(minute);
        }

        self.breakHoursTimePickerInstance = self.$f7.picker.create({
          inputEl: '#breakHoursTimePicker',
          toolbar: true,
          rotateEffect: false,
          sheetPush: true,
          openIn: 'popover',
          formatValue: values => {
            const hour = values[0] < 10 ? `0${values[0]}` : values[0];
            const minutes = values[1] < 10 ? `0${values[1]}` : values[1];
            return `${hour}:${minutes}`;
          },
          value: [String(hours), String(minutes)],
          cols: [
            {
              values: hoursArr,
              displayValues: hoursDisplayArr,
            },
            {
              divider: true,
              content: ":"
            },
            {
              values: minutesArr,
              displayValues: minutesDisplayArr,
            }
          ]
        });
        self.breakHoursTimePickerInstance.on("close", () => {
          const self = this;
          const hours = self.breakHoursTimePickerInstance.value[0];
          const minutes = self.breakHoursTimePickerInstance.value[1] < 10
            ? `0${self.breakHoursTimePickerInstance.value[1]}`
            : self.breakHoursTimePickerInstance.value[1];
          self.timesheetShift.break_hours = `${hours}.${minutes}`;
        });
      }
    }
  };
</script>
