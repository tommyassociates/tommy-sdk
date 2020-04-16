import cnCategories from './cn-categories';

// coupon.category = Cleaning
// service.category = 常规家政

export default function (service = {}, coupons = [], userId) {
  const isPackage = !!service.package_products;
  let match = coupons.filter((c) => {
    if (c.vendor_product_id === null && c.vendor_package_id === null && (c.category === null || c.category === '')) return true;
    if (c.category === service.category || service.category === cnCategories[c.category]) return true;
    if (isPackage && c.vendor_package_id === service.id) return true;
    if (!isPackage && c.vendor_product_id === service.id) return true;
    return false;
  });
  match = match.filter((c) => {
    if (c.max_uses && c.use_count >= c.max_uses) return false;
    if (c.user_id && c.user_id !== userId) return false;
    if (c.valid_to && new Date().getTime() > new Date(c.valid_to).getTime()) {
      return false;
    }

    return true;
  });

  return match;
}
