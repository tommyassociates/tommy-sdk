import currencyMap from './currency-map';

export default function (item) {
  return `${item.status === 'paid' || item.status === 'failed' ? '-' : '+'} ${currencyMap(item.currency)}${item.amount}`;
}