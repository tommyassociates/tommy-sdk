import API from '../api'
import formatDateRange from '../format-date-range';

const ListEditController = {
  init (page) {
    let list = API.cache['lists'][page.query.list_fragment_id]
    const $page = $$(page.container)
    const $nav = $$(page.navbarInnerContainer)

    console.log('edit list', list)

    // NOTE: we should probably check that the current user has

    window.tommy.tplManager.renderInline('accounts__listEditTemplate', list, $page)

    ListEditController.initListFilters(page, list)
    API.initPermissionSelect(page, 'transaction_list_read_access', list.id)
    API.initPermissionSelect(page, 'transaction_list_edit_access', list.id)

    $nav.find('a.save').on('click', ev => {
      const data = window.tommy.app.f7.formToJSON($page.find('form'))
      ListEditController.saveList(list, data)
      ev.preventDefault()
    })

    $page.find('.date-range-select').on('click', ev => {
      ListEditController.showDateRangePage(page, list)
      ev.preventDefault()
    })

    $page.find('select[name="statuses"]').on('change', ev => {
      list.data.statuses = $$(ev.target).val()
      console.log('update statuses', list.data.statuses)
    })

    $page.find('.delete-list').on('click', ev => {
      API.deleteList(list.id)
      window.tommy.app.f7view.router.back()
      ev.preventDefault()
    })
  },

  showDateRangePage (settingsPage, list) {
    var html = window.tommy.tplManager.render('accounts__dateRangeSelectTemplate', list.data);

    function handleDateRangePage(page) {
      const $page = $$(page.container);
      const $nav = $$(page.navbarInnerContainer);
      const date_range = list.data.date_range;
      let range = date_range;
      let dateFrom = Array.isArray(range) && range[0] ? range : new Date().getTime();
      let dateTo = Array.isArray(range) && range[1] ? range : new Date().getTime();

      const $radios = $page.find('input[name="time_or_created_between"]')
      const $switch = $page.find('.label-switch input');

      function enableSave() {
        $nav.find('.toggle.save').addClass('active');
      }

      function save() {
        list.data.date_range = range;
        API.saveList(list).then((res) => {
          $$(settingsPage.container).find('.date-range-select .item-after').text(formatDateRange(range));
          ListEditController.afterSave(res);
        });
      }

      function onSwitchChange(e) {
        if (e.target.checked) {
          $page.find('.date-range-custom-item').show();
          $radios.prop('checked', false);
          range = [dateFrom, dateTo];
        } else {
          range = '';
          $page.find('.date-range-custom-item').hide();
        }
        enableSave()
      }
      function onRadioChange(e) {
        if (e.target.checked) {
          $switch.prop('checked', false).trigger('change');
          range = e.target.value;
        }
        enableSave()
      }

      if (typeof range === 'string' && range) {
        $page.find(`input[name="time_or_created_between"][value="${range}"]`).prop('checked', true);
        $page.find('.date-range-custom-item').hide();
      }
      else if (!range) {
        $page.find(`input[name="time_or_created_between"][value=""]`).prop('checked', true);
        $page.find('.date-range-custom-item').hide();
      }
      else if (Array.isArray(range)) {
        $switch.prop('checked', true);
      }
      let fromInitialChange;
      let toInitialChange;
      const calendarFrom = window.tommy.app.f7.calendar({
        input: $page.find('input[name="start_at"]'),
        closeOnSelect: true,
        value: [dateFrom],
        onChange(c, values) {
          if (fromInitialChange) {
            enableSave();
          }
          fromInitialChange = true;
          dateFrom = new Date(values[0]).getTime();
          if (Array.isArray(range) && range[0]) range[0] = dateFrom;
          if (dateFrom > dateTo) {
            calendarTo.setValue([dateFrom]);
          }
        }
      })
      const calendarTo = window.tommy.app.f7.calendar({
        input: $page.find('input[name="end_at"]'),
        closeOnSelect: true,
        value: [dateTo],
        onChange(c, values) {
          if (toInitialChange) {
            enableSave();
          }
          toInitialChange = true;
          dateTo = new Date(values[0]).getTime();
          if (Array.isArray(range) && range[1]) range[1] = dateTo;
          if (dateTo < dateFrom) {
            calendarFrom.setValue([dateTo]);
          }
        }
      })

      $switch.on('change', onSwitchChange);
      $radios.on('change', onRadioChange);
      $nav.find('.toggle.save').on('click', save);
    }

    $$(window.tommy.f7.views.main.container).once('page:init', '[data-page="accounts__date-range-select"]', (e) => {
      const page = e.detail.page;
      handleDateRangePage(page)
    })
    window.tommy.f7.views.main.loadContent(html)
  },

  initListFilters (page, list) {
    // if (!list.filters)
    //     list.filters = []
    let object = {
      title: window.tommy.i18n.t('parmissions.filter_transactions.title'),
      name: 'filter_transactions'
    }
    var $tagSelect = window.tommy.tplManager.appendInline('accounts__tagSelectTemplate', object, page.container)
    console.log('init filter select', list.filters)
    window.tommy.tagSelect.initWidget($tagSelect, list.filters, function(data) {
      console.log('save filter tags', data)
      list.filters = data
    })
  },

  saveList (list, data) {
    list.name = data.name
    list.data.show_fast_add = !!(data.show_fast_add && data.show_fast_add.length)

    API.saveList(list).then(ListEditController.afterSave)
  },

  afterSave (res) {
    console.log('list saved', res)
    window.tommy.app.f7view.router.back()
  }
}

export default ListEditController
