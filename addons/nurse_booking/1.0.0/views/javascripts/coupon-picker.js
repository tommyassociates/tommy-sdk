export default function(coupons, confirm, skip) {
  const f7 = window.tommy.app.f7;
  let currentCouponId;
  let currentCoupon;
  const html = tommy.tplManager.render('nurse_bookink__couponPickerTemplate', {
    coupons,
  });
  const modalEl = f7.modal({
    afterText: html,
    buttons: [
      {
        text: tommy.i18n.t('coupon_picker.skip_button', { defaultValue: 'Skip' }),
        onClick() {
          if (skip) skip();
        }
      },
      {
        text: tommy.i18n.t('coupon_picker.confirm_button', { defaultValue: 'Confirm' }),
        bold: true,
        onClick() {
          if (confirm) confirm(currentCoupon);
        }
      }
    ]
  });
  const $modalEl = $$(modalEl);
  $modalEl.addClass('nurse_booking-coupon-picker-modal');
  $modalEl.find('.modal-button-bold').addClass('modal-button-disabled');
  $modalEl.find('input').on('change', (e) => {
    $modalEl.find('.modal-button-bold').removeClass('modal-button-disabled');
    if (e.target.checked) {
      currentCouponId = e.target.value;
      coupons.forEach((coupon) => {
        if (coupon.id == parseInt(currentCouponId, 10)) {
          currentCoupon = coupon;
        }
      })
    }
  });
}