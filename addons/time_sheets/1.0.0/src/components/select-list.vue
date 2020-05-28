<template>
  <div class="main-list-container">
    <template v-if="loaded">
      <f7-list class="time-clock-select-list searchbar-found" media-list v-if="Object.keys(data).length > 0 " :id="'time-clock-select-'+type">
        <f7-list-item
          v-for="(item, index) in data"
          :checkbox="multiply"
          :radio="!multiply"
          name="time-clock-select-list-item"
          :checked ="selected == item.user_id"
          :title="item.name || item.first_name+' '+ item.last_name"
          :key="type+'_'+index"
          @change="toggleItem(item, $event.target.checked)"
        >
          <div
            slot="media"
            class="time-clock-item-image"
            :style="[item.icon_url ? {'background-image': `url(${item.icon_url})`}: '']"
          ></div>
        </f7-list-item>
      </f7-list>
    </template>
    <template v-if="!loaded">
      <div style="background: #fff;">
        <f7-list class="time-clock-list time-clock-select-list skeleton-text skeleton-effect-blink" media-list>
          <f7-list-item
            v-for="(index) in skeleton_count"
            :key="'skeleton'+type+'_'+index"
          >
            <div class="item-title" style="color: #ccc !important">_______________</div>
            <div slot="media" class="time-clock-item-image"></div>
            <div class="time-clock-item-row">_______________</div>
          </f7-list-item>
        </f7-list>
      </div>
    </template>
  </div>
</template>

<script>
import API from "../api";

export default {
  name: "MainList",
  props: {
    type: String,
    data: Object,
    selected: Number,
    multiply: Boolean,
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
    }
  },
  data() {
    return {
    };
  }
};
</script>
