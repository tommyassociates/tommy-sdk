function formatDate(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  let month = d.getMonth() + 1;
  let day = d.getDate();
  if (month < 10) month = `0${month}`;
  if (day < 10) day = `0${day}`;
  return `${year}-${month}-${day}`;
}
export default function(range) {
  if (!range) return "";
  if (typeof range === "string") {
    return window.tommy.i18n.t(`invoicing.date_range.${range}`);
  }
  if (Array.isArray(range)) {
    return `${formatDate(range[0])} - ${formatDate(range[1])}`;
  }
  return range || "";
}
