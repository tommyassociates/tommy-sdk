/**
 * Will take an array of hours and minutes and return a sum of the total
 * @param timesArray ['1.23', '0.23', '4.00']
 * @param self
 * @param delimiter - character between the hours and minutes.
 * @returns {string}
 */
const sumArrayOfTimes = (timesArray, self, delimiter = ':') => {
  const startDate = self.$moment();
  let endDate = self.$moment(startDate);
  timesArray.forEach(times => {
    const [hours, minutes] = times.split('.');
    endDate = self.$moment(endDate)
      .add(hours, 'hours')
      .add(minutes, 'minutes');
  });

  const hours = self.$moment.duration(endDate.diff(startDate)).hours();
  const minutes = String(self.$moment.duration(endDate.diff(startDate)).minutes())
    .padStart(2, '0');
  return `${hours}${delimiter}${minutes}`;
};
export default sumArrayOfTimes;
