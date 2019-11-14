function humanTime(date) {
  const moment = window.tommy.moment;
  const localTime = moment.utc(date).toDate();
  if (moment(localTime).isValid()) {
    const now = moment();
    const diff = now.diff(moment(localTime), "days");
    if (diff === 1) {
      return `Yesterday ${moment(localTime).format("h:mm A")}`;
    }
    if (diff === 0) {
      return `Today ${moment(localTime).format("h:mm A")}`;
    }
    if (diff === -1) {
      return `Yesterday ${moment(localTime).format("h:mm A")}`;
    }
    if ((diff >= 1 && diff <= 8) || (diff >= -8 && diff <= -1)) {
      return moment(localTime).format("ddd h:mm A");
    }
    if (diff >= 365 || diff <= -365) {
      return moment(localTime).format("MMM D, YYYY h:mm A");
    }
    if (diff >= 8 || diff <= -8) {
      return moment(localTime).format("MMM D h:mm A");
    }
  }
  return "None";
}

export default humanTime;
