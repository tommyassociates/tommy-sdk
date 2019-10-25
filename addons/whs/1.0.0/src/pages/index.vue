<template>
  <f7-page>
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{$t('whs.index.title')}}</f7-nav-title>
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
    </f7-navbar>
    <f7-popover class="whs-popover whs-popover-add" :backdrop="false">
      <f7-list no-chevron>
        <f7-list-item link="/whs/item-add/" popover-close>
          <i slot="media" class="whs-icon whs-icon-box-black"></i>
          <span slot="title">{{$t('whs.popover.new.item')}}</span>
        </f7-list-item>
        <f7-list-item link="/whs/location-add/" popover-close>
          <i slot="media" class="whs-icon whs-icon-drawer-black"></i>
          <span slot="title">{{$t('whs.popover.new.location')}}</span>
        </f7-list-item>
        <f7-list-item link="/whs/tag-add/" popover-close>
          <i slot="media" class="whs-icon whs-icon-tag-black"></i>
          <span slot="title">{{$t('whs.popover.new.tag')}}</span>
        </f7-list-item>
        <f7-list-item link="/whs/activity-add/" popover-close>
          <i slot="media" class="whs-icon whs-icon-clock-black"></i>
          <span slot="title">{{$t('whs.popover.new.activity')}}</span>
        </f7-list-item>
      </f7-list>
    </f7-popover>
    <f7-searchbar
      slot="static"
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
        <span>Items</span>
      </a>
      <a :class="`link ${activeTab === 'locations' ? 'whs-menubar-active' : ''}`" @click="activeTab = 'locations'">
        <i :class="`icon whs-icon whs-icon-drawer-${activeTab === 'locations' ? 'orange' : 'black'}`"></i>
        <span>Locations</span>
      </a>
      <a :class="`link ${activeTab === 'tags' ? 'whs-menubar-active' : ''}`" @click="activeTab = 'tags'">
        <i :class="`icon whs-icon whs-icon-tag-${activeTab === 'tags' ? 'orange' : 'black'}`"></i>
        <span>Tags</span>
      </a>
      <a :class="`link ${activeTab === 'activity' ? 'whs-menubar-active' : ''}`" @click="activeTab = 'activity'">
        <i :class="`icon whs-icon whs-icon-clock-${activeTab === 'activity' ? 'orange' : 'black'}`"></i>
        <span>Activity</span>
      </a>
    </div>

    <div class="whs-menubar" v-if="searchEnabled">
      <a :class="`link ${activeSearchFilter === 'all' ? 'whs-menubar-active' : ''}`" @click="activeSearchFilter = 'all'">
        <i class="icon f7-icons">data</i>
        <span>All</span>
      </a>
      <a :class="`link ${activeSearchFilter === 'items' ? 'whs-menubar-active' : ''}`" @click="activeSearchFilter = 'items'">
        <i :class="`icon whs-icon whs-icon-box-${activeSearchFilter === 'items' ? 'orange' : 'black'}`"></i>
        <span>Items</span>
      </a>
      <a :class="`link ${activeSearchFilter === 'locations' ? 'whs-menubar-active' : ''}`" @click="activeSearchFilter = 'locations'">
        <i :class="`icon whs-icon whs-icon-drawer-${activeSearchFilter === 'locations' ? 'orange' : 'black'}`"></i>
        <span>Locations</span>
      </a>
      <a :class="`link ${activeSearchFilter === 'tags' ? 'whs-menubar-active' : ''}`" @click="activeSearchFilter = 'tags'">
        <i :class="`icon whs-icon whs-icon-tag-${activeSearchFilter === 'tags' ? 'orange' : 'black'}`"></i>
        <span>Tags</span>
      </a>
    </div>

    <template v-if="activeTab === 'items' && !searchEnabled">
      <f7-list class="whs-list" media-list v-if="items.length >0">
        <f7-list-item
          v-for="(item, index) in items"
          chevron-center
          link="/whs/item/"
          :title="item.name"
          :key="index"
        >
          <div slot="media" class="whs-item-image"></div>
          <div class="whs-item-row">QUANTITY: {{item.quantity}}</div>
          <!--<div class="whs-item-row">LOCATIONS: 10</div>-->
          <div class="whs-item-row description" v-if="item.description">{{item.description}}</div>
        </f7-list-item>
      </f7-list>
      <empty-block v-else :text="$t('whs.common.no_items')" />
    </template>
    <template v-if="activeTab === 'locations' && !searchEnabled">
      <f7-list class="whs-list" media-list v-if="locations.length > 0">
        <f7-list-item
          v-for="(location, index) in locations"
          chevron-center
          link
          :title="location.name"
          :key="index"
        >
          <div slot="media" class="whs-item-image"></div>
          <div class="whs-item-row">LOCATIONS: 2000</div>
          <div class="whs-item-row">Test description of the location</div>
        </f7-list-item>
      </f7-list>
      <empty-block v-else :text="$t('whs.common.no_locations')" />
    </template>
    <template v-if="activeTab === 'tags' && !searchEnabled">
      <f7-list class="whs-list" media-list v-if="tags.length > 0">
        <f7-list-item
          v-for="(tag, index) in tags"
          chevron-center
          link
          :title="tag.name"
          :key="index"
        >
          <div slot="media" class="whs-item-image"></div>
          <div class="whs-item-row">LOCATIONS: 2000</div>
          <div class="whs-item-row">Items: 500</div>
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
            <span slot="title">{{$t('whs.popover.activity.item')}}</span>
          </f7-list-item>
          <f7-list-item @click='activityPopoverClick("location")'>
            <i slot="media" class="whs-icon whs-icon-drawer-black"></i>
            <span slot="title">{{$t('whs.popover.activity.location')}}</span>
          </f7-list-item>
          <f7-list-item @click='activityPopoverClick("tag")'>
            <i slot="media" class="whs-icon whs-icon-tag-black"></i>
            <span slot="title">{{$t('whs.popover.activity.tag')}}</span>
          </f7-list-item>
          <f7-list-item @click='activityPopoverClick("activity")'>
            <i slot="media" class="whs-icon whs-icon-clock-black"></i>
            <span slot="title">{{$t('whs.popover.activity.activity')}}</span>
          </f7-list-item>
        </f7-list>
      </f7-popover>
      <f7-list class="whs-list whs-main-activity" media-list v-if="activity.length > 0">
        <f7-list-item divider class="filter">
          <f7-link popover-open=".whs-popover-activity">
            {{$t(`whs.popover.activity.${activity_filter}`)}}
            <i class="whs-main-icon whs-icon-triangle"></i>        
          </f7-link>
          <f7-button fill>
            {{$t('whs.common.dashboard')}}
          </f7-button>        
        </f7-list-item>
      </f7-list>
      <empty-block v-else :text="$t('whs.common.no_activity')" />
    </template>

  </f7-page>
</template>
<script>
import API from "../api";
import EmptyBlock from '../components/empty-block.vue';

export default {
  components: {
    EmptyBlock,
  },
  created() {

  },
  computed: {
    
  },
  methods: {
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
    }
  },
  beforeDestroy() {
    const self = this;
  },
  mounted() {
    const self = this;
    API.getMainListItem().then((data)=>{self.items = data});
    API.getMainListLocations().then((data)=>{self.locations = data});
    //API.getMainListTags().then((data)=>{self.tags = data});
    API.getMainListActivities().then((data)=>{self.activity = data});
    
  },
    data() {
    return {
      activeTab: 'items',
      activeSearchFilter: 'all',
      search: '',
      searchEnabled: false,
      items: [],
      locations: [],
      tags: [],
      activity: [],
      activity_filter: "all",
    };
  }
};
</script>
