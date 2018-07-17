import API from '../api';

const tommy = window.tommy;

const DateTimeController = {
  init (page) {
    DateTimeController.renderDates();
    DateTimeController.renderHours();
    DateTimeController.bind(page);
  },
  bind (page) {
    DateTimeController.page = page;
    const $page = $$(page.container);

    $page.on('change', 'input[name="date-time-date"]', function (e) {
      DateTimeController.renderHours(new Date(parseInt(e.target.value, 10)));
    });
    $page.on('click', '.date-time-select-button', function (e) {
      const date = $page.find('input[name="date-time-date"]:checked').val();
      const hours = $page.find('input[name="date-time-hours"]:checked').val();

      API.cache.booking.date_time = new Date(parseInt(date, 10)).getTime() + hours * 60 * 60 * 1000;

      const url = tommy.util.addonAssetUrl(
        Template7.global.currentAddonInstall.package,
        Template7.global.currentAddonInstall.version,
        'views/nurse-list.html',
        true
      );
      tommy.app.f7.views.main.loadPage({ url });
    });
  },
  renderDates() {
    const now = new Date().getTime();
    const dates = [];

    for (let i = 0; i <= 13; i += 1) {
      const date = new Date(now + i * 24 * 60 * 60 * 1000);
      let month = date.getMonth() + 1;
      let day = date.getDate();
      if (day < 10) day = `0${day}`;
      if (month < 10) month = `0${month}`;
      const weekDay = date.getDay();
      dates.push({
        value: new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime(),
        day,
        month,
        weekDay: tommy.i18n.t(`date_time.week_days.${weekDay}`),
        today: i === 0,
      });
    };
    tommy.tplManager.renderInline(
      'nurse_booking__dateTimeDatesTemplate',
      { dates }
    );
  },
  renderHours(date = new Date()) {
    const hours = [];
    const today = new Date();
    let isToday;
    let wasChecked;
    if (today.getFullYear() === date.getFullYear() && today.getMonth() === date.getMonth() && today.getDate() === date.getDate()) {
      isToday = true;
    }
    for (let i = 10; i <= 19; i += 1) {
      const disabled = isToday ? today.getHours() >= i : false;
      let checked = false;
      if (!disabled && !wasChecked) {
        checked = true;
        wasChecked = true;
      }
      hours.push({
        value: i,
        disabled,
        checked,
        hour: `${i}:00`,
      });
    }
    tommy.tplManager.renderInline(
      'nurse_booking__dateTimeHoursTemplate',
      { hours }
    );
  },

  uninit () {
    DateTimeController.page = null;
    delete DateTimeController.page;
  },
};

export default DateTimeController
