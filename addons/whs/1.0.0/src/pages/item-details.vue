<template>
  <f7-page class="whs-details-page">
    <f7-navbar innerClass="whs-details-navbar-inner">
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{itemTitle}}</f7-nav-title>
      <f7-nav-right class="whs-navbar-links">
        <f7-link icon-only>
          <f7-icon f7="add" />
        </f7-link>
        <f7-link icon-only>
          <f7-icon f7="gear" />
        </f7-link>
      </f7-nav-right>
    </f7-navbar>
    <f7-subnavbar class="no-hairline">{{itemDesc}}</f7-subnavbar>
    <div class="whs-menubar whs-menubar-labels no-swipe-panel">
      <a
        :class="`link ${activeTab === 'summary' ? 'whs-menubar-active' : ''}`"
        @click="activeTab = 'summary'"
      >
        <span>Summary</span>
      </a>
      <a
        :class="`link ${activeTab === 'locations' ? 'whs-menubar-active' : ''}`"
        @click="activeTab = 'locations'"
      >
        <span>Locations</span>
      </a>
      <a
        :class="`link ${activeTab === 'tags' ? 'whs-menubar-active' : ''}`"
        @click="activeTab = 'tags'"
      >
        <span>Tags</span>
      </a>
      <a
        :class="`link ${activeTab === 'activity' ? 'whs-menubar-active' : ''}`"
        @click="activeTab = 'activity'"
      >
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
            <div class="whs-summary-card-value">$ {{item.items_count}}</div>
            <div class="whs-summary-card-label">TOTAL</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <i class="icon whs-icon-tag-black"></i>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value">{{item.tags_count}}</div>
            <div class="whs-summary-card-label">TAGS</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <i class="icon whs-icon-drawer-black"></i>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value">{{item.locations_count}}</div>
            <div class="whs-summary-card-label">LOCATIONS</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">Value</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value">$ {{item.estimated_value}}</div>
            <div class="whs-summary-card-label">Est. Total</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">Expiring</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value">{{item.expiring_count}}</div>
            <div class="whs-summary-card-label">Items</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">Pending in</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value">{{item.pending_in_count}}</div> 
            <div class="whs-summary-card-label">Items</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">Pending out</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value">{{item.pending_out_count}}</div>
            <div class="whs-summary-card-label">Items</div>
          </div>
        </div>
      </div>
    </template>
    <template v-if="activeTab === 'locations'">
      <div class="whs-table">
        <table>
          <thead>
            <tr>
              <th class="sort-cell">
                <a class="link">
                  <i class="whs-icon whs-icon-sort-black"></i>
                </a>
              </th>
              <th>Location</th>
              <th>Parent</th>
              <th>Items</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="media-cell"></td>
              <td>1000348671</td>
              <td>BF-02-01</td>
              <td>500</td>
            </tr>
            <tr>
              <td class="media-cell"></td>
              <td>1000348671</td>
              <td>BF-02-01</td>
              <td>500</td>
            </tr>
            <tr>
              <td class="media-cell"></td>
              <td>1000348671</td>
              <td>BF-02-01</td>
              <td>500</td>
            </tr>
            <tr>
              <td class="media-cell"></td>
              <td>1000348671</td>
              <td>BF-02-01</td>
              <td>500</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="whs-pagination" slot="fixed">
        <div class="whs-pagination-rows">4 {{$t('whs.pagination.rows')}}</div>
        <div class="whs-pagination-nav">
          <a class="link">
            <i class="f7-icons">chevron_left</i>
          </a>
          <span>{{$t('whs.pagination.page', { current: 1, total: 4 })}}</span>
          <a class="link">
            <i class="f7-icons">chevron_right</i>
          </a>
        </div>
        <div class="whs-pagination-actions">
          <a class="link">
            <i class="icon f7-icons">share</i>
          </a>
          <a class="link">
            <i class="icon f7-icons">gear</i>
          </a>
        </div>
      </div>
    </template>
    <template v-if="activeTab === 'tags'">
      <empty-block :text="$t('whs.common.no_tags')" />
    </template>
    <template v-if="activeTab === 'activity'">
      <empty-block :text="$t('whs.common.no_activity')" />
    </template>
  </f7-page>
</template>
<script>
import API from "../api";
import EmptyBlock from "../components/empty-block.vue";

export default {
  components: {
    EmptyBlock
  },
  created() {
    this.itemId = this.$f7route.query.id;
    this.itemIndex = this.$f7route.query.index;
    ///get title and description from main items
    this.itemTitle = API.main_page.$data.items[this.itemIndex].name;
    this.itemDesc = API.main_page.$data.items[this.itemIndex].description;

    this.loadItemDetail();
  },
  computed: {},
  methods: {
    loadItemDetail() {
      self = this;
      API.getItemDetail(this.itemId).then(data => {
        self.item = data;
        console.log("TCL: loadItemDetail -> self.item", self.item)
      });
    },
  },
  beforeDestroy() {
    const self = this;
  },
  mounted() {
    const self = this;
  },
  data() {
    return {
      itemTitle: null,
      itemDesc: null,
      itemId: null,
      itemIndex: null,
      activeTab: "summary",
      item:{},
    };
  }
};
</script>
