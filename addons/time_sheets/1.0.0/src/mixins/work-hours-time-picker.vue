<script>
  export default {
    methods: {
      openWorkHoursTimePicker() {
        const self = this;
        self.workHoursTimePickerInstance.open();
      },
      createWorkHoursTimePicker(target) {
        const self = this;
        const time = target.split('.');
        const hours = time.length === 2 ? time[0] : time;
        const minutes = time.length === 2 ? time[1] : '00';
        const hoursArr = [];
        const minutesArr = [];
        for (let i = 0; i <= 23; i += 1) {
          const hour = i < 10 ? `0${i}` : i;
          hoursArr.push(hour);
        }
        for (let i = 0; i <= 59; i += 1) {
          const minute = i < 10 ? `0${i}` : i;
          minutesArr.push(minute);
        }

        self.workHoursTimePickerInstance = self.$f7.picker.create({
          inputEl: '#workHoursTimePicker',
          toolbar: true,
          rotateEffect: false,
          sheetPush: true,
          openIn: 'popover',
          formatValue: values => {
            return `${values[0]}:${values[1]}`;
          },
          value: [String(hours), String(minutes)],
          cols: [
            {
              values: hoursArr
            },
            {
              divider: true,
              content: ":"
            },
            {
              values: minutesArr,
            }
          ]
        });
        self.workHoursTimePickerInstance.on("close", () => {
          const self = this;
          const hours = Number(self.workHoursTimePickerInstance.value[0]);
          const minutes = self.workHoursTimePickerInstance.value[1];
          self.timesheetShift.work_hours = `${hours}.${minutes}`;
        });
      }
    }
  };
</script>
