<template>
  <f7-page class="whs-main-page">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{settings.main.name}}</f7-nav-title>
      <f7-nav-right class="whs-navbar-links">
        <f7-link icon-only popover-open=".whs-popover-add">
          <f7-icon f7="add" />
        </f7-link>
        <f7-link icon-only>
          <f7-icon f7="bell" />
        </f7-link>
        <f7-link href="/whs/settings/" icon-only>
          <f7-icon f7="gear" />
        </f7-link>
      </f7-nav-right>

      <f7-subnavbar class="main-subnavbar">
        <f7-searchbar
          class="whs-searchbar"
          :placeholder="$t('whs.common.search_placeholder')"
          customSearch
          :backdrop="false"
          :disableButton="false"
          :value="search"
          @input="onSearchbarSearch($event.target.value)"
          @searchbar:clear="onSearchbarClear"
          @searchbar:enable="searchEnabled = true"
          @searchbar:disable="searchEnabled = false"
        >
          <f7-link icon-only>
            <i class="icon whs-icon-barcode"></i>
          </f7-link>
          <f7-link icon-only>
            <i class="icon whs-icon-sort-black"></i>
          </f7-link>
        </f7-searchbar>

        <div class="whs-menubar" v-if="!searchEnabled">
          <a :class="`link ${activeTab === 'items' ? 'whs-menubar-active' : ''}`" @click="activeTab = 'items'">
            <i :class="`icon whs-icon whs-icon-box-${activeTab === 'items' ? 'orange' : 'black'}`"></i>
            <span>{{settings.item.plural_name}}</span>
          </a>
          <a :class="`link ${activeTab === 'locations' ? 'whs-menubar-active' : ''}`" @click="activeTab = 'locations'">
            <i :class="`icon whs-icon whs-icon-drawer-${activeTab === 'locations' ? 'orange' : 'black'}`"></i>
            <span>{{settings.location.plural_name}}</span>
          </a>
          <a :class="`link ${activeTab === 'tags' ? 'whs-menubar-active' : ''}`" @click="activeTab = 'tags'">
            <i :class="`icon whs-icon whs-icon-tag-${activeTab === 'tags' ? 'orange' : 'black'}`"></i>
            <span>{{settings.tag.plural_name}}</span>
          </a>
          <a :class="`link ${activeTab === 'activity' ? 'whs-menubar-active' : ''}`" @click="activeTab = 'activity'">
            <i :class="`icon whs-icon whs-icon-clock-${activeTab === 'activity' ? 'orange' : 'black'}`"></i>
            <span>{{settings.activity.plural_name}}</span>
          </a>
        </div>

        <div class="whs-menubar" v-if="searchEnabled">
          <a :class="`link ${activeSearchFilter === 'all' ? 'whs-menubar-active' : ''}`" @click="activeSearchFilter = 'all'">
            <i class="icon f7-icons">data</i>
            <span>All</span>
          </a>
          <a :class="`link ${activeSearchFilter === 'items' ? 'whs-menubar-active' : ''}`" @click="activeSearchFilter = 'items'">
            <i :class="`icon whs-icon whs-icon-box-${activeSearchFilter === 'items' ? 'orange' : 'black'}`"></i>
            <span>{{settings.item.plural_name}}</span>
          </a>
          <a :class="`link ${activeSearchFilter === 'locations' ? 'whs-menubar-active' : ''}`" @click="activeSearchFilter = 'locations'">
            <i :class="`icon whs-icon whs-icon-drawer-${activeSearchFilter === 'locations' ? 'orange' : 'black'}`"></i>
            <span>{{settings.location.plural_name}}</span>
          </a>
          <a :class="`link ${activeSearchFilter === 'tags' ? 'whs-menubar-active' : ''}`" @click="activeSearchFilter = 'tags'">
            <i :class="`icon whs-icon whs-icon-tag-${activeSearchFilter === 'tags' ? 'orange' : 'black'}`"></i>
            <span>{{settings.tag.plural_name}}</span>
          </a>
        </div>
      </f7-subnavbar>

    </f7-navbar>
    <f7-popover class="whs-popover whs-popover-add" :backdrop="false">
      <f7-list no-chevron>
        <f7-list-item link="/whs/item-add/" popover-close>
          <i slot="media" class="whs-icon whs-icon-box-black"></i>
          <span slot="title">{{$t('whs.common.new', { text: settings.item.name})}}</span>
        </f7-list-item>
        <f7-list-item link="/whs/location-add/" popover-close>
          <i slot="media" class="whs-icon whs-icon-drawer-black"></i>
          <span slot="title">{{$t('whs.common.new', { text: settings.location.name})}}</span>
        </f7-list-item>
        <f7-list-item link="/whs/tag-add/" popover-close>
          <i slot="media" class="whs-icon whs-icon-tag-black"></i>
          <span slot="title">{{$t('whs.common.new', { text: settings.tag.name})}}</span>
        </f7-list-item>
        <f7-list-item link="/whs/activity-add/" popover-close>
          <i slot="media" class="whs-icon whs-icon-clock-black"></i>
          <span slot="title">{{$t('whs.common.new', { text: settings.activity.name})}}</span>
        </f7-list-item>
      </f7-list>
    </f7-popover>

    <main-list
      v-if="activeTab === 'items' && !searchEnabled" 
      type="item" 
      :data="items" 
      detailUrl="/whs/item/" 
      :styleImage="itemStyle"
      :loaded="loaded.item"
      :rows="
        [
          { 
            name: 'Quantity',
            link: 'quantity'
          }
        ]"
    />
    <main-list
      v-if="activeTab === 'locations' && !searchEnabled"
      type="location" 
      :data="locations" 
      detailUrl="/whs/location/" 
      :styleImage="locationStyle"
      :loaded="loaded.location"
      :rows="
        [
          { 
            name: 'Capacity',
            link: 'pallet_capacity'
          }
        ]"
    />
    <main-list
      v-if="activeTab === 'tags' && !searchEnabled"
      type="tag" 
      :data="tags" 
      detailUrl="/whs/tag/" 
      :styleImage="tagStyle"
      :loaded="loaded.tag"
      :rows="
        [
          { 
            name: 'Count',
            link: 'taggings_count'
          }
        ]"
    />
    <template v-if="activeTab === 'activity' && !searchEnabled">
      <f7-popover class="whs-popover whs-popover-activity" :backdrop="false">
        <f7-list no-chevron>
          <f7-list-item @click='activityPopoverClick("all")'>
            <i slot="media" class="whs-icon whs-icon-box-black"></i>
            <span slot="title">{{$t('whs.popover.activity.all')}}</span>
          </f7-list-item>
          <f7-list-item @click='activityPopoverClick("item")'>
            <i slot="media" class="whs-icon whs-icon-box-black"></i>
            <span slot="title">{{settings.item.plural_name}}</span>
          </f7-list-item>
          <f7-list-item @click='activityPopoverClick("location")'>
            <i slot="media" class="whs-icon whs-icon-drawer-black"></i>
            <span slot="title">{{settings.location.plural_name}}</span>
          </f7-list-item>
          <f7-list-item @click='activityPopoverClick("tag")'>
            <i slot="media" class="whs-icon whs-icon-tag-black"></i>
            <span slot="title">{{settings.tag.plural_name}}</span>
          </f7-list-item>
          <f7-list-item @click='activityPopoverClick("role")'>
            <i slot="media" class="whs-icon whs-icon-roles"></i>
            <span slot="title">{{$t('whs.popover.activity.role')}}</span>
          </f7-list-item>
          <f7-list-item @click='activityPopoverClick("team")'>
            <i slot="media" class="whs-icon whs-icon-team"></i>
            <span slot="title">{{$t('whs.popover.activity.team')}}</span>
          </f7-list-item>
        </f7-list>
      </f7-popover>
      <f7-list class="whs-list whs-main-activity" media-list>
        <f7-list-item divider class="filter">
          <f7-link popover-open=".whs-popover-activity">
            {{activityFilterTitle}}
            <i class="whs-main-icon whs-icon-triangle"></i>        
          </f7-link>
          <f7-button fill>
            {{$t('whs.common.dashboard')}}
          </f7-button>        
        </f7-list-item>
      </f7-list>
      <f7-list class="whs-list whs-main-activity all" media-list v-if='activity_filter === "all"'>
          <f7-list-item divider class="more">
            <f7-link @click="actionMoreClick('item')">
              {{$t('whs.common.more')}}
            </f7-link>
          </f7-list-item>
          <f7-list-item divider class="divider-title">
            {{settings.item.plural_name}}
          </f7-list-item>
          <f7-list-item-row>
            <main-list
              type="item" 
              :data="activities_main.items" 
              detailUrl="/whs/item/" 
              :styleImage="itemStyle"
              :loaded="loaded.activity.item"
              :skeleton_count=2
              :rows="
                [
                  {name: 'Open', link: 'open_count'},
                  {name: 'Due', link: 'due_count'},
                  {name: 'Overdue', link: 'overdue_count'}
                ]"
            />
          </f7-list-item-row>

          <f7-list-item divider class="more">
            <f7-link @click="actionMoreClick('location')">
              {{$t('whs.common.more')}}
            </f7-link>
          </f7-list-item>
          <f7-list-item divider class="divider-title">
            {{settings.location.plural_name}}
          </f7-list-item>
          <f7-list-item-row>
            <main-list
              type="location" 
              :data="activities_main.locations" 
              detailUrl="/whs/location/" 
              :styleImage="locationStyle"
              :loaded="loaded.activity.location"
              :skeleton_count=2
              :rows="
                [
                  {name: 'Open', link: 'open_count'},
                  {name: 'Due', link: 'due_count'},
                  {name: 'Overdue', link: 'overdue_count'}
                ]"
            />
          </f7-list-item-row>

          <f7-list-item divider class="more">
            <f7-link @click="actionMoreClick('tag')">
              {{$t('whs.common.more')}}
            </f7-link>
          </f7-list-item>
          <f7-list-item divider class="divider-title">
            {{settings.tag.plural_name}}
          </f7-list-item>
          <f7-list-item-row>
            <main-list
              type="tag" 
              :data="activities_main.tags" 
              detailUrl="/whs/tag/" 
              :styleImage="tagStyle"
              :loaded="loaded.activity.tag"
              :skeleton_count=2
              :rows="
                [
                  {name: 'Open', link: 'open_count'},
                  {name: 'Due', link: 'due_count'},
                  {name: 'Overdue', link: 'overdue_count'}
                ]"
            />
          </f7-list-item-row>

          <f7-list-item divider class="more">
            <f7-link @click="actionMoreClick('role')">
              {{$t('whs.common.more')}}
            </f7-link>
          </f7-list-item>
          <f7-list-item divider class="divider-title">
            {{$t('whs.popover.activity.role')}}
          </f7-list-item>
          <f7-list-item-row>
            <main-list
              type="role" 
              :data="activities_main.roles" 
              detailUrl="/whs/role/" 
              :styleImage="roleStyle"
              :loaded="loaded.activity.role"
              :skeleton_count=2
              :rows="
                [
                  {name: 'Open', link: 'open_count'},
                  {name: 'Due', link: 'due_count'},
                  {name: 'Overdue', link: 'overdue_count'}
                ]"
            />
          </f7-list-item-row>

          <f7-list-item divider class="more">
            <f7-link @click="actionMoreClick('team')">
              {{$t('whs.common.more')}}
            </f7-link>
          </f7-list-item>
          <f7-list-item divider class="divider-title">
            {{$t('whs.popover.activity.team')}}
          </f7-list-item>
          <f7-list-item-row>
            <main-list
              type="team" 
              :data="activities_main.team" 
              detailUrl="/whs/team/" 
              :styleImage="teamStyle"
              :loaded="loaded.activity.team"
              :skeleton_count=2
              image_link="image_url"
              :rows="
                [
                  {name: 'Open', link: 'open_count'},
                  {name: 'Due', link: 'due_count'},
                  {name: 'Overdue', link: 'overdue_count'}
                ]"
            />
          </f7-list-item-row>
        </f7-list>

        <f7-list v-else class="selected whs-list whs-main-activity" media-list>
          <f7-list-item
            v-for="(target, index) in activities_more.data"
            chevron-center
            link
            :title="target.name || target.first_name+' '+target.last_name"
            :key='"activity_selected_"+index'
          >
            <div slot="media" class="whs-item-image" :style="[target.image ? {'background-image': `url(${target.image})`}: dynamicStyle]"></div>
            <div class="whs-item-row">OPEN: {{target.open_count}}</div>
            <div class="whs-item-row">DUE: {{target.due_count}}</div>
            <div class="whs-item-row">OVERDUE: {{target.overdue_count}}</div>   
          </f7-list-item>

          <f7-list-item-row>
            <main-list
              :type="activities_more.target" 
              :data="activities_more.data" 
              :detailUrl="'/whs/'+activities_more.target+'/'" 
              :styleImage="dynamicStyle"
              :loaded="loaded.activity_more"
              :image_link="activities_more.target === 'team' ? 'image_url' : 'image'"
              :rows="
                [
                  {name: 'Open', link: 'open_count'},
                  {name: 'Due', link: 'due_count'},
                  {name: 'Overdue', link: 'overdue_count'}
                ]"
            />
          </f7-list-item-row>

        </f7-list>
      <!--<empty-block v-if="activity.length === 0" :text="$t('whs.common.no', { text: settings.activity.plural_name})" />--> 
    </template>

  </f7-page>
