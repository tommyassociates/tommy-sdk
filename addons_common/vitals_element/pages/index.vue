<template>
  <f7-page id="vitals_element__index" :class="`vitals-elment-index-page vitals-${vitalsElement}-index-page`" @page:beforein="onPageBeforeIn" @page:beforeout="onPageBeforeOut" @scroll.native.capture="onPageScroll">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{t('title')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link :href="`/${addon}/settings/`" icon-only>
          <i :class="`icon vitals-element-icon-settings vitals-${vitalsElement}-icon-settings`"></i>
        </f7-link>
        <f7-link :href="`/${addon}/history/`" icon-only>
          <i :class="`icon vitals-element-icon-chart vitals-${vitalsElement}-icon-chart`"></i>
        </f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-fab :href="`/${addon}/add/`" :class="`vitals-element-fab vitals-${vitalsElement}-fab`">
      <f7-icon f7="add"></f7-icon>
    </f7-fab>

    <div :class="`vitals-element-index-header vitals-${vitalsElement}-index-header`">
      <div :class="`vitals-element-index-header-icon vitals-${vitalsElement}-index-header-icon`"></div>
      <div :class="`vitals-element-index-header-content vitals-${vitalsElement}-index-header-content`" v-if="data && data.length">
        <div :class="`vitals-element-index-header-data vitals-${vitalsElement}-index-header-data`">{{data[0].data.value}}<span>{{t(`vital_unit.${data[0].data.unit || 0}`)}}</span></div>
        <div :class="`vitals-element-index-header-date vitals-${vitalsElement}-index-header-date`">{{$moment(data[0].data.date).format('DD MMM YYYY')}} {{data[0].data.time}}</div>
      </div>
      <div :class="`vitals-element-index-header-content vitals-${vitalsElement}-index-header-content`" v-if="data && !data.length">
        <div :class="`vitals-element-index-header-data vitals-${vitalsElement}-index-header-data`">{{t('vital_label')}}</div>
      </div>
    </div>

    <div :class="`vitals-element-index-no-data vitals-${vitalsElement}-index-no-data`" v-if="data && !data.length">
      <i :class="`vitals-element-index-no-data-img vitals-${vitalsElement}-index-no-data-img`"></i>
      <span>{{t('not_available')}}</span>
    </div>

    <div :class="`vitals-element-index-cards vitals-${vitalsElement}-index-cards`" v-if="data && data.length">
      <div :class="`vitals-element-card vitals-${vitalsElement}-card`"
        v-for="(item, index) in data"
        :key="index"
      >
        <div :class="`vitals-element-card-title vitals-${vitalsElement}-card-title`">{{$moment(item.data.date).format('DD MMM YYYY')}} {{item.data.time}}</div>
        <div :class="`vitals-element-card-content vitals-${vitalsElement}-card-content`">
          <div :class="`vitals-element-card-icon vitals-${vitalsElement}-card-icon`">
            <img :src="`${$addonAssetsUrl}card-icon.svg`" >
          </div>
          <div :class="`vitals-element-card-value vitals-${vitalsElement}-card-value`">{{item.data.value}} <sub>{{t(`vital_unit.${item.data.unit || 0}`)}}</sub></div>
        </div>
      </div>
    </div>

  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    props: {
      addon: String,
      vitalsElement: String,
    },
    data() {
      return {
        data: null,
      };
    },
    mounted() {
      const self = this;
      self.getData();
      self.$events.$on(`${self.addon}:updateRecords`, self.getData);
    },
    beforeDestroy() {
      const self = this;
      self.$events.$off(`${self.addon}:updateRecords`, self.getData);
    },
    methods: {
      t(v, d) {
        return this.$t(`${this.addon}.index.${v}`, d);
      },
      getData() {
        const self = this;
        API.getRecords(self.addon, self.vitalsElement, self.$root.user).then((data) => {
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
          self.$f7router.view.$navbarEl.removeClass(`vitals-element-index-navbar vitals-${self.vitalsElement}-index-navbar`);
        } else {
          self.$f7router.view.$navbarEl.addClass(`vitals-element-index-navbar vitals-${self.vitalsElement}-index-navbar`);
        }
      },
      onPageBeforeIn() {
        const self = this;
        self.$f7router.view.$navbarEl.addClass(`vitals-element-index-navbar vitals-${self.vitalsElement}-index-navbar`);
      },
      onPageBeforeOut() {
        const self = this;
        self.$f7router.view.$navbarEl.removeClass(`vitals-element-index-navbar vitals-${self.vitalsElement}-index-navbar`);
      },
    },
  };
</script>

