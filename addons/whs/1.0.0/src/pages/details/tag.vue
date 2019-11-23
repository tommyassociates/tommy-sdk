<template>
  <f7-page class="whs-details-page" @page:beforein="colorizeHeader" @page:beforeout="colorizeHeaderOut">
    <f7-navbar innerClass="whs-details-navbar-inner">
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title :style="fontColor">{{tagTitle}}</f7-nav-title>
      <f7-nav-right class="whs-navbar-links">
        <f7-link icon-only href="/whs/tag-add/">
          <f7-icon f7="add" />
        </f7-link>
        <f7-link icon-only :href="`/whs/tag-add/?edit_id=${tagId}&index=${tagIndex}`">
          <f7-icon f7="gear" />
        </f7-link>
      </f7-nav-right>
    </f7-navbar>
    <f7-subnavbar class="no-hairline" :style="subnavbarStyle">
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
          :class="`link ${activeTab === 'items' ? 'whs-menubar-dynamic-active' : ''}`"
          :style="activeTab === 'items' ? highlightedColor : {}"
          @click="activeTab = 'items'"
        >
          <span>{{settings.item.plural_name}}</span>
          <div class="after-line" v-if="activeTab === 'items'" :style="highlightedBgColor"></div>
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
            <div class="whs-summary-card-value" :style="highlightedColor">{{formatNumber(tag.tags_count)}}</div>
            <div class="whs-summary-card-label uppercase" :style="fontColor">TOTAL</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <i class="icon whs-icon-tag-black"></i>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="highlightedColor">{{formatNumber(tag.tags_count)}}</div>
            <div class="whs-summary-card-label uppercase" :style="fontColor">{{settings.tag.plural_name}}</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <i class="icon whs-icon-drawer-black"></i>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="highlightedColor">{{formatNumber(tag.locations_count)}}</div>
            <div class="whs-summary-card-label uppercase" :style="fontColor">{{settings.location.plural_name}}</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">Value</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="fontColor">{{formatCurrency(tag.estimated_value)}}</div>
            <div class="whs-summary-card-label" :style="fontColor">Est. Total</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">Expiring</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="highlightedColor">{{formatNumber(tag.expiring_count)}}</div>
            <div class="whs-summary-card-label" :style="fontColor">Items</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">Pending in</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="fontColor">{{formatNumber(tag.pending_in_count)}}</div> 
            <div class="whs-summary-card-label" :style="fontColor">Items</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">Pending out</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="fontColor">{{formatNumber(tag.pending_out_count)}}</div>
            <div class="whs-summary-card-label" :style="fontColor">Items</div>
          </div>
        </div>
      </div>
    </template>
    
    <template v-if="activeTab === 'items'">
      <item-table :loadId="tagId" loadIdName="inventory_tag_id" parent="tag"/>
      <pagination-table slot="fixed" link="item" parent="tag" />
    </template>
    <template v-if="activeTab === 'locations'">
      <location-table :loadId="tagId" loadIdName="inventory_tag_id" parent="tag"/>
      <pagination-table slot="fixed" link="location" parent="tag" />
    </template>
    <template v-if="activeTab === 'activity'">
      <activity-table :loadId="tagId" loadIdName="inventory_tag_id" parent="tag"/>
      <pagination-table slot="fixed" link="activity" parent="tag" />
    </template>
  </f7-page>
</template>
<script>
import API from "../../api";
import LocationTable from "../../components/location-table.vue";
import ActivityTable from "../../components/activity-table.vue";
import ItemTable from "../../components/item-table.vue";
import PaginationTable from "../../components/pagination-table.vue";
import CurMexin from "../../utils/cur-num-mixin.vue";


export default {
  components: {
    LocationTable,
    PaginationTable,
    ActivityTable,
    ItemTable,
  },
  mixins:[CurMexin],
  created() {
    this.tagId = Number(this.$f7route.query.id);
    this.tagIndex = this.$f7route.query.index;
    ///get title and description from main tags
    this.tagTitle = API.main_page.$data.tags[this.tagIndex].name;
    this.tagDesc = API.main_page.$data.tags[this.tagIndex].description;

    this.loadTagDetail();
  },
  computed: {
    headerBgColor(){
      return{
        "background-color": this.settings.tag.header_color,
      }
    },
    highlightedColor(){
      return{
        "color": this.settings.tag.highlight_color,
      }
    },
    highlightedBgColor(){
      return{
        "background-color": this.settings.tag.highlight_color,
      }
    },
    fontColor(){
      return{
        "color": this.settings.tag.font_color,
      }
    },
    subnavbarStyle(){
      return Object.assign(this.headerBgColor, this.fontColor);
    }
  },
  methods: {
    loadTagDetail() {
      self = this;
      API.getTagDetail(this.tagId).then(data => {
        self.tag = data;
      });
    },
    tagUpdated(tag){
      self = this;
      self.tagTitle = tag.name;
      self.tagDesc = tag.description;
      API.resetCache(`inventory/tags/${self.tagId}`);
      self.loadTagDetail();
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
    self.$events.$off('tag:updated', self.tagUpdated);
  },
  mounted() {
    const self = this;
    self.$events.$on('tag:updated', self.tagUpdated);

  },
  data() {
    return {
      tagTitle: null,
      tagDesc: null,
      tagId: null,
      tagIndex: null,
      locations: [],
      items:[],
      activeTab: "summary",
      tag:{},
      settings: API.main_page.$data.settings,
      
    };
  }
};
</script>
<style>

</style> 