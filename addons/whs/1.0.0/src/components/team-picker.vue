<template>
  <li>
    <a class="item-content no-chevron item-link whs-list-search-item" @click="openSelector" v-if="selected.length == 0 || multiply">
      <div class="item-media">
        <i class="icon whs-list-search-icon"></i>
      </div>
      <div class="item-inner">
        <div class="item-title">{{$t('whs.common.teams_search_placeholder')}}</div>
      </div>
    </a>
    <ul class="team-items whs-picker-selected-list">
      <li class="team-item" v-for="(team, index) in selected" :key="index">
        <div class="item-content">
          <div class="item-inner">
            <div class="item-media" :style="[team.icon_url ? {'background-image': `url(${team.icon_url})`}: teamStyle]"></div>

            <div class="item-title">{{team.first_name}} {{team.last_name}}</div>
            <div class="item-after"><a style="height: 24px" @click="removeItem(team.id, team.pseudo_type)" href="#" class="item-link"><i class="material-icons">close</i></a></div>
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
            pageTitle: self.$t(`whs.common.select_teams_title`),
            multiply: self.multiply,
            getData: self.getData,
            type: "team",
            multiply: self.multiply,
            image_link: "icon_url",
            onChange(team, selected) {                            
              if (selected) {
                self.$emit('itemAdd', team);
                self.addItem(team);
              } else {
                self.$emit('itemRemove', team); 
                self.deleteItem(team);
              }
            },
          },
        });
      },
      getData(self){
        API.getTeam().then(data => {
          data.forEach((item, index)=>{item.pseudo_type = "team"});
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
        const index = self.selected.findIndex(team => team.id === target.id && team.pseudo_type === target.pseudo_type);
        self.selected.splice(index, 1);
      },
      removeItem(itemId, pseudo_type) {
        const self = this;
        const index = self.selected.findIndex(team => team.id === itemId && team.pseudo_type === pseudo_type);
        self.selected.splice(index, 1);
      },
    },
  }
</script>
