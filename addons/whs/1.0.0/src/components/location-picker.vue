<template>
  <li>
    <a class="item-content no-chevron item-link whs-list-search-item" @click="openSelector" v-if="selected.length == 0 || multiply">
      <div class="item-media">
        <i class="icon whs-list-search-icon"></i>
      </div>
      <div class="item-inner">
        <div class="item-title">{{$t(`whs.common.dynamic_search_placeholder`,{text: settings.location.name})}}</div>
      </div>
    </a>
    <ul class="location-items whs-picker-selected-list">
      <li class="location-item" v-for="(location, index) in selected" :key="index">
        <div class="item-content">
          <div class="item-inner">
            <div class="item-media" :style="[location.image ? {'background-image': `url(${location.image})`}: locationStyle]"></div>

            <div class="item-title">{{location.name}}</div>
            <div class="item-after"><a style="height: 24px" @click="removeItem(location.id, location.pseudo_type)" href="#" class="item-link"><i class="material-icons">close</i></a></div>
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
      loadSelect:{
        type: Array
      },
      multiply:{
        type: Boolean,
        default: true
      }
    },
    mixins: [ListStyles],
    data(){
      return{
        selected: [],
        settings: API.main_page.$data.settings     
      }
    },
    methods: {
      openSelector() {
        const self = this;
        self.$f7router.navigate('/whs/select-picker/', {
          props: {
            selected: self.selected,
            pageTitle: self.$t(`whs.common.dynamic_select_title`,{text: self.settings.location.name}),
            multiply: self.multiply,
            getData: self.getData,
            type: "location",
            multiply: self.multiply,
            onChange(location, selected) {                            
              if (selected) {
                self.$emit('itemAdd', location);
                self.addItem(location);
              } else {
                self.$emit('itemRemove', location); 
                self.deleteItem(location);
              }
            },
          },
        });
      },
      getData(self){
        API.getLocations().then(data => {
          data.forEach((item, index)=>{item.pseudo_type = "location"});
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
        self.$emit("selected:change", self.selected);
      },
      deleteItem(target){
        self = this;
        const index = self.selected.findIndex(location => location.id === target.id && location.pseudo_type === target.pseudo_type);
        self.selected.splice(index, 1);
        self.$emit("selected:change", self.selected);
      },
      removeItem(itemId, pseudo_type) {
        const self = this;
        const index = self.selected.findIndex(location => location.id === itemId && location.pseudo_type === pseudo_type);
        self.selected.splice(index, 1);
        self.$emit("selected:change", self.selected);
      },
      locationLoadSelect(){
        self = this;      
        self.loadSelect.forEach(target_id => {
          if(target_id !== null){
            API.getLocationDetail(target_id, false).then(data => {
              data.pseudo_type = 'location';
              self.selected.push(data);
            });
          }   
        });       
      }
    },
    mounted(){
      self = this;
      self.locationLoadSelect();
    }
  }
</script>
