import API from '../api'

const SettingsController = {
  init (page) {
    const { enable_notifications, show_balance } = API.wallet;
    SettingsController.bind(page);

    const data = { enable_notifications, show_balance };
    window.tommy.tplManager.renderInline('wallet__settingsTemplate', data, page.container);
  },
  onInputChange(e) {
    const { name, checked } = e.target;
    API.updateWalletSettings({
      [name]: checked,
    }).then(() => {
      if (name !== 'show_balance') return;
      if (API.wallet.show_balance) {
        $$('.wallet-balance-value').text(API.wallet.balance);
      } else {
        $$('.wallet-balance-value').text('');
      }
    });
  },
  bind(page) {
    SettingsController.page = page;
    const $page = $$(page.container);
    $page.on('change', 'input', SettingsController.onInputChange);
  },
  uninit () {
    if (!SettingsController.page) return;
    const $page = $$(SettingsController.page.container);
    $page.off('change', 'input', SettingsController.onInputChange);
    SettingsController.page = null;
    delete SettingsController.page;
  },
};

export default SettingsController;
