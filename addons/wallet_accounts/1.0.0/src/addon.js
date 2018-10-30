import IndexPage from './pages/index.vue';
import TransactionAddPage from './pages/transaction-add.vue';
import BoardSettingsPage from './pages/board-settings.vue';
import ListManagementPage from './pages/list-management.vue';
import ListAddPage from './pages/list-add.vue';
import WalletBalancePage from './pages/wallet-balance.vue';
import TagSelectPage from './pages/tag-select-page.vue';
import ListEditPage from './pages/list-edit.vue';
import DateRangePage from './pages/date-range.vue';
import AmountSelectPage from './pages/amount-select.vue';

const routes = [
  {
    path: '/wallet_accounts/',
    component: IndexPage,
  },
  {
    path: '/wallet_accounts/transaction-add/',
    component: TransactionAddPage,
  },
  {
    path: '/wallet_accounts/board-settings/',
    component: BoardSettingsPage,
  },
  {
    path: '/wallet_accounts/list-management/',
    component: ListManagementPage,
  },
  {
    path: '/wallet_accounts/list-add/',
    component: ListAddPage,
  },
  {
    path: '/wallet_accounts/wallet-balance/',
    component: WalletBalancePage,
  },
  {
    path: '/wallet_accounts/tag-select/',
    component: TagSelectPage,
  },
  {
    path: '/wallet_accounts/list-edit/:listId/',
    component: ListEditPage,
  },
  {
    path: '/wallet_accounts/list-edit/:listId/date-range/',
    component: DateRangePage,
  },
  {
    path: '/wallet_accounts/list-edit/:listId/amount-select/',
    component: AmountSelectPage,
  },
];

export default routes;
