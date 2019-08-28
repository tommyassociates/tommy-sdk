<template>
  <f7-page class="whs-details-page">
    <f7-navbar innerClass="whs-details-navbar-inner">
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>Field001</f7-nav-title>
      <f7-nav-right class="whs-navbar-links">
        <f7-link icon-only>
          <f7-icon f7="add" />
        </f7-link>
        <f7-link icon-only>
          <f7-icon f7="gear" />
        </f7-link>
      </f7-nav-right>
    </f7-navbar>
    <f7-subnavbar class="no-hairline">
      Funky field minced 100% plant based 4-40
    </f7-subnavbar>


    <div class="whs-menubar whs-menubar-labels no-swipe-panel">
      <a :class="`link ${activeTab === 'summary' ? 'whs-menubar-active' : ''}`" @click="activeTab = 'summary'">
        <span>Summary</span>
      </a>
      <a :class="`link ${activeTab === 'locations' ? 'whs-menubar-active' : ''}`" @click="activeTab = 'locations'">
        <span>Locations</span>
      </a>
      <a :class="`link ${activeTab === 'tags' ? 'whs-menubar-active' : ''}`" @click="activeTab = 'tags'">
        <span>Tags</span>
      </a>
      <a :class="`link ${activeTab === 'activity' ? 'whs-menubar-active' : ''}`" @click="activeTab = 'activity'">
        <span>Activity</span>
      </a>
    </div>

    <template v-if="activeTab === 'summary'">
      <div class="whs-summary-cards">
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <i class="icon whs-icon-box-black"></i>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value">50,000</div>
            <div class="whs-summary-card-label">TOTAL</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <i class="icon whs-icon-tag-black"></i>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value">150</div>
            <div class="whs-summary-card-label">TAGS</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <i class="icon whs-icon-drawer-black"></i>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value">5,000</div>
            <div class="whs-summary-card-label">LOCATIONS</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">Value</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value">$ 290,900</div>
            <div class="whs-summary-card-label">Est. Total</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">Expiring</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value">250</div>
            <div class="whs-summary-card-label">Items</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">Pending in</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value">20</div>
            <div class="whs-summary-card-label">Items</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">Pending out</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value">20</div>
            <div class="whs-summary-card-label">Items</div>
          </div>
        </div>
      </div>
    </template>
    <template v-if="activeTab === 'locations'">

    </template>
    <template v-if="activeTab === 'tags'">

    </template>
    <template v-if="activeTab === 'activity'">

    </template>

  </f7-page>
</template>
<script>
import API from "../api";

export default {
  data() {
    return {
      activeTab: 'summary',
    };
  },
  created() {

  },
  computed: {

  },
  methods: {

  },
  beforeDestroy() {
    const self = this;
  },
  mounted() {
    const self = this;
  }
};
</script>
