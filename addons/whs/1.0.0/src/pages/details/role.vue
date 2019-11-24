<template>
  <f7-page :class="[roleDesc ? 'whs-details-page-description' : '', 'whs-details-page']" @page:beforein="colorizeHeader" @page:beforeout="colorizeHeaderOut">
    <f7-navbar innerClass="whs-details-navbar-inner">
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title :style="fontColor">{{roleTitle}}</f7-nav-title>
      <f7-nav-right class="whs-navbar-links">
        <f7-link icon-only href="/whs/role-add/">
          <f7-icon f7="add" />
        </f7-link>
        <f7-link icon-only @click="clickEdit()">
          <f7-icon f7="gear" />
        </f7-link>
      </f7-nav-right>
    </f7-navbar>
    <f7-subnavbar class="no-hairline" :style="subnavbarStyle">
      <div class="description" v-if="roleDesc">
        {{roleDesc}}
      </div>
      <div class="whs-menubar whs-menubar-labels no-swipe-panel">
        <a
          :class="`link ${activeTab === 'summary' ? 'whs-menubar-dynamic-active' : ''}`"
          :style="activeTab === 'summary' ? highlightedColor : {}"
          @click="activeTab = 'summary'"
        >
          <span>{{$t('whs.summary_page.summary')}}</span>
          <div class="after-line" v-if="activeTab === 'summary'" :style="highlightedBgColor"></div>
        </a>
        <a
          :class="`link ${activeTab === 'team' ? 'whs-menubar-dynamic-active' : ''}`"
          :style="activeTab === 'tean' ? highlightedColor : {}"
          @click="activeTab = 'team'"
        >
          <span>{{$t('whs.summary_page.team')}}</span>
          <div class="after-line" v-if="activeTab === 'team'" :style="highlightedBgColor"></div>
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
            <div class="whs-summary-card-title">{{$t('whs.summary_page.open')}}</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="highlightedColor">{{formatNumber(role.open_count)}}</div>
            <div class="whs-summary-card-label" :style="fontColor">{{$t('whs.summary_page.activities')}}</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">{{$t('whs.summary_page.due')}}</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="highlightedColor">{{formatNumber(role.due_count)}}</div>
            <div class="whs-summary-card-label" :style="fontColor">{{$t('whs.summary_page.activities')}}</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">{{$t('whs.summary_page.overdue')}}</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="highlightedColor">{{formatNumber(role.overdue_count)}}</div>
            <div class="whs-summary-card-label" :style="fontColor">{{$t('whs.summary_page.activities')}}</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">{{$t('whs.summary_page.pending_in')}}</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="fontColor">{{formatNumber(role.pending_in_count)}}</div> 
            <div class="whs-summary-card-label" :style="fontColor">{{$t('whs.summary_page.items')}}</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">{{$t('whs.summary_page.pending_out')}}</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="fontColor">{{formatNumber(role.pending_out_count)}}</div>
            <div class="whs-summary-card-label" :style="fontColor">{{$t('whs.summary_page.items')}}</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">{{$t('whs.summary_page.relocations')}}</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="fontColor">{{formatNumber(role.relocations_count)}}</div>
            <div class="whs-summary-card-label" :style="fontColor">{{$t('whs.summary_page.locations')}}</div> 
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">{{$t('whs.summary_page.movements')}}</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="fontColor">{{formatNumber(role.movements_count)}}</div>
            <div class="whs-summary-card-label" :style="fontColor">{{$t('whs.summary_page.items')}}</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">{{$t('whs.summary_page.stocktakes')}}</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="fontColor">{{formatNumber(role.stocktakes_count)}}</div>
            <div class="whs-summary-card-label" :style="fontColor">{{$t('whs.summary_page.items')}}</div>
          </div>
        </div>
      </div>
    </template>
    <template v-if="activeTab === 'team'">
      <team-table :loadId="roleId" loadIdName="inventory_role_id" parent="role"/>
      <pagination-table slot="fixed" link="team" parent="role" />
    </template>
    <template v-if="activeTab === 'activity'">
      <activity-table :loadId="roleId" loadIdName="inventory_role_id" parent="role"/>
      <pagination-table slot="fixed" link="activity" parent="role" />
    </template>
  </f7-page>
</template>
<script>
import API from "../../api";
import ActivityTable from "../../components/table/activity.vue";
import TeamTable from "../../components/table/team.vue";
import PaginationTable from "../../components/table/pagination.vue";
import CurMexin from "../../utils/cur-num-mixin.vue";


export default {
  props:{
    item_link: Object
  },
  components: {
    PaginationTable,
    ActivityTable,
    TeamTable,
  },
  mixins:[CurMexin],
  created() {
    this.roleId = this.item_link.id;
    this.roleTitle = this.item_link.name;
    this.roleDesc = this.item_link.description;
  },
  computed: {
    headerBgColor(){
      return{
        "background-color": this.settings.role.header_color,
      }
    },
    highlightedColor(){
      return{
        "color": this.settings.role.highlight_color,
      }
    },
    highlightedBgColor(){
      return{
        "background-color": this.settings.role.highlight_color,
      }
    },
    fontColor(){
      return{
        "color": this.settings.role.font_color,
      }
    },
    subnavbarStyle(){
      const style = {
        "background-color": this.settings.role.header_color,
        "color": this.settings.role.font_color,
      }
      return style;
    }
  },
  methods: {
    loadDetail() {
      self = this;
      API.getRoleDetail(this.roleId).then(data => {
        self.role = data;
      });
    },
    roleUpdated(role){
      self = this;
      self.roleTitle = role.name;
      self.roleDesc = role.description;
      API.resetCache(`inventory/roles/${self.roleId}`);
      self.loadDetail();
    },
    colorizeHeader(){
      this.$f7.$('.whs-details-navbar-inner').css(this.headerBgColor);      
    },
    colorizeHeaderOut(){
      this.$f7.$('.whs-details-navbar-inner').css("background-color", "#F5F5F5");
    },
    clickEdit(){
      const self = this;
      self.$f7router.navigate('/whs/role-add/', {
        props: {
          item_link: self.item_link
      }});
    }
  },
  beforeDestroy() {
    const self = this;
    self.$events.$off('role:updated', self.roleUpdated);
  },
  mounted() {
    const self = this;
    self.$events.$on('role:updated', self.roleUpdated);
    self.loadDetail();
  },
  data() {
    return {
      roleTitle: null,
      roleDesc: null,
      roleId: null,
      roleIndex: null,
      locations: [],
      activeTab: "summary",
      role:{},
      settings: API.main_page.$data.settings,
    };
  }
};
</script>
<style>

</style> 