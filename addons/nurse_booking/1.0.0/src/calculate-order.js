import API from './api';

function subtotal(order) {
  const { services } = order;
  let amount = 0;
  services.forEach((service) => {
    amount += service.price;
  });
  return amount;
}

// servicePrice() {
//   const self = this;
//   const { services } = self;
//   let price = 0;
//   services.forEach((service) => {
//     price += service.price;
//   });
//   return price;
// },

function discount(order) {
  const { coupons, services } = order;
  const sub = subtotal(order)
  let amount = 0;
  if (coupons) {
    coupons.forEach((coupon) => {
      amount += coupon.kind !== 'percentage' ? coupon.amount : coupon.amount * sub;
    });
  }
  if (amount > sub) amount = sub;
  return amount;
}

function total(order) {
  return Math.max(subtotal(order) - discount(order), 0);
}

export default function (order) {
  return {
    subtotal: subtotal(order),
    discount: discount(order),
    total: total(order)
  };
}
