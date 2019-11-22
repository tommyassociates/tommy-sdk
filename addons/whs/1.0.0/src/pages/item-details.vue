<template>
  <f7-page :class="[itemDesc ? 'whs-details-page-description' : '', 'whs-details-page']" @page:beforein="colorizeHeader" @page:beforeout="colorizeHeaderOut">
    <f7-navbar innerClass="whs-details-navbar-inner">
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title :style="fontColor">{{itemTitle}}</f7-nav-title>
      <f7-nav-right class="whs-navbar-links">
        <f7-link icon-only href="/whs/item-add/">
          <f7-icon f7="add" />
        </f7-link>
        <f7-link icon-only :href="`/whs/item-add/?edit_id=${itemId}&index=${itemIndex}`">
          <f7-icon f7="gear" />
        </f7-link>
      </f7-nav-right>
    </f7-navbar>
    <f7-subnavbar class="no-hairline" :style="subnavbarStyle">
      <div class="description" v-if="itemDesc">
        {{itemDesc}}
      </div>
      <div class="whs-menubar whs-menubar-labels no-swipe-panel">
        <a
          :class="`link ${activeTab === 'summary' ? 'whs-menubar-dynamic-active' : ''}`"
          :style="activeTab === 'summary' ? highlightedColor : {}"
          @click="activeTab = 'summary'"
        >
          <span>Summary</span>
          <div class="after-line" v-if="activeTab === 'summary'" :style="highlightedBgColor"></div>
        </a>
        <a
          :class="`link ${activeTab === 'locations' ? 'whs-menubar-dynamic-active' : ''}`"
          :style="activeTab === 'locations' ? highlightedColor : {}"
          @click="activeTab = 'locations'"
        >
          <span>{{settings.location.plural_name}}</span>
          <div class="after-line" v-if="activeTab === 'locations'" :style="highlightedBgColor"></div>
        </a>
        <a
          :class="`link ${activeTab === 'tags' ? 'whs-menubar-dynamic-active' : ''}`"
          :style="activeTab === 'tags' ? highlightedColor : {}"
          @click="activeTab = 'tags'"
        >
          <span>{{settings.tag.plural_name}}</span>
          <div class="after-line" v-if="activeTab === 'tags'" :style="highlightedBgColor"></div>
        </a>
        <a
          :class="`link ${activeTab === 'activity' ? 'whs-menubar-dynamic-active' : ''}`"
          :style="activeTab === 'activity' ? highlightedColor : {}"
          @click="activeTab = 'activity'"
        >
          <span>{{settings.activity.plural_name}}</span>
          <div class="after-line" v-if="activeTab === 'activity'" :style="highlightedBgColor"></div>
        </a>
      </div>
      </f7-subnavbar>
    <template v-if="activeTab === 'summary'">
      <div class="whs-summary-cards">
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <i class="icon whs-icon-box-black"></i>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="highlightedColor">{{formatNumber(item.items_count)}}</div>
            <div class="whs-summary-card-label uppercase" :style="fontColor">TOTAL</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <i class="icon whs-icon-tag-black"></i>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="highlightedColor">{{formatNumber(item.tags_count)}}</div>
            <div class="whs-summary-card-label uppercase" :style="fontColor">{{settings.tag.plural_name}}</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <i class="icon whs-icon-drawer-black"></i>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="highlightedColor">{{formatNumber(item.locations_count)}}</div>
            <div class="whs-summary-card-label uppercase" :style="fontColor">{{settings.location.plural_name}}</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">Value</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="fontColor">{{formatCurrency(item.estimated_value)}}</div>
            <div class="whs-summary-card-label" :style="fontColor">Est. Total</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">Expiring</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="highlightedColor">{{formatNumber(item.expiring_count)}}</div>
            <div class="whs-summary-card-label" :style="fontColor">Items</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">Pending in</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="fontColor">{{formatNumber(item.pending_in_count)}}</div> 
            <div class="whs-summary-card-label" :style="fontColor">Items</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">Pending out</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="fontColor">{{formatNumber(item.pending_out_count)}}</div>
            <div class="whs-summary-card-label" :style="fontColor">Items</div>
          </div>
        </div>
      </div>
    </template>
    <template v-if="activeTab === 'locations'">
      <location-table :loadId="itemId" loadIdName="inventory_item_id" parent="item"/>
      <pagination-table slot="fixed" link="location" parent="item" />
    </template>
    <template v-if="activeTab === 'tags'">
      <tag-table :loadId="itemId" loadIdName="inventory_item_id" parent="item"/>
      <pagination-table slot="fixed" link="tag" parent="item" />
    </template>
    <template v-if="activeTab === 'activity'">
      <activity-table :loadId="itemId" loadIdName="inventory_item_id" parent="item"/>
      <pagination-table slot="fixed" link="activity" parent="item" />
    </template>
  </f7-page>
</template>
<script>
import API from "../api";
import EmptyBlock from "../components/empty-block.vue";
import LocationTable from "../components/location-table.vue";
import TagTable from "../components/tag-table.vue";
import ActivityTable from "../components/activity-table.vue";
import PaginationTable from "../components/pagination-table.vue";
import CurMexin from "../utils/cur-num-mixin.vue";


export default {
  components: {
    EmptyBlock,
    LocationTable,
    PaginationTable,
    TagTable,
    ActivityTable,
  },
  mixins:[CurMexin],
  created() {
    this.itemId = Number(this.$f7route.query.id);
    this.itemIndex = this.$f7route.query.index;
    ///get title and description from main items
    this.itemTitle = API.main_page.$data.items[this.itemIndex].name;
    this.itemDesc = API.main_page.$data.items[this.itemIndex].description;
  },
  computed: {
    headerBgColor(){
      return{
        "background-color": this.settings.item.header_color,
      }
    },
    highlightedColor(){
      return{
        "color": this.settings.item.highlight_color,
      }
    },
    highlightedBgColor(){
      return{
        "background-color": this.settings.item.highlight_color,
      }
    },
    fontColor(){
      return{
        "color": this.settings.item.font_color,
      }
    },
    subnavbarStyle(){
      const style = {
        "background-color": this.settings.item.header_color,
        "color": this.settings.item.font_color,
      }
      return style;
    }
  },
  methods: {
    loadItemDetail() {
      self = this;
      API.getItemDetail(this.itemId).then(data => {
        self.item = data;
      });
    },
    itemUpdated(item){
      self = this;
      self.itemTitle = item.name;
      self.itemDesc = item.description;
      API.resetCache(`inventory/items/${self.itemId}`);
      self.loadItemDetail();
    },
    colorizeHeader(){
      this.$f7.$('.whs-details-navbar-inner').css(this.headerBgColor);      
    },
    colorizeHeaderOut(){
      this.$f7.$('.whs-details-navbar-inner').css("background-color", "#F5F5F5");
    }
  },
  beforeDestroy() {
    const self = this;
    self.$events.$off('item:updated', self.itemUpdated);
  },
  mounted() {
    const self = this;
    self.$events.$on('item:updated', self.itemUpdated);
    self.loadItemDetail();
  },
  data() {
    return {
      itemTitle: null,
      itemDesc: null,
      itemId: null,
      itemIndex: null,
      locations: [],
      activeTab: "summary",
      item:{},
      settings: API.main_page.$data.settings,
    };
  }
};
</script>
<style>

</style> 