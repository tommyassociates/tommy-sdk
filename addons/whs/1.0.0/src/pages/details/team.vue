<template>
  <f7-page :class="[teamDesc ? 'whs-details-page-description' : '', 'whs-details-page']" @page:beforein="colorizeHeader" @page:beforeout="colorizeHeaderOut">
    <f7-navbar innerClass="whs-details-navbar-inner">
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title :style="fontColor">{{teamTitle}}</f7-nav-title>
      <f7-nav-right class="whs-navbar-links">
        <f7-link icon-only href="/whs/team-add/">
          <f7-icon f7="add" />
        </f7-link>
        <f7-link icon-only @click="clickEdit()">
          <f7-icon f7="gear" />
        </f7-link>
      </f7-nav-right>
    </f7-navbar>
    <f7-subnavbar class="no-hairline" :style="subnavbarStyle">
      <div class="description" v-if="teamDesc">
        {{teamDesc}}
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
          :class="`link ${activeTab === 'role' ? 'whs-menubar-dynamic-active' : ''}`"
          :style="activeTab === 'role' ? highlightedColor : {}"
          @click="activeTab = 'role'"
        >
          <span>{{$t('whs.summary_page.roles')}}</span>
          <div class="after-line" v-if="activeTab === 'role'" :style="highlightedBgColor"></div>
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
            <div class="whs-summary-card-value" :style="highlightedColor">{{formatNumber(team.open_count)}}</div>
            <div class="whs-summary-card-label" :style="fontColor">{{$t('whs.summary_page.activities')}}</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">{{$t('whs.summary_page.due')}}</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="highlightedColor">{{formatNumber(team.due_count)}}</div>
            <div class="whs-summary-card-label" :style="fontColor">{{$t('whs.summary_page.activities')}}</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">{{$t('whs.summary_page.overdue')}}</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="highlightedColor">{{formatNumber(team.overdue_count)}}</div>
            <div class="whs-summary-card-label" :style="fontColor">{{$t('whs.summary_page.activities')}}</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">{{$t('whs.summary_page.pending_in')}}</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="fontColor">{{formatNumber(team.pending_in_count)}}</div> 
            <div class="whs-summary-card-label" :style="fontColor">{{$t('whs.summary_page.items')}}</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">{{$t('whs.summary_page.pending_out')}}</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="fontColor">{{formatNumber(team.pending_out_count)}}</div>
            <div class="whs-summary-card-label" :style="fontColor">{{$t('whs.summary_page.items')}}</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">{{$t('whs.summary_page.relocations')}}</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="fontColor">{{formatNumber(team.relocations_count)}}</div>
            <div class="whs-summary-card-label" :style="fontColor">{{$t('whs.summary_page.locations')}}</div> 
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">{{$t('whs.summary_page.movements')}}</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="fontColor">{{formatNumber(team.movements_count)}}</div>
            <div class="whs-summary-card-label" :style="fontColor">{{$t('whs.summary_page.items')}}</div>
          </div>
        </div>
        <div class="whs-summary-card">
          <div class="whs-summary-card-left">
            <div class="whs-summary-card-title">{{$t('whs.summary_page.stocktakes')}}</div>
          </div>
          <div class="whs-summary-card-right">
            <div class="whs-summary-card-value" :style="fontColor">{{formatNumber(team.stocktakes_count)}}</div>
            <div class="whs-summary-card-label" :style="fontColor">{{$t('whs.summary_page.items')}}</div>
          </div>
        </div>
      </div>
    </template>
    <template v-if="activeTab === 'role'">
      <role-table :loadId="teamId" loadIdName="inventory_team_members_id" parent="team"/>
      <pagination-table slot="fixed" link="role" parent="team" />
    </template>
    <template v-if="activeTab === 'activity'">
      <activity-table :loadId="teamId" loadIdName="inventory_team_members_id" parent="team"/>
      <pagination-table slot="fixed" link="activity" parent="team" />
    </template>
  </f7-page>
</template>
<script>
import API from "../../api";
import ActivityTable from "../../components/table/activity.vue";
import RoleTable from "../../components/table/role.vue";
import PaginationTable from "../../components/table/pagination.vue";
import CurMexin from "../../utils/cur-num-mixin.vue";


export default {
  props:{
    item_link: Object
  },
  components: {
    PaginationTable,
    ActivityTable,
    RoleTable,
  },
  mixins:[CurMexin],
  created() {
    this.teamId = this.item_link.id;
    this.teamTitle = this.item_link.first_name+" "+ this.item_link.last_name;
    this.teamDesc = this.item_link.description;
  },
  computed: {
    headerBgColor(){
      return{
        "background-color": this.settings.team.header_color,
      }
    },
    highlightedColor(){
      return{
        "color": this.settings.team.highlight_color,
      }
    },
    highlightedBgColor(){
      return{
        "background-color": this.settings.team.highlight_color,
      }
    },
    fontColor(){
      return{
        "color": this.settings.team.font_color,
      }
    },
    subnavbarStyle(){
      const style = {
        "background-color": this.settings.team.header_color,
        "color": this.settings.team.font_color,
      }
      return style;
    }
  },
  methods: {
    loadDetail() {
      self = this;
      API.getTeamDetail(this.teamId).then(data => {
        self.team = data;
      });
    },
    teamUpdated(team){
      self = this;
      self.teamTitle = team.name;
      self.teamDesc = team.description;
      API.resetCache(`inventory/teams/${self.teamId}`);
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
      self.$f7router.navigate('/whs/team-add/', {
        props: {
          item_link: self.item_link
      }});
    }
  },
  beforeDestroy() {
    const self = this;
    self.$events.$off('team:updated', self.teamUpdated);
  },
  mounted() {
    const self = this;
    self.$events.$on('team:updated', self.teamUpdated);
    self.loadDetail();
  },
  data() {
    return {
      teamTitle: null,
      teamDesc: null,
      teamId: null,
      teamIndex: null,
      locations: [],
      activeTab: "summary",
      team:{},
      settings: API.main_page.$data.settings,
    };
  }
};
</script>
<style>

</style> 