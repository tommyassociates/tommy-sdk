<template>
  <f7-page id="weight__index" @page:beforein="onPageBeforeIn" @page:beforeout="onPageBeforeOut" @scroll.native.capture="onPageScroll">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{t('title', 'Weight')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link href="/weight/settings/" icon-only>
          <i class="icon weight-icon-settings"></i>
        </f7-link>
        <f7-link href="/weight/history/" icon-only>
          <i class="icon weight-icon-chart"></i>
        </f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-fab href="/weight/add/" class="weight-fab">
      <f7-icon f7="add"></f7-icon>
    </f7-fab>

    <div class="weight-index-header">
      <div class="weight-index-header-icon"></div>
      <div class="weight-index-header-content">
        <div class="weight-index-header-data">68<span>Kg</span></div>
        <div class="weight-index-header-date">21 Jan. 2018 00:00</div>
      </div>
    </div>

    <div class="weight-index-no-data" v-if="data && !data.length">
      <i class="weight-index-no-data-img"></i>
      <span>{{t('not_available')}}</span>
    </div>

    <div class="weight-index-cards" v-if="data && data.length">
      <div class="weight-vitals-card"
        v-for="(item, index) in data"
        :key="index"
      >
        <div class="weight-vitals-card-title">{{$moment(item.date).format('DD MMM YYYY H:m')}}</div>
        <div class="weight-vitals-card-content">
          <div class="weight-vitals-card-icon">
            <img :src="`${$addonAssetsUrl}card-icon.svg`" >
          </div>
          <div class="weight-vitals-card-value">{{item.value}} <sub>{{item.unit}}</sub></div>
        </div>
      </div>
    </div>

  </f7-page>
</template>
<script>
  export default {
    data() {
      return {
        data: [
          {
            date: new Date().getTime() - 1000 * 60 * 60 * 24,
            value: 68,
            unit: 'kg',
          },
          {
            date: new Date().getTime() - 1000 * 60 * 60 * 24 * 2,
            value: 66,
            unit: 'kg',
          },
          {
            date: new Date().getTime() - 1000 * 60 * 60 * 24 * 3,
            value: 66,
            unit: 'kg',
          },
        ],
      };
    },
    methods: {
      t(v, d) {
        return this.$t(`weight.index.${v}`, d);
      },
      onPageScroll(e) {
        const self = this;
        const $pageContentEl = self.$$(e.target).closest('.page-content');
        if (!$pageContentEl.length) return;
        const scrollTop = $pageContentEl[0].scrollTop;
        if (scrollTop > 100) {
          self.$f7router.view.$navbarEl.removeClass('weight-index-navbar');
        } else {
          self.$f7router.view.$navbarEl.addClass('weight-index-navbar');
        }
      },
      onPageBeforeIn(e, page) {
        const self = this;
        self.$f7router.view.$navbarEl.addClass('weight-index-navbar');
        if (page.from === 'previous') {
          // self.getWallets();
          // self.getBalance();
          // self.getTransactions();
        }
      },
      onPageBeforeOut() {
        const self = this;
        self.$f7router.view.$navbarEl.removeClass('weight-index-navbar');
      },
    },
  };
</script>

