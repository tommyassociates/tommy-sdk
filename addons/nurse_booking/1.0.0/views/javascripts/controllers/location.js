import API from '../api';

const tommy = window.tommy;

const LocationController = {
  init (page) {
    LocationController.loadLocations();
    LocationController.bind(page);
  },
  bind (page) {
    LocationController.page = page;
    const $page = $$(page.container);
    const f7 = tommy.app.f7;
    const service = API.cache.booking.service;

    // Delete
    $page.on('click', '.location-delete-button', function() {
      const index = parseInt($$(this).attr('data-location-index'), 10);
      API.removeLocation(index).then(() => {
        LocationController.render();
      });
    });

    // Save
    $page.on('click', '.location-save-button', function (e) {
      const $form = $$(this).parents('.location-add-form');
      const city = $form.find('input[name="city"]').val().trim();
      const address = $form.find('textarea[name="address"]').val().trim();
      const isDefault = $form.find('input[name="default"]').prop('checked');
      if (!city || !address) return;

      let available;
      (service.data.available_in || service.data.availabile_in || []).forEach((availableCity) => {
        if (availableCity.toLowerCase() === city.toLowerCase()) available = true;
      });
      if (!available) {
        f7.alert(tommy.i18n.t('location.not_available'));
        return;
      }
      API.addLocation({ city, address, default: isDefault }).then(() => {
        LocationController.render();
      });
    });

    // Add
    $page.on('click', '.location-add-button', function (e) {
      $page.find('.page-content').append(
        tommy.tplManager.render('nurse_booking__locationsTemplate', { locations: [] })
      );
      $page.find('.location-add-button').hide();
    });

    // Select
    $page.on('click', '.location-select-button', function (e) {
      const index = parseInt($$(this).attr('data-location-index'), 10);
      const location = API.cache.locations[index];
      const city = location.city;
      let available;

      (service.data.available_in || service.data.availabile_in || []).forEach((availableCity) => {
        if (availableCity.toLowerCase() === city.toLowerCase()) available = true;
      });
      if (!available) {
        f7.alert(tommy.i18n.t('location.not_available'));
        return;
      }

      API.cache.booking.location = location;

      if (page.query.back) {
        f7.views.main.back();
      } else {
        const url = tommy.util.addonAssetUrl(
          Template7.global.currentAddonInstall.package,
          Template7.global.currentAddonInstall.version,
          'views/date-time.html',
          true
        );
        f7.views.main.loadPage({ url });
      }

    });
  },
  loadLocations() {
    API.getLocations().then(() => {
      LocationController.render();
    });
  },
  render() {
    tommy.tplManager.renderInline(
      'nurse_booking__locationsTemplate',
      { locations: API.cache.locations },
    );
  },
  uninit () {
    LocationController.page = null;
    delete LocationController.page;
  },
};

export default LocationController
