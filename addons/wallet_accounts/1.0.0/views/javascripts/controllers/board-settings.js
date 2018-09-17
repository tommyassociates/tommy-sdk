import API from '../api'

const BoardSettingsController = {
  init (page) {
    const $page = $$(page.container)
    const $nav = $$(page.navbarInnerContainer)

    window.tommy.tplManager.renderInline('wallet_accounts__boardSettingTemplate', {
      hasActorId: window.tommy.addons.getCurrentActor()
    }, $page)

    // Team manager only settings
    if (window.tommy.util.isTeamOwnerOrManager()) {
      API.initPermissionSelect(page, 'wallet_accounts_transaction_create_access')
      API.initPermissionSelect(page, 'wallet_accounts_transaction_edit_access')
    }
  }
}

export default BoardSettingsController
