<template>
  <div class="main-list-container">
    <template v-if="loaded">
      <f7-list class="whs-list whs-select-list searchbar-found" media-list v-if="Object.keys(data).length > 0 " :id="'whs-select-'+type">
        <f7-list-item
          v-for="(item, index) in data"
          checkbox
          :checked ="checkId(item)"
          :title="item.name || item.first_name+' '+ item.last_name"
          :key="type+'_'+index"
          @change="toggleItem(item, $event.target.checked)"
        >
          <div
            slot="media"
            class="whs-item-image"
            :style="[item[image_link] ? {'background-image': `url(${item[image_link]})`}: styleImage]"
          ></div>
          <div class="whs-item-row description" v-if="item.description">{{item.description}}</div>
        </f7-list-item>
      </f7-list>
      <empty-block v-else :text="$t('whs.common.no', { text: settings[type].plural_name})" />
    </template>
    <template v-if="!loaded">
      <div style="background: #fff;">
        <f7-list class="whs-list whs-select-list skeleton-text skeleton-effect-blink" media-list>
          <f7-list-item
            v-for="(index) in skeleton_count"
            :key="'skeleton'+type+'_'+index"
          >
            <div class="item-title" style="color: #ccc !important">_______________</div>
            <div slot="media" class="whs-item-image"></div>
            <div class="whs-item-row">_______________</div>
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
    data: Object,
    selected: Array,
    styleImage: Object,
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
  methods:{
    toggleItem(item, checked){
      self = this;
      self.$emit('change', {target: item, checked: checked});
    },
    checkId(target) {
      const self = this;
      if (typeof self.selected === 'undefined') return false;
      return (
        self.selected.filter(t => t.id === target.id && t.pseudo_type === target.pseudo_type).length > 0
      );
    },
  },
  data() {
    return {
      settings: API.main_page.$data.settings
    };
  }
};
</script>