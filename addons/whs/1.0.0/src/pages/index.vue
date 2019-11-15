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

    <template v-if="activeTab === 'items' && !searchEnabled">
      <f7-list class="whs-list" media-list v-if="items.length >0">
        <f7-list-item
          v-for="(item, index) in items"
          chevron-center
          :link="`/whs/item/?id=${item.id}&index=${index}`"
          :title="item.name"
          :key="'item_'+index"
        >
          <div slot="media" class="whs-item-image" :style="[item.image ? {'background-image': `url(${item.image})`}: itemStyle]"></div>
          <div class="whs-item-row">QUANTITY: {{item.quantity}}</div>
          <!--<div class="whs-item-row">LOCATIONS: 10</div>-->
          <div class="whs-item-row description" v-if="item.description">{{item.description}}</div>
        </f7-list-item>
      </f7-list>
      <empty-block v-else :text="$t('whs.common.no', { text: settings.item.plural_name})" />
    </template>
    <template v-if="activeTab === 'locations' && !searchEnabled">
      <f7-list class="whs-list" media-list v-if="locations.length > 0">
        <f7-list-item
          v-for="(location, index) in locations"
          chevron-center
          :link="`/whs/location/?id=${location.id}&index=${index}`"
          :title="location.name"
          :key="'location_'+index"
        >
          <div slot="media" class="whs-item-image" :style="[location.image ? {'background-image': `url(${location.image})`}: locationStyle]"></div>
          <div class="whs-item-row">CAPACITY: {{location.pallet_capacity}}</div>
          <div class="whs-item-row">{{location.description}}</div>
        </f7-list-item>
      </f7-list>
      <empty-block v-else :text="$t('whs.common.no', { text: settings.location.plural_name})" />
    </template>
    <template v-if="activeTab === 'tags' && !searchEnabled">
      <f7-list class="whs-list" media-list v-if="tags.length > 0">
        <f7-list-item
          v-for="(tag, index) in tags"
          chevron-center
          :link="`/whs/tag/?id=${tag.id}&index=${index}`"
          :title="tag.name"
          :key="index"
        >
          <div slot="media" class="whs-item-image" :style="[tag.image ? {'background-image': `url(${tag.image})`}: tagStyle]"></div>          
          <div class="whs-item-row">COUNT: {{tag.taggings_count}}</div>
        </f7-list-item>
      </f7-list>
      <empty-block v-else :text="$t('whs.common.no_tags')" />
    </template>
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
          <f7-list-item
            v-for="(target, index) in activities_main.items"
            chevron-center
            link
            :title="target.name"
            :key='"activity_item_"+index'
          >
            <div slot="media" class="whs-item-image" :style="[target.image ? {'background-image': `url(${target.image})`}: itemStyle]"></div>
            <div class="whs-item-row">OPEN: {{target.open_count}}</div>
            <div class="whs-item-row">DUE: {{target.due_count}}</div>
            <div class="whs-item-row">OVERDUE: {{target.overdue_count}}</div>            
          </f7-list-item>
          <f7-list-item divider class="more">
            <f7-link @click="actionMoreClick('location')">
              {{$t('whs.common.more')}}
            </f7-link>
          </f7-list-item>
          <f7-list-item divider class="divider-title">
            {{settings.location.plural_name}}
          </f7-list-item>
          <f7-list-item
            v-for="(target, index) in activities_main.locations"
            chevron-center
            link
            :title="target.name"
            :key='"activity_location_"+index'
          >
            <div slot="media" class="whs-item-image" :style="[target.image ? {'background-image': `url(${target.image})`}: locationStyle]"></div>
            <div class="whs-item-row">OPEN: {{target.open_count}}</div>
            <div class="whs-item-row">DUE: {{target.due_count}}</div>
            <div class="whs-item-row">OVERDUE: {{target.overdue_count}}</div>            
          </f7-list-item>

          <f7-list-item divider class="more">
            <f7-link @click="actionMoreClick('tag')">
              {{$t('whs.common.more')}}
            </f7-link>
          </f7-list-item>
          <f7-list-item divider class="divider-title">
            {{settings.tag.plural_name}}
          </f7-list-item>
          <f7-list-item
            v-for="(target, index) in activities_main.tags"
            chevron-center
            link
            :title="target.name"
            :key='"activity_tag_"+index'
          >
            <div slot="media" class="whs-item-image" :style="[target.image ? {'background-image': `url(${target.image})`}: tagStyle]"></div>
            <div class="whs-item-row">OPEN: {{target.open_count}}</div>
            <div class="whs-item-row">DUE: {{target.due_count}}</div>
            <div class="whs-item-row">OVERDUE: {{target.overdue_count}}</div>            
          </f7-list-item>

          <f7-list-item divider class="more">
            <f7-link @click="actionMoreClick('role')">
              {{$t('whs.common.more')}}
            </f7-link>
          </f7-list-item>
          <f7-list-item divider class="divider-title">
            {{$t('whs.popover.activity.role')}}
          </f7-list-item>
          <f7-list-item
            v-for="(target, index) in activities_main.roles"
            chevron-center
            link
            :title="target.name"
            :key='"activity_role_"+index'
          >
            <div slot="media" class="whs-item-image" :style="[target.image ? {'background-image': `url(${target.image})`}: roleStyle]"></div>
            <div class="whs-item-row">OPEN: {{target.open_count}}</div>
            <div class="whs-item-row">DUE: {{target.due_count}}</div>
            <div class="whs-item-row">OVERDUE: {{target.overdue_count}}</div>            
          </f7-list-item>

          <f7-list-item divider class="more">
            <f7-link @click="actionMoreClick('team')">
              {{$t('whs.common.more')}}
            </f7-link>
          </f7-list-item>
          <f7-list-item divider class="divider-title">
            {{$t('whs.popover.activity.team')}}
          </f7-list-item>
          <f7-list-item
            v-for="(target, index) in activities_main.team"
            chevron-center
            link
            :title="target.first_name+' '+target.last_name"
            :key='"activity_team_"+index'
          >
            <div slot="media" class="whs-item-image" :style="[target.image_url ? {'background-image': `url(${target.image_url})`}: teamStyle]"></div>
            <div class="whs-item-row">OPEN: {{target.open_count}}</div>
            <div class="whs-item-row">DUE: {{target.due_count}}</div>
            <div class="whs-item-row">OVERDUE: {{target.overdue_count}}</div>            
          </f7-list-item>
        </f7-list>


        <f7-list v-else class="selected whs-list whs-main-activity" media-list>
          <f7-list-item
            v-for="(target, index) in activities_more.data"
            chevron-center
            link
            :title="target.name || target.first_name+' '+target.last_name"
            :key='"activity_selected_"+index'
          >
            <div slot="media" class="whs-item-image" :style="[target.image ? {'background-image': `url(${target.image})`}: moreActivitiesStyle]"></div>
            <div class="whs-item-row">OPEN: {{target.open_count}}</div>
            <div class="whs-item-row">DUE: {{target.due_count}}</div>
            <div class="whs-item-row">OVERDUE: {{target.overdue_count}}</div>   
          </f7-list-item>
        </f7-list>
      <!--<empty-block v-if="activity.length === 0" :text="$t('whs.common.no', { text: settings.activity.plural_name})" />--> 
    </template>

  </f7-page>
