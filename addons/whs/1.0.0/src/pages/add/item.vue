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

    <a
      class="whs-toolbar-button"
      slot="fixed"
      v-if="!editId"
      @click="()=>{addItem(true)}"
    >{{$t('whs.form_add.add_more_button', { text: settings.item.name})}}</a>
    <form class="list" id="add-item" action="javascript:void(0)" enctype="multipart/form-data">
      <f7-list class="whs-form">
        <ul>
          <template v-for="(field, index) in prepareFields(settings.item_fields)">
              <component 
                :is="field.type"
                :key="'field_'+index"
                :params="field"
                :value="item[field.alias]"
                @value:update="valueUpdate"
                :ref="'field_'+field.alias"
              ></component>
          </template>
        </ul>
      </f7-list>
    </form>

    <div class="whs-form-delete" v-if="editId">
      <f7-link class="delete" @click="deleteDialog()">{{$t('whs.common.delete')}}</f7-link>
    </div>
  </f7-page>
</template>
<script>
import API from "../../api";
import Dialog from "../../mixins/dialog.vue";

//fields
import SingleLineField from "../../components/fields/single_line_text.vue";
import MultiLineField from "../../components/fields/multi_line_text.vue";
import PhotoField from "../../components/fields/photo.vue";
import BarcodeField from "../../components/fields/barcode.vue";
import CurrencyField from "../../components/fields/currency.vue";
import TagField from "../../components/fields/tag.vue";
import IntegerField from "../../components/fields/integer.vue";
import SingleSelectField from "../../components/fields/single_select.vue";

export default {
  name: "AddItem",
  props:{
    item_link: Object
  },
  components: {
    single_line_text: SingleLineField,
    multi_line_text: MultiLineField,
    photo: PhotoField,
    barcode: BarcodeField,
    currency: CurrencyField,
    tag: TagField,
    integer: IntegerField,
    single_select: SingleSelectField,
  },
  mixins: [Dialog],
  created() {
    if (this.item_link) {
      this.editId = this.item_link.id;
      this.item = Object.assign({}, this.item_link);
      this.loadFilters();
    }
  },
  computed: {
    title() {
      if (this.editId) {
        return this.$t("whs.form_add.title_edit", {
          text: this.settings.item.name
        });
      } else {
        return this.$t("whs.form_add.title", { text: this.settings.item.name });
      }
    }
  },
  watch:{
    filters(newFilter) { 
      const self = this;
      if(newFilter.length > 0){
        self.item.filters = JSON.stringify(newFilter);
        self.item.with_filters = true;
      }else{
        self.$delete(self.item, 'filters');
        self.$delete(self.item, 'with_filters');
      }
    }
  },
  methods: {
    prepareFields(fields){
      fields = fields.filter(e => e.active === true);
      fields.sort((a, b) => (a.order > b.order) ? 1 : -1)
      return fields;
    },
    valueUpdate(e){
      const self = this;
      switch(e.alias){
        case 'tag':
          self.tagsChange(e.value);
          break;
        default:
          self.item[e.alias] = e.value;
          break;
      }      
    },
    addItem(more) {
      const self = this;
      if (this.$f7.$("#add-item")[0].checkValidity()) {
        if (this.editId) {
          this.item = this.setDefaults(this.item);
          API.editItem(this.item, this.editId).then(() => {
            self.$events.$emit("item:updated", this.item);
            self.$f7router.back();
            API.toast(
              self.$t("whs.toast.edit", { text: this.settings.item.name })
            );
          });
        } else {
          this.item = API.removeEmpty(this.item);
          API.createItem(this.item).then(() => {
            self.$events.$emit("item:aded", this.item);
            if (more === true) {
              self.item = API.clearObject(self.item);
            } else {
              self.$f7router.back();
            }
            API.toast(
              self.$t("whs.toast.add", { text: this.settings.item.name })
            );
          });
        }
      } else {
        this.alertDialog(
          this.$t("whs.alert_form.title"),
          this.$t("whs.alert_form.text"),
          this.$t("whs.alert_form.ok")
        );
        return false;
      }
    },
    deleteItem() {
      API.deleteItem(this.editId).then(() => {
        self.$events.$emit("item:deleted", this.item);
        self.$f7router.back("/whs/", { force: true });
        API.toast(
          self.$t("whs.toast.delete", { text: this.settings.item.name })
        );
      });
    },
    deleteDialog() {
      this.confirmDialog(
        this.$t("whs.alert_form.delete_title"),
        this.$t("whs.alert_form.delete_text"),
        this.$t("whs.alert_form.confirm"),
        this.$t("whs.alert_form.cancel"),
        this.deleteItem
      );
    },
    setDefaults(item) {
      self = this;
      for (key in self.default_item) {
        if (item[key] === null || item[key] === "")
          item[key] = self.default_item[key];
      }
      return item;
    },
    tagsChange(target){
      self = this;
      self.filters = self.filters.filter(e => e.context!= "tags");
      if (target.length > 0) {
        self.filters = self.filters.concat(target);
      } 
    },
    prepareFilters(tags){
      self = this;
      tags.forEach(e =>{
        e.id = e.tag_id;
        delete e.tag_id;
        self.filters.push(e);
      })
      self.$refs.field_tag[0].$refs.tags_picker.setValue(self.filters);
    },
    loadFilters() {
      self = this;
      API.getItemDetail(self.editId, false, true).then(data => {
        self.prepareFilters(data.filters);
      });
    },
  },
  beforeDestroy() {
    const self = this;
  },
  mounted() {
    const self = this;
  },
  data() {
    return {
      item: {
        name: null,
        sku: null,
        price: null,
        quantity: null,
        min_stock_level: null,
        description: null,
        storage_type: null,
        image: null
      },
      editId: null,
      indexEdit: null,
      default_item: {
        price: 0.0,
        width: 0,
        depth: 0,
        weight: 0,
        quantity: 0,
        min_stock_level: 0
      },
      settings: API.main_page.$data.settings,
      filters: [],
    };
  }
};
</script>
