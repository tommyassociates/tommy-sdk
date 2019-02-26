/* eslint no-param-reassign: off */
export default function (min, max) {
  min = parseFloat(min);
  max = parseFloat(max);
  if (Number.isNaN(min)) min = 0;
  if (Number.isNaN(max)) max = 0;
  if (!min && !max) return '';
  if (min && !max) return `&gt; ${min}`;
  if (max && !min) return `&lt; ${max}`;
  if (min && max && min === max) return min;
  if (max && min) return `${min} - ${max}`;
  return '';
}
