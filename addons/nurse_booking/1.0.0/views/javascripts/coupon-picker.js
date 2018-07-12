export default function(confirm, skip) {
  // TODO: get API request for avialable coupons first

  const f7 = window.tommy.app.f7;
  let currentCouponId;
  const html = tommy.tplManager.render('nurse_bookink__couponPickerTemplate', {
    items: [
      {
        title: 'Title 1',
        date: '13.07.2018 - 15.07.2018',
        id: 1,
      },
      {
        title: 'Title 2',
        date: '13.07.2018 - 15.07.2018',
        id: 2,
      },
      {
        title: 'Title 3',
        date: '13.07.2018 - 15.07.2018',
        id: 3,
      },
    ]
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
          if (confirm) confirm(currentCouponId);
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
    }
  });
}