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
      <div class="weight-index-header-content" v-if="data && data.length">
        <div class="weight-index-header-data">{{data[0].data.value}}<span>{{$t(`weight.index.vital_unit.${data[0].data.unit || 0}`)}}</span></div>
        <div class="weight-index-header-date">{{$moment(data[0].data.date).format('DD MMM YYYY')}} {{data[0].data.time}}</div>
      </div>
      <div class="weight-index-header-content" v-if="data && !data.length">
        <div class="weight-index-header-data">{{$t('weight.index.vital_label')}}</div>
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
        <div class="weight-vitals-card-title">{{$moment(item.data.date).format('DD MMM YYYY')}} {{item.data.time}}</div>
        <div class="weight-vitals-card-content">
          <div class="weight-vitals-card-icon">
            <img :src="`${$addonAssetsUrl}card-icon.svg`" >
          </div>
          <div class="weight-vitals-card-value">{{item.data.value}} <sub>{{$t(`weight.index.vital_unit.${item.data.unit || 0}`)}}</sub></div>
        </div>
      </div>
    </div>

  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    data() {
      return {
        data: null,
      };
    },
    mounted() {
      const self = this;
      self.getData();
      self.$events.$on('weight:updateRecords', self.getData);
    },
    beforeDestroy() {
      const self = this;
      self.$events.$off('weight:updateRecords', self.getData);
    },
    methods: {
      t(v, d) {
        return this.$t(`weight.index.${v}`, d);
      },
      getData() {
        const self = this;
        API.getRecords(self.$root.user).then((data) => {
          self.data = data.filter(el => el.data && el.data.value).sort((a, b) => {
            const aDate = new Date(a.data.date);
            const [aH, aM] = a.data.time.split(':');
            aDate.setHours(parseInt(aH, 10), parseInt(aM, 10));

            const bDate = new Date(b.data.date);
            const [bH, bM] = b.data.time.split(':');
            bDate.setHours(parseInt(bH, 10), parseInt(bM, 10));

            return bDate - aDate;
          });
        });
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

