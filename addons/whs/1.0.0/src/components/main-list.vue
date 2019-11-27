<template>
  <div class="main-list-container">
    <template v-if="loaded">
      <f7-list class="whs-list" media-list v-if="data.length >0 ">
        <f7-list-item
          v-for="(item, index) in data"
          chevron-center
          link          
          @click="goToDetails(item)"
          :title="item.name || item.first_name+' '+ item.last_name"
          :key="type+'_'+index"
        >
          <div
            slot="media"
            class="whs-item-image"
            :style="[item[image_link] ? {'background-image': `url(${item[image_link]})`}: styleImage]"
          ></div>
          <div
            class="whs-item-row"
            v-for="(row, index_row) in rows"
            :key="type+'_'+index+'_row_'+index_row"
          >
            <span>{{row.name}}:</span>
            {{item[row.link]}}
          </div>
          <div class="whs-item-row description" v-if="item.description">{{item.description}}</div>
        </f7-list-item>
      </f7-list>
      <empty-block v-else :text="$t('whs.common.no', { text: settings[type].plural_name})" />
    </template>
    <template v-if="!loaded">
      <div style="background: #fff;">
        <f7-list class="whs-list skeleton-text skeleton-effect-blink" media-list>
          <f7-list-item
            v-for="(index) in skeleton_count"
            chevron-center
            :key="'skeleton'+type+'_'+index"
          >
            <div class="item-title" style="color: #ccc !important">_______________</div>
            <div slot="media" class="whs-item-image"></div>
            <div class="whs-item-row">_______________</div>
            <div class="whs-item-row">___________</div>
          </f7-list-item>
        </f7-list>
      </div>
    </template>
  </div>
</template>

<script>
import API from "../api";
import EmptyBlock from "../components/empty-block.vue";

export default {
  name: "MainList",
  components: {
    EmptyBlock
  },
  props: {
    type: String,
    data: Array,
    detailUrl: String,
    styleImage: Object,
    rows: Array,
    image_link: {
      type: String,
      default: "image"
    },
    loaded: {
      type: Boolean,
      default: false
    },
    skeleton_count: {
      type: Number,
      default: 5
    },
  },
  computed: {},
  methods:{
    goToDetails(item){
      const self = this;
      self.$f7router.navigate(self.detailUrl, {
        props: {
          item_link: item
      }});
    }
  },
  data() {
    return {
      settings: API.main_page.$data.settings
    };
  },
};
</script>