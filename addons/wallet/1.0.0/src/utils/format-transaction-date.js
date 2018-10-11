export default function (date) {
  if (!date) return '';
  const d = new Date(date);
  const year = d.getFullYear();

  let month = d.getMonth() + 1;
  if (month < 10) month = `0${month}`;

  let day = d.getDate();
  if (day < 10) day = `0${day}`;

  let hours = d.getHours();
  if (hours < 10) hours = `0${hours}`;

  let minutes = d.getMinutes();
  if (minutes < 10) minutes = `0${minutes}`;

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}
