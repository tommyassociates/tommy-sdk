import cnCategories from './cn-categories';

export default function (service = {}, coupons = [], userId) {
  const isPackage = !!service.vendor_package_products;
  let match = coupons.filter((c) => {
    if (c.category === service.category || c.category === cnCategories[service.category]) return true;
    if (isPackage && c.vendor_package_id === service.id) return true;
    if (!isPackage && c.vendor_product_id === service.id) return true;
    return false;
  });
  match = match.filter((c) => {
    if (c.max_uses && c.use_count >= c.max_uses) return false;
    if (c.user_id && c.user_id !== userId) return false;
    if (c.valid_to && new Date(c.valid_to).getTime() > new Date().getTime()) {
      return false;
    }

    return true;
  });

  return match;
}
