<script>
export default {
  methods: {
    openTimePicker(){
        const self = this;
        self.timePickerInstance.open();
    },
    createTimePicker(target) {
      const self = this;
      const date = new Date(target);
      const hoursArr = [];
      const minutesArr = [];
      for (let i = 0; i <= 23; i += 1) {
        hoursArr.push(i);
      }
      for (let i = 0; i <= 59; i += 1) {
        minutesArr.push(i);
      }

      self.timePickerInstance = self.$f7.picker.create({
        inputEl: '#timePicker',
        toolbar: true,
        rotateEffect: false,
        sheetPush: true,
        openIn: 'popover',
        formatValue: values => {
          if (values[1] < 10) {
            return values[0] + ":0" + values[1];
          } else {
            return values[0] + ":" + values[1];
          }
        },
        value: [date.getHours(), date.getMinutes()],
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
            displayValues: minutesArr.map(m => (m < 10 ? `0${m}` : m))
          }
        ]
      });

      self.timePickerInstance.on("close", () => {
        const self = this;
        let date_new = new Date(self.detail_data.date);
        date_new.setUTCHours(self.timePickerInstance.value[0]);
        date_new.setUTCMinutes(self.timePickerInstance.value[1]);
        date_new = date_new.toISOString();
        self.detail_data.date = date_new;
      });
    }
  }
};
</script>