</template>
<script>
import API from "../api";
import Settings from "../settings";
import EmptyBlock from '../components/empty-block.vue';
import MainList from '../components/main-list.vue';
import ListStyles from '../mixins/list-styles.vue';

export default {
  components: {
    EmptyBlock,
    'main-list': MainList,
  },
  mixins: [ListStyles],
  created() {
    const self = this;
    API.main_page = this;
    API.team_id = this.$root.team.id;
    //set patch for styles 
    const addon = self.$root.addons.filter(a => a.package === 'whs')[0];
    API.file_base_url = addon.file_base_url;
  },
  computed: {
    activityFilterTitle(){
      switch(this.activity_filter){
        case "all":
          return this.$t('whs.popover.activity.all')
          break;
        case "role":
          return this.$t('whs.popover.activity.role')
          break;
        case "team":
          return this.$t('whs.popover.activity.team')
          break;
        default:
          return this.settings[this.activity_filter].plural_name;
          break;
      }
    }
  },
  methods: {
    getItem(){
      const self = this;
      API.getItem().then((data)=>{self.items = data; self.loaded.item = true;});
    },
    getLocations(){
      const self = this;
      API.getLocations().then((data)=>{self.locations = data; self.loaded.location = true;});
    },
    getActivities(){
      self = this;
      const options = {
        'with_activity_counts': true,
        'page_limit': 2,
      }
        /*
        API.getItem(options).then((data)=>{self.activities_main.items = data; self.loaded.activity.item = true;});
        API.getLocations(options).then((data)=>{self.activities_main.locations = data; self.loaded.activity.location = true;});
        API.getTags(options).then((data)=>{self.activities_main.tags = data; self.loaded.activity.tag = true;});
        API.getRoles(options).then((data)=>{self.activities_main.roles = data; self.loaded.activity.role = true;});
        API.getTeam(options).then((data)=>{self.activities_main.team = data; self.loaded.activity.team = true;});
*/

        //for test activity
        API.getActivities().then((data)=>{console.log("TCL: getActivities -> data", data)});
        
        //witot limit page
        API.getItem(options).then((data)=>{self.activities_main.items = [data[0],data[1]]; self.loaded.activity.item = true;});
        API.getLocations(options).then((data)=>{self.activities_main.locations = [data[0],data[1]]; self.loaded.activity.location = true;});
        API.getTags(options).then((data)=>{self.activities_main.tags = [data[0],data[1]]; self.loaded.activity.tag = true;});
        API.getRoles(options).then((data)=>{self.activities_main.roles = [data[0],data[1]]; self.loaded.activity.role = true;});
        API.getTeam(options).then((data)=>{self.activities_main.team = [data[0],data[1]]; self.loaded.activity.team = true;});
    },
    getActivitiesMore(target){
      self = this;
      const options = {
        'with_activity_counts': true,
      }
      //reset data
      self.activities_more = {
        data: [],
        target: target,
      }
      //link to more styles list
      self.dynamicStyleTarget = self.activities_more.target,  
      //reset loader
      self.loaded.activity_more = false;
      switch (target){
        case "item":
          API.getItem(options).then((data)=>{self.activities_more.data = data; self.loaded.activity_more = true;});
          break;
        case "location":
          API.getLocations(options).then((data)=>{self.activities_more.data = data; self.loaded.activity_more = true;});
          break;
        case "tag":
          API.getTags(options).then((data)=>{self.activities_more.data = data; self.loaded.activity_more = true;});
          break;
        case "role":
          API.getRoles(options).then((data)=>{self.activities_more.data = data; self.loaded.activity_more = true;});
          break;
        case "team":
          API.getTeam(options).then((data)=>{self.activities_more.data = data; self.loaded.activity_more = true;});
          break;
      }
    },
    getTags(){
      const self = this;
      API.getTags().then((data)=>{self.tags = data; self.loaded.tag = true;});
    },
    onSearchbarSearch(query) {
      const self = this;
      self.search = query;
    },
    onSearchbarClear(e) {
      const self = this;
      self.$f7.searchbar.disable();
    },
    activityPopoverClick(filter){
      this.activity_filter = filter;
      this.$f7.popover.close(".whs-popover-activity");
      this.getActivitiesMore(filter);
    },
    actionMoreClick(filter){
      this.activity_filter = filter;
      this.getActivitiesMore(filter);
    },
    itemUpdated(){ 
      self = this;
      self.loaded.item = false;
      API.resetCache('inventory/items');
      self.getItem();
    },
    locationUpdated(){
      self = this;
      self.loaded.location = false;
      API.resetCache('inventory/locations');
      self.getLocations();
    },
    tagUpdated(){
      self = this;
      self.loaded.tag = false;
      API.resetCache('inventory/tags');
      self.getTags();
    },
    parseSettings(settings) {
      console.log("TCL: parseSettings -> settings", settings)
      self = this;
      if (settings === null) return self.settings;
      //array -> object
      const new_settings = settings.reduce((obj, item) => {
        obj[item["name"]] = item.data;
        return obj;
      }, {});
      /// 
      return self.compareDefSettings(self.settings, new_settings);
    },
    compareDefSettings(def_settings, new_settings){
      self = this; 
      for (def in def_settings) {
        if (new_settings[def] === undefined) {
          new_settings[def] = def_settings[def];
        } else {
          for (itemDef in def_settings[def]) {
            if (new_settings[def][itemDef] === undefined) {
              new_settings[def][itemDef] = def_settings[def][itemDef];
            }else if(typeof new_settings[def][itemDef] === "object") {
              //deper check
              new_settings[def][itemDef] = self.compareDefSettings(def_settings[def][itemDef], new_settings[def][itemDef]);
            }
          }
        }
      }
      return new_settings;
    }
  },
  beforeDestroy() {
    const self = this;

    self.$events.$off('item:updated', self.itemUpdated);
    self.$events.$off('item:aded', self.itemUpdated);
    self.$events.$off('item:deleted', self.itemUpdated);
    self.$events.$off('location:updated', self.locationUpdated);
    self.$events.$off('location:aded', self.locationUpdated);
    self.$events.$off('location:deleted', self.locationUpdated);
    self.$events.$off('tag:updated', self.tagUpdated);
    self.$events.$off('tag:aded', self.tagUpdated);
    self.$events.$off('tag:deleted', self.tagnUpdated);
  },
  mounted() {
    const self = this;
    //API.deleteSettings('mainSettings');
    API.getSettings().then((res) => {
      self.settings = self.parseSettings(res);
      self.loaded.settings = true;
      self.getItem();
      self.getLocations();
      self.getActivities();
      self.getTags();
    }); 
    

    self.$events.$on('item:updated', self.itemUpdated);
    self.$events.$on('item:aded', self.itemUpdated);
    self.$events.$on('item:deleted', self.itemUpdated);
    self.$events.$on('location:updated', self.locationUpdated);
    self.$events.$on('location:aded', self.locationUpdated);
    self.$events.$on('location:deleted', self.locationUpdated);
    self.$events.$on('tag:updated', self.tagUpdated);
    self.$events.$on('tag:aded', self.tagUpdated);
    self.$events.$on('tag:deleted', self.tagUpdated);
    
  },
  data() {
    self = this;
    console.log("TCL: data -> self", self)
    return {
      activeTab: 'items',
      activeSearchFilter: 'all',
      search: '',
      searchEnabled: false,
      items: [],
      locations: [],
      tags: [],
      activities: [],
      activities_main: {
        items:[],
        locations:[],
        tags:[],
        roles:[],
        team:[],
      },
      activities_more: {
        data: [],
        target: "",
      },
      activity_filter: "all",
      settings: Settings,
      loaded:{
        settings: false,
        item: false,
        location: false,
        tag: false,
        activity: {
          item: false,
          location: false,
          tag: false,
          role: false,
          team: false,
        },
        activity_more: false
      },       
    };
  }
}; 
</script> 
