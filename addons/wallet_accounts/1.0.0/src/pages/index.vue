<template>
  <f7-page id="wallet_accounts__index" name="wallet_accounts__index" class="wallet_accounts__page">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{$t('wallet_accounts.index.title', 'Wallet Accounts')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link href="/wallet_accounts/board-settings/" icon-f7="gear"></f7-link>
        <f7-link icon-f7="add" popover-open="#wallet_accounts__index-popover"></f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-swiper v-if="orderedLists && orderedLists.length" :params="{
      slidesPerView: 'auto',
      breakpointsInverse: true,
      centeredSlides: false,
      touchMoveStopPropagation: false,
      on: {
        tap: onSlideClick
      },
      breakpoints: {
        768: {
          centeredSlides: true,
        }
      },
    }">
      <f7-swiper-slide
        v-for="list in orderedLists"
        :key="list.id"
      >
        <div class="tasks-list" :data-id="list.id" :class="{'hasScroll': listWithScroll[list.id]}">
          <div class="tasks-list-header">
            <div>{{list.name}}</div>
            <div v-if="!actorId">
              <a :data-url="`/wallet_accounts/list-edit/${list.id}/`">
                <img
                  :src="`${$addonAssetsUrl}slice6.png`"
                  :srcset="`${$addonAssetsUrl}slice6@2x.png 2x, ${$addonAssetsUrl}slice6@3x.png 3x`"
                >
              </a>
            </div>
          </div>
          <div class="tasks-list-content">
            <div class="card transactions-card">
              <f7-list v-if="list.transactions && list.transactions.length" media-list class="transactions-list no-chevron">
                <li v-for="(transaction, index) in list.transactions" :key="index">
                  <a :data-url="`/wallet_accounts/transaction-details/${transaction.id}/`" class="item-content item-link">
                    <div class="item-media">
                      <img v-if="transaction.icon_url" :src="transaction.icon_url">
                      <i v-else class="wallet-icon-placeholder"></i>
                    </div>
                    <div class="item-inner">
                      <div class="item-details">
                        <div class="item-title-row">
                          <div class="item-title">{{transaction.payee_name}}</div>
                        </div>
                        <div class="item-text">{{formatTransactionDate(transaction.paid_at)}}</div>
                      </div>
                      <div class="item-after">{{formatTransactionAmount(transaction)}}</div>
                    </div>
                  </a>
                </li>
              </f7-list>
              <div v-if="list.transactions && !list.transactions.length" style="padding: 15px">{{$t('wallet_accounts.index.no_transactions_found', 'No transactions found')}}</div>
            </div>
          </div>
        </div>
      </f7-swiper-slide>
    </f7-swiper>
    <f7-popover id="wallet_accounts__index-popover">
      <f7-list>
        <f7-list-button popover-close href="/wallet_accounts/list-add/">{{$t('wallet_accounts.list-add.title', 'Add List')}}</f7-list-button>
        <f7-list-button popover-close href="/wallet_accounts/transaction-add/">{{$t('wallet_accounts.transaction-add.title', 'New Transaction')}}</f7-list-button>
      </f7-list>
    </f7-popover>
  </f7-page>
</template>
<script>
  import API from '../api';
  import formatTransactionDate from '../utils/format-transaction-date';
  import formatTransactionAmount from '../utils/format-transaction-amount';

  export default {
    data() {
      const self = this;
      return {
        lists: null,
        actorId: self.$f7route.query.actor_id,
        listWithScroll: {},
      };
    },
    created() {
      const self = this;
      if (self.actorId) {
        API.actorId = parseInt(self.actorId, 10);
        API.actor = self.actor;
      } else {
        delete API.actorId;
        delete API.actor;
      }
    },
    computed: {
      actor() {
        const self = this;
        if (!self.actorId) return null;
        return self.$root.teamMembers.filter(user => user.user_id === parseInt(self.actorId, 10))[0];
      },
      orderedLists() {
        const self = this;
        if (!self.lists) return null;
        return self.lists.sort((a, b) => {
          return a.data.position - b.data.position;
        }).filter(list => list.data.active);
      },
    },
    methods: {
      onSlideClick(e) {
        const self = this;
        const url = self.$$(e.target).closest('a').eq(0).attr('data-url');
        if (!url) return;
        self.$f7router.navigate(url);
      },
      formatTransactionDate,
      formatTransactionAmount,
      listHasScroll(list) {
        const self = this;
        if (!list.tasks || list.tasks.length === 0) return false;
        const listContentEl = self.$$(`.tasks-list[data-id="${list.id}"] .tasks-list-content`)[0];
        if (!listContentEl) return false;
        return listContentEl.scrollHeight > listContentEl.offsetHeight;
      },
      loadListTransactions(list) {
        const self = this;
        const user = self.actor || self.$root.user;
        API.loadListTransactions(list).then((transactions) => {
          list.transactions = transactions;
          self.$nextTick(() => {
            if (self.listHasScroll(list)) {
              self.$set(self.listWithScroll, list.id, true);
            } else {
              self.$set(self.listWithScroll, list.id, false);
            }
          });
        });
      },
      reloadListTransactions() {
        const self = this;
        if (!self.lists) return;
        self.lists.forEach((list) => {
          self.loadListTransactions(list);
        });
      },
      loadLists(ignoreCache) {
        const self = this;
        API.loadLists({}, { cache: !ignoreCache }).then((lists) => {
          lists.forEach((list) => {
            list.transactions = [];
          });
          self.lists = lists;
          const hasDefaultList = self.lists.filter(list => list.data.default).length > 0;
          if (hasDefaultList || self.actorId) {
            self.lists.forEach((list) => {
              if (!list.data.active) return;
              self.loadListTransactions(list);
            });
          } else {
            API.createDefaultList(self.$root.user).then(() => {
              self.loadLists();
            });
          }
        });
      },
      reloadLists() {
        const self = this;
        self.loadLists(true);
      },
    },
    beforeDestroy() {
      const self = this;
      self.$events.$off('wallet_accounts:reloadListsTransactions', self.reloadListsTransactions);
      self.$events.$off('wallet_accounts:reloadLists', self.reloadLists);
    },
    mounted() {
      const self = this;
      self.loadLists();
      self.$events.$on('wallet_accounts:reloadListsTransactions', self.reloadListsTransactions);
      self.$events.$on('wallet_accounts:reloadLists', self.reloadLists);
    },
  };
</script>

