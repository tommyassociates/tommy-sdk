export default function (date, format) {
  const moment = window.tommy.moment;
  const localTime = moment.utc(date).toDate();
  return moment(localTime).format(format);
}
