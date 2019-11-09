<template>
  <f7-page>
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{title}}</f7-nav-title>
      <f7-nav-right class="whs-navbar-links">
        <f7-link icon-only @click="addItem">
          <f7-icon f7="check" />
        </f7-link>
      </f7-nav-right>
    </f7-navbar>

    <a class="whs-toolbar-button" slot="fixed" v-if="!editId" @click="()=>{addItem(true)}">{{$t('whs.form_add.add_more_button', { text: settings.item.name})}}</a>
    <form class="list" id="add-item" action="javascript:void(0)" enctype="multipart/form-data">  
    <f7-list class="whs-form">
      <ul>
        <form-images-picker
          :lineWithActions="false"
        />
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
          :value="item.name"
          @input="item.name = $event.target.value"
          :placeholder="$t('whs.common.required_placeholder')"
        />

        <f7-list-item divider>
          <i class="whs-form-icon whs-form-icon-barcode"></i>
          {{$t('whs.common.sku_barcode_label')}}
        </f7-list-item>
        <f7-list-input
          type="text"
          name="sku"
          :value="item.sku"
          @input="item.sku = $event.target.value"
          :placeholder="$t('whs.common.sku_barcode_placeholder')"
        >
          <a class="link whs-form-barcode-link" slot="input">
            <i class="whs-icon whs-icon-barcode"></i>
          </a>
        </f7-list-input>

        <f7-list-item divider>
          <i class="whs-form-icon whs-form-icon-dollar"></i>
          {{$t('whs.common.price_label')}}
        </f7-list-item>
        <f7-list-input
          type="number"
          name="price"
          :value="item.price"
          @input="item.price = $event.target.value"
          :placeholder="$t('whs.common.price_placeholder')"
        />

        <f7-list-item divider>
          <i class="whs-form-icon whs-form-icon-hash"></i>
          {{$t('whs.common.tags_label')}} Not work
        </f7-list-item>
        <tags-picker />
        <f7-list-item divider>
          <i class="whs-form-icon whs-form-icon-1"></i>
          {{$t('whs.common.minimum_stock_level_label')}}
        </f7-list-item>
        <f7-list-input
          type="number"
          name="min_stock_level"
          :value="item.min_stock_level"
          @input="item.min_stock_level = $event.target.value"
          :placeholder="$t('whs.common.minimum_stock_level_placeholder')"
        />

        <f7-list-item divider>
          <i class="whs-form-icon whs-form-icon-location"></i>
          {{$t('whs.common.location_quantity_label')}}
        </f7-list-item>        
        <f7-list-input
          type="number"
          name="quantity"
          :value="item.quantity"
          @input="item.quantity = $event.target.value"
          :placeholder="$t('whs.common.location_quantity_placeholder')"
        />

        <f7-list-item divider>
          <i class="whs-form-icon whs-form-icon-text"></i>
          {{$t('whs.common.description_label')}}
        </f7-list-item>
        <f7-list-input
          type="textarea"
          resizable
          name="description"
          :value="item.description"
          @input="item.description = $event.target.value"
          :placeholder="$t('whs.common.description_placeholder')"
        />        
        <f7-list-item divider>
          <i class="whs-form-icon whs-form-icon-check"></i>
          {{$t('whs.common.storage_label')}} Not work
        </f7-list-item>
        <f7-list-item
          link
          :title="$t('whs.common.storage_placeholder')"
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
import FormImagesPicker from '../components/form-images-picker.vue';
import TagsPicker from '../components/tags-picker.vue';
import Dialog from '../components/dialog-mixin.vue';

export default {
  components: {
    FormImagesPicker,
    TagsPicker,
  },
  mixins: [Dialog],
  created() {
    if(this.$f7route.query.edit_id !== null && this.$f7route.query.edit_id !== undefined){
      this.editId = this.$f7route.query.edit_id;
      this.indexEdit = this.$f7route.query.index
      ///load item from maim items and clone
      this.item = Object.assign({}, API.main_page.$data.items[this.indexEdit]);
    }

  },
  computed: {
    title(){
      if(this.editId){
        return this.$t('whs.form_add.title_edit', { text: this.settings.item.name})
      }else{
        return this.$t('whs.form_add.title', { text: this.settings.item.name})
      }
    }
  },
  methods: {
    addItem(more){
      const self = this;      
      if (this.$f7.$('#add-item')[0].checkValidity()) {
        if(this.editId){
          this.item = this.setDefaults(this.item);
          API.editItem(this.item, this.editId)
            .then(()=>{
              self.$events.$emit('item:updated',this.item);     
              self.$f7router.back();
              API.toast(self.$t('whs.toast.edit', { text: this.settings.item.name}));
            });
        }else{
          this.item = API.removeEmpty(this.item);
          API.createItem(this.item)
            .then(()=>{
              self.$events.$emit('item:aded',this.item); 
              if (more === true) {
                self.item = API.clearObject(self.item);
              }else {
                self.$f7router.back();
              }
              API.toast(self.$t('whs.toast.add', { text: this.settings.item.name}));
            });
        }
      } else {
        this.alertDialog(this.$t('whs.alert_form.title'), this.$t('whs.alert_form.text'), this.$t('whs.alert_form.ok'));
        return false;
      }
    },
    deleteItem(){
      API.deleteItem(this.editId)
        .then(()=>{
          self.$events.$emit('item:deleted',this.item);    
          self.$f7router.back('/whs/', {force: true}); 
          API.toast(self.$t('whs.toast.delete', { text: this.settings.item.name}));
        });
    },
    deleteDialog(){
      this.confirmDialog(this.$t('whs.alert_form.delete_title'), this.$t('whs.alert_form.delete_text'), this.$t('whs.alert_form.confirm'),this.$t('whs.alert_form.cancel'), this.deleteItem);
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
      item:{
        name: null,
        sku: null,
        price: null,
        quantity: null,
        min_stock_level: null,
        description: null,
        storage_type: null,
        image: null,
      },
      editId: null,
      indexEdit: null,
      default_item:{
        price: 0.0,
        width: 0,
        depth: 0,
        weight: 0,
        quantity: 0,
        min_stock_level: 0,
      },
      settings: API.main_page.$data.settings,
    };
  },
};
</script>
