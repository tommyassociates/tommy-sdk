export default function (text, format) {
  const self = this;
  const localTime = self.$moment.utc(text).toDate();
  return self.$moment(localTime).format(format);
}
