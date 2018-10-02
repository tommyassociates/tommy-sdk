export default function (name) {
  const nameSplitted = name.split(' ');
  let formattedName = name[0];
  formattedName += nameSplitted.length > 1 ? nameSplitted[1][0] : name[1];
  return formattedName;
}
