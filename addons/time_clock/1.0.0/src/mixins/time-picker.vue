<script>
export default {
  methods: {
    openTimePicker(){
        this.timePickerInstance.open();
    },
    createTimePicker(target) {
      const date = new Date(target);
      const hoursArr = [];
      const minutesArr = [];
      for (let i = 0; i <= 23; i += 1) {
        hoursArr.push(i);
      }
      for (let i = 0; i <= 59; i += 1) {
        minutesArr.push(i);
      }

      this.timePickerInstance = this.$f7.picker.create({
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
      this.timePickerInstance.on("close", () => {
        let date_new = new Date(this.detail_data.timestamp);
        date_new.setHours(Number(this.timePickerInstance.value[0]));
        date_new.setMinutes(Number(this.timePickerInstance.value[1]));
        date_new = date_new.toISOString();
        this.detail_data.timestamp = date_new;
      });
    }
  }
};
</script>
