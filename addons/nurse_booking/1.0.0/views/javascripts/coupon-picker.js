export default function() {
  // TODO: get API request for avialable coupons first

  const f7 = window.tommy.app.f7;
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
        text: 'Skip',
        onClick() {
          // TODO: skip callback
        }
      },
      {
        text: 'Confirm',
        bold: true,
        onClick() {
          // TODO: confirm callback, return selected item ID
        }
      }
    ]
  });
  $$(modalEl).addClass('nurse_booking-coupon-picker-modal');
  // TODO: disable confirm button if nothing selected
  // TODO: handle radios change to get selected item ID
}