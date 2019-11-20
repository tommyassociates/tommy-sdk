<template>
  <li>
    <a class="item-content no-chevron item-link whs-list-search-item" @click="openSelector">
      <div class="item-media">
        <i class="icon whs-list-search-icon"></i>
      </div>
      <div class="item-inner">
        <div class="item-title">{{$t('whs.common.assets_search_placeholder')}}</div>
      </div>
    </a>
    <ul class="asset-items whs-picker-selected-list">
      <li class="asset-item" v-for="(asset, index) in selected" :key="index">
        <div class="item-content">
          <div class="item-inner">
            <div class="item-media" :style="[asset.image ? {'background-image': `url(${asset.image})`}: teamStyle]"></div>
            <div class="item-title">{{asset.name || asset.first_name+' '+ asset.last_name}}</div>
            <div class="item-after"><a style="height: 24px" @click="removeItem(asset.id, asset.pseudo_type)" href="#" class="item-link"><i class="material-icons">close</i></a></div>
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
            pageTitle: self.$t(`whs.common.select_assets_title`),
            multiply: self.multiply,
            getData: self.getData,
            type: "asset",
            onChange(asset, selected) {                            
              if (selected) {
                self.$emit('itemAdd', asset);
                self.addItem(asset);
              } else {
                self.$emit('itemRemove', asset); 
                self.deleteItem(asset);
              }
            },
          },
        });
      },
      getData(self){
        Promise.all([API.getTeam(), API.getRoles()]).then(data => { 
        console.log("TCL: getData -> data", data)
          data[0].forEach((item, index)=>{item.pseudo_type = "team"});
          data[1].forEach((item, index)=>{item.pseudo_type = "role"});
          Object.assign(self.targets, data[0].concat(data[1]));          
          self.loaded = true;
          self.createSearchbar();
        });
      },
      addItem(target){
        self = this;
        self.selected.push(target)
      },
      deleteItem(target){
        self = this;
        const index = self.selected.findIndex(asset => asset.id === target.id && asset.pseudo_type === target.pseudo_type);
        self.selected.splice(index, 1);
      },
      removeItem(itemId, pseudo_type) {
        const self = this;
        const index = self.selected.findIndex(asset => asset.id === itemId && asset.pseudo_type === pseudo_type);
        self.selected.splice(index, 1);
      },
    },
  }
</script>
