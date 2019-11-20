<template>
  <li>
    <a class="item-content no-chevron item-link whs-list-search-item" @click="openSelector" v-if="selected.length == 0 || multiply">
      <div class="item-media">
        <i class="icon whs-list-search-icon"></i>
      </div>
      <div class="item-inner">
        <div class="item-title">{{$t('whs.common.tags_search_placeholder')}}</div>
      </div>
    </a>
    <ul class="tag-items whs-picker-selected-list">
      <li class="tag-item" v-for="(tag, index) in selected" :key="index">
        <div class="item-content">
          <div class="item-inner">
            <div class="item-media" :style="[tag.image ? {'background-image': `url(${tag.image})`}: tagStyle]"></div>

            <div class="item-title">{{tag.name}}</div>
            <div class="item-after"><a style="height: 24px" @click="removeItem(tag.id, tag.pseudo_type)" href="#" class="item-link"><i class="material-icons">close</i></a></div>
          </div>
        </div>
      </li>
    </ul>
  </li>
</template>
<script>
import API from "../api";
import ListStyles from "../mixins/list-styles.vue";

  export default {
    props:{
      selected:{
        default: Array
      },
      multiply:{
        type: Boolean,
        default: true
      }
    },
    mixins: [ListStyles],
    data(){
      return{
        settings: API.main_page.$data.settings     
      }
    },
    methods: {
      openSelector() {
        const self = this;
        self.$f7router.navigate('/whs/select-picker/', {
          props: {
            selected: self.selected,
            pageTitle: self.$t(`whs.common.select_tags_title`),
            multiply: self.multiply,
            getData: self.getData,
            type: "tag",
            multiply: self.multiply,
            onChange(tag, selected) {                            
              if (selected) {
                self.$emit('itemAdd', tag);
                self.addItem(tag);
              } else {
                self.$emit('itemRemove', tag); 
                self.deleteItem(tag);
              }
            },
          },
        });
      },
      getData(self){
        API.getTags().then(data => {
          data.forEach((item, index)=>{item.pseudo_type = "tag"});
          Object.assign(self.targets, data);
          console.log("TCL: getData -> self.targets", self.targets)
          self.loaded = true;
          self.createSearchbar();
        });
      },
      addItem(target){
        self = this;
        if(self.multiply){          
          self.selected.push(target)
        }else{
          self.selected.splice(0, 99);
          self.selected.push(target)
        }
      },
      deleteItem(target){
        self = this;
        const index = self.selected.findIndex(tag => tag.id === target.id && tag.pseudo_type === target.pseudo_type);
        self.selected.splice(index, 1);
      },
      removeItem(itemId, pseudo_type) {
        const self = this;
        const index = self.selected.findIndex(tag => tag.id === itemId && tag.pseudo_type === pseudo_type);
        self.selected.splice(index, 1);
      },
    },
  }
</script>
