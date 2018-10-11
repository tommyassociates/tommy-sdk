<template>
  <f7-page name="wallet__index" id="wallet__index" @page:beforein="onPageBeforeIn" @page:beforeout="onPageBeforeOut">
    <f7-navbar innerClass="wallet-index-navbar-inner">
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{$t('wallet.index.title', 'Tommy Wallet')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link icon-f7="gear" href="/wallet/settings/"></f7-link>
      </f7-nav-right>
    </f7-navbar>

    <div class="wallet-tabs-links">
      <div class="wallet-tab-link-wrap">
        <f7-link tab-link="#wallet-tab-wallets" tab-link-active>
          <i class="wallet-tab-link-icon wallet-tab-link-icon-wallet"></i>
          <div class="wallet-tab-link-label">{{$t('wallet.index.tab_link_wallets', 'Wallets')}}</div>
        </f7-link>
      </div>
      <div class="wallet-tab-link-wrap">
        <f7-link tab-link noLinkClass>
          <i class="wallet-tab-link-icon wallet-tab-link-icon-balance"></i>
          <div class="wallet-tab-link-label">{{$t('wallet.index.tab_link_balance', 'Balance')}}</div>
          <div class="wallet-balance-value" v-if="balance">{{balance}}</div>
        </f7-link>
      </div>
      <div class="wallet-tab-link-wrap">
        <f7-link tab-link="#wallet-tab-transactions">
          <i class="wallet-tab-link-icon wallet-tab-link-icon-transactions"></i>
          <div class="wallet-tab-link-label">{{$t('wallet.index.tab_link_transactions', 'Transactions')}}</div>
        </f7-link>
      </div>
    </div>
    <f7-tabs class="wallet-tabs">

      <!-- WALLETS -->
      <f7-tab tab-active id="wallet-tab-wallets">
        <f7-block-title>{{$t('wallet.index.tab_wallets_title', 'Wallets')}}</f7-block-title>
        <f7-list media-list no-hairlines no-chevron class="wallet-list wallets-list" v-if="wallets">
          <f7-list-item
            v-for="(wallet, index) in wallets"
            :key="index"
            :link="`/wallet/card/${wallet.id}/?name=${wallet.name}`"
          >
            <img v-if="wallet.icon_url" slot="media" :src="wallet.icon_url">
            <i v-else slot="media" class="wallet-icon-placeholder"></i>
            <div class="item-details" slot="inner-start">
              <div class="item-title-row">
                <div class="item-title">{{wallet.name}}</div>
              </div>
              <div v-if="wallet.type" class="item-text">{{wallet.type}}</div>
            </div>
            <div class="item-after" slot="inner-end">{{currencyMap(wallet.currency)}}{{wallet.balance}}</div>
          </f7-list-item>
        </f7-list>

        <f7-block v-if="showTestButton">
          <p>
            <a href="#" class="button button-big button-round button-fill" id="wallet__createTestTransaction" @click="createTestTransaction">Test</a>
          </p>
          <p>
            <a href="#" class="button button-big button-round button-fill" id="wallet__createTestErrorTransaction" @click="createTestErrorTransaction">Test insufficient funds</a>
          </p>
        </f7-block>
      </f7-tab>

      <!-- HISTORY -->
      <f7-tab id="wallet-tab-balance"></f7-tab>

      <!-- TRANSACTIONS -->
      <f7-tab id="wallet-tab-transactions" @tab:show="() => { if (transactions) getTransactions() }">
        <template v-if="transactions && transactions.length">
          <f7-block-title>{{$t('wallet.index.tab_transactions_title', 'Transactions')}}</f7-block-title>
          <wallet-transaction-list :transactions="transactions"></wallet-transaction-list>
        </template>
        <template v-if="transactions && !transactions.length">
          <div class="wallet-transactions-empty-message">
            <img :src="`${$addonAssetsUrl}empty-transactions.svg`">
            <div>{{$t('wallet.index.no_transactions_message', 'Sorry. You do not have any transactions history yet.')}}</div>
          </div>
        </template>
      </f7-tab>
    </f7-tabs>
  </f7-page>
</template>
<script>
  import API from '../api';
  import currencyMap from '../utils/currency-map';
  import walletTransactionList from '../components/wallet-transaction-list.vue';

  export default {
    components: {
      walletTransactionList,
    },
    data() {
      return {
        balance: null,
        showTestButton: false,
        wallets: null,
        transactions: null,
      };
    },
    mounted() {
      const self = this;
      self.getBalance();
      self.getWallets();
      self.getTransactions();
    },
    beforeDestroy() {
      const self = this;
      self.$f7router.view.$navbarEl.removeClass('wallet-index-navbar');
    },
    methods: {
      currencyMap,
      createTestTransaction() {
        window.tommy.initWalletTransaction({
          addon: 'wallet',
          payee_name: 'Apple / iMac Pro',
          currency: 'CNY',
          amount: 100,
        });
      },
      createTestErrorTransaction() {
        window.tommy.initWalletTransaction({
          addon: 'wallet',
          payee_name: 'Mercedes S600',
          currency: 'USD',
          amount: 100000,
        });
      },
      getTransactions() {
        const self = this;
        API.getWalletTransactions().then((transactions) => {
          self.transactions = transactions;
        });
      },
      getWallets() {
        const self = this;
        API.getWalletCards().then((wallets) => {
          self.wallets = wallets;
        });
      },
      getBalance() {
        const self = this;
        API.getWallet().then((data) => {
          if (data.show_balance) {
            self.balance = data.balance;
          } else {
            self.balance = null;
          }
        });
      },
      onPageBeforeIn(e, page) {
        const self = this;
        self.$f7router.view.$navbarEl.addClass('wallet-index-navbar');
        if (page.from === 'previous') {
          self.getWallets();
          self.getBalance();
          self.getTransactions();
        }
      },
      onPageBeforeOut() {
        const self = this;
        self.$f7router.view.$navbarEl.removeClass('wallet-index-navbar');
      },
    },
  };
</script>
