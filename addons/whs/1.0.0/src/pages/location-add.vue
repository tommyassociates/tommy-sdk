<template>
  <f7-page>
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{title}}</f7-nav-title>
      <f7-nav-right class="whs-navbar-links">
        <f7-link icon-only @click="addLocation">
          <f7-icon f7="check" />
        </f7-link>
      </f7-nav-right>
    </f7-navbar>
    <form class="list" id="add-location" action="javascript:void(0)" enctype="multipart/form-data">
      <f7-list class="whs-form">
        <ul>
          <form-images-picker :lineWithActions="false" />
          <!-- Name -->
          <f7-list-item divider>
            <i class="whs-form-icon whs-form-icon-aa"></i>
            {{$t('whs.common.name_label')}}
          </f7-list-item>
          <f7-list-input
            type="text"
            name="name"
            required
            validate
            :error-message="$t('whs.common.required_name_error')"
            :value="location.name"
            @input="location.name = $event.target.value"
            :placeholder="$t('whs.common.required_placeholder')"
          />

          <!-- Barcode -->
          <f7-list-item divider>
            <i class="whs-form-icon whs-form-icon-barcode"></i>
            {{$t('whs.common.sku_barcode_label')}}
          </f7-list-item>
          <f7-list-input
            type="text"
            name="sku"
            :value="location.sku"
            @input="location.sku = $event.target.value"
            :placeholder="$t('whs.common.sku_barcode_placeholder')"
          >
            <a class="link whs-form-barcode-link" slot="input">
              <i class="whs-icon whs-icon-barcode"></i>
            </a>
          </f7-list-input>

          <!-- Parent Location -->
          <f7-list-item divider>
            <i class="whs-form-icon whs-form-icon-location"></i>
            {{$t('whs.common.parent_location_label')}}
          </f7-list-item>
          <f7-list-item
            link
            name="parent_location_id"
            :value="location.parent_location_id"
            @input="location.parent_location_id = $event.target.value"
            :title="$t('whs.common.parent_location_placeholder')"
          />

          <!-- description -->
          <f7-list-item divider>
            <i class="whs-form-icon whs-form-icon-text"></i>
            {{$t('whs.common.description_label')}}
          </f7-list-item>
          <f7-list-input
            type="textarea"
            resizable
            name="description"
            :value="location.description"
            @input="location.description = $event.target.value"
            :placeholder="$t('whs.common.description_placeholder')"
          />

          <!-- Capacity -->
          <f7-list-item divider>
            <i class="whs-form-icon whs-form-icon-1"></i>
            {{$t('whs.common.pallet_capacity_label')}}
          </f7-list-item>
          <f7-list-item :title="String(location.pallet_capacity)">
            <f7-stepper
              :value="location.pallet_capacity"
              :step="1"
              :autorepeat="true"
              :autorepeat-dynamic="true"
              :min="0"
              :max="999999999999999999"
              @stepper:change="(value)=>{location.pallet_capacity = value}"
              buttons-only
              color="gray"
            />
          </f7-list-item>

          <!-- Tags -->
          <f7-list-item divider>
            <i class="whs-form-icon whs-form-icon-hash"></i>
            {{$t('whs.common.tags_label')}}
          </f7-list-item>
          <tags-picker />

          <!-- Active Location -->
          <f7-list-item divider>
            <i class="whs-form-icon whs-form-icon-toggle"></i>
            {{$t('whs.common.active_location_label')}}
          </f7-list-item>
          <f7-list-item>
            <f7-toggle
              slot="after"
              :checked="location.active"
              @toggle:change="(value)=>{location.active = value}"
            />
          </f7-list-item>

          <!-- Category -->
          <f7-list-item divider>
            <i class="whs-form-icon whs-form-icon-check"></i>
            {{$t('whs.common.location_category_label')}}
          </f7-list-item>
          <f7-list-item
            link
            name="category"
            :value="location.category"
            @input="location.category = $event.target.value"
            :title="$t('whs.common.location_category_placeholder')"
          />
        </ul>
      </f7-list>
    </form>
    
    <div class="whs-form-delete" v-if="editId">
      <f7-link class="delete" @click="deleteDialog()">{{$t('whs.common.delete')}}</f7-link>
    </div>
    
  </f7-page>
</template>
<script>
import API from "../api";
import FormImagesPicker from "../components/form-images-picker.vue";
import TagsPicker from "../components/tags-picker.vue";
import Dialog from '../components/dialog-mixin.vue';

export default {
  components: {
    FormImagesPicker,
    TagsPicker
  },
  mixins: [Dialog],
  created() {
    if(this.$f7route.query.edit_id !== null && this.$f7route.query.edit_id !== undefined){
      this.editId = this.$f7route.query.edit_id;
      this.indexEdit = this.$f7route.query.index;
      ///load location from maim locations and clone
      this.location = Object.assign({}, API.main_page.$data.locations[this.indexEdit]);
    }
  },
  computed: {
    title(){
      if(this.editId){
        return this.$t('whs.form_add.title_edit', { text: this.settings.location.name})
      }else{
        return this.$t('whs.form_add.title', { text: this.settings.location.name})
      }
    }
  },
  methods: {
    addLocation() {
      self = this;
      if (this.$f7.$("#add-location")[0].checkValidity()) {
        if(this.editId){
          this.location = this.setDefaults(this.location);
          API.editLocation(this.location, this.editId)
            .then(()=>{
              self.$events.$emit('location:updated',this.location);     
              self.$f7router.back();
              API.toast(self.$t('whs.toast.edit', { text: this.settings.location.name}));
            });
        }else{
          this.location = API.removeEmpty(this.location);
          API.createLocation(this.location).then(() => {
            self.$events.$emit('location:aded',this.location);
            self.$f7router.back();
            API.toast(self.$t('whs.toast.add', { text: this.settings.location.name}));
          });
        }
      } else {
        this.alertDialog(this.$t('whs.alert_form.title'), this.$t('whs.alert_form.text'), this.$t('whs.alert_form.ok'));
      }
    },
    deleteLocation(){
      API.deleteLocation(this.editId)
        .then(()=>{
          self.$events.$emit('location:deleted',this.item);    
          self.$f7router.back('/whs/', {force: true}); 
          API.toast(self.$t('whs.toast.delete', { text: this.settings.location.name}));
        });
    },
    deleteDialog(){
      this.confirmDialog(this.$t('whs.alert_form.delete_title'), this.$t('whs.alert_form.delete_text'), this.$t('whs.alert_form.confirm'),this.$t('whs.alert_form.cancel'), this.deleteLocation);
    },
    setDefaults(item){
      self = this;
      for(key in self.default_item){
        if(item[key] === null || item[key] ==="") item[key] = self.default_item[key];
      }
      return item;
    }
  },
  beforeDestroy() {
    const self = this;
  },
  mounted() {
    const self = this;
  },
  data() {
    return {
      location: {
        name: null,
        sku: null,
        parent_location_id: null,
        description: null,
        pallet_capacity: 0,
        active: true,
        category: null
      },
      editId: null,
      indexEdit: null,
      default_location:{
      },
      settings: API.main_page.$data.settings,
    };
  }
};
</script>