</template>
<script>
import API from "../api";
import Settings from "../settings";
import EmptyBlock from '../components/empty-block.vue';

export default {
  components: {
    EmptyBlock,
  },
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
    },
    itemStyle(){
      if (this.settings.location.image.indexOf("base64") === -1){
        return {
          "background-image": `url(${API.file_base_url+this.settings.item.image})`,          
        }
      }else{
        return {
          "background-image": `url(${this.settings.item.image})`,          
        }
      }
    },
    locationStyle(){
      if (this.settings.location.image.indexOf("base64") === -1){
        return {
          "background-image": `url(${API.file_base_url+this.settings.location.image})`,          
        }
      }else{
        return {
          "background-image": `url(${this.settings.location.image})`,          
        }
      }
    },
    tagStyle(){
      if (this.settings.location.image.indexOf("base64") === -1){
        return {
          "background-image": `url(${API.file_base_url+this.settings.tag.image})`,          
        }
      }else{
        return {
          "background-image": `url(${this.settings.tag.image})`,          
        }
      }      
    },
    activityStyle(){
      if (this.settings.location.image.indexOf("base64") === -1){
        return {
          "background-image": `url(${API.file_base_url+this.settings.activity.image})`,          
        }
      }else{
        return {
          "background-image": `url(${this.settings.activity.image})`,          
        }
      }      
    },
    roleStyle(){
      if (this.settings.location.image.indexOf("base64") === -1){
        return {
          "background-image": `url(${API.file_base_url+this.settings.role.image})`,          
        }
      }else{
        return {
          "background-image": `url(${this.settings.role.image})`,          
        }
      }      
    },
    teamStyle(){
      if (this.settings.location.image.indexOf("base64") === -1){
        return {
          "background-image": `url(${API.file_base_url+this.settings.team.image})`,          
        }
      }else{
        return {
          "background-image": `url(${this.settings.team.image})`,          
        }
      }      
    },
    moreActivitiesStyle(){
      self = this;
      switch (self.activities_more.target){
        case "item":
          return self.itemStyle;
          break;
        case "location":
          return self.locationStyle;
          break;
        case "tag":
          return self.tagStyle;
          break;
        case "role":
          return self.roleStyle;
          break;
        case "team":
          return self.teamStyle;
          break;
      }
    }
  },
  methods: {
    getItem(){
      const self = this;
      API.getItem().then((data)=>{self.items = data});
    },
    getLocations(){
      const self = this;
      API.getLocations().then((data)=>{self.locations = data});
    },
    getActivities(){
      self = this;
      const options = {
        'with_activity_counts': true,
        'page_limit': 2,
      }
        /*
        API.getItem(options).then((data)=>{self.activities_main.items = data});
        API.getLocations(options).then((data)=>{self.activities_main.locations = data});
        API.getTags(options).then((data)=>{self.activities_main.tags = data});
        API.getRoles(options).then((data)=>{self.activities_main.roles = data});
        API.getTeam(options).then((data)=>{self.activities_main.team = data});
*/
        //witot limit page
        API.getItem(options).then((data)=>{self.activities_main.items = [data[0],data[1]]});
        API.getLocations(options).then((data)=>{self.activities_main.locations = [data[0],data[1]]});
        API.getTags(options).then((data)=>{self.activities_main.tags = [data[0],data[1]]});
        API.getRoles(options).then((data)=>{self.activities_main.roles = [data[0],data[1]]});
        API.getTeam(options).then((data)=>{self.activities_main.team = [data[0],data[1]]});
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
        detail_link: "",
      }
      switch (target){
        case "item":
          API.getItem(options).then((data)=>{self.activities_more.data = data});
          self.activities_more.detail_link = ""
          break;
        case "location":
          API.getLocations(options).then((data)=>{self.activities_more.data = data});
          self.activities_more.detail_link = ""
          break;
        case "tag":
          API.getTags(options).then((data)=>{self.activities_more.data = data});
          self.activities_more.detail_link = ""
          break;
        case "role":
          API.getRoles(options).then((data)=>{self.activities_more.data = data});
          self.activities_more.detail_link = ""
          break;
        case "team":
          API.getTeam(options).then((data)=>{self.activities_more.data = data});
          self.activities_more.detail_link = ""
          break;
      }
    },
    getTags(){
      const self = this;
      API.getTags().then((data)=>{self.tags = data});
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
      API.resetCache('inventory/items');
      self.getItem();
    },
    locationUpdated(){
      self = this;
      API.resetCache('inventory/locations');
      self.getLocations();
    },
    tagUpdated(){
      self = this;
      API.resetCache('inventory/tags');
      self.getTags();
    },
    getSettings(){
      const self = this;
      API.getSettings().catch((data)=>{console.log("TCL: getSettings -> data", data); });
    },
    setDefaultSettings(settings){
      self = this;
      if(settings !== null){
        for(item in self.settings){
          if(settings[item] !== null && settings[item] !== undefined){
            for(key in self.settings[item]){
              if(settings[item][key] === null || settings[item][key] ==="" || settings[item][key] === undefined) settings[item][key] = self.settings[item][key];
            }
          }else{
            settings[item] = self.settings[item];
          }
        }
        return settings;
      }else{
        return self.settings;
      }
    },
    parseSettings(settings){
      const new_settings = new Object();
      self = this;
      if(settings !== null){
        const new_settings = settings.reduce((obj, item) => { obj[item["name"]] = item.data; return obj}, {})
        for(def in self.settings){
          if (new_settings[def] === undefined) {
            new_settings[def] = self.settings[def];
          }else{
            for(itemDef in self.settings[def]){
              if(new_settings[def][itemDef] === undefined) {
                new_settings[def][itemDef] = self.settings[def][itemDef];
              }
            } 
          }
        }
        return new_settings;
      }else{
        return self.settings;
      }
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
    self.$events.$on('tag:deleted', self.tagnUpdated);
    
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
        detail_link: "",        
      },
      activity_filter: "all",
      settings: Settings,      
    };
  }
}; 
</script> 
