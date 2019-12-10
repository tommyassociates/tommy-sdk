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
          <template v-for="(field, index) in prepareFields(settings.location_fields)">
              <component 
                :is="field.type"
                :key="'field_'+index"
                :params="field"
                :value="location[field.alias]"
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
import LocationField from "../../components/fields/location.vue";
import ToggleField from "../../components/fields/toggle.vue";

export default {
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
    location: LocationField,
    toggle: ToggleField,
  },
  mixins: [Dialog],
  created() {
    if (this.item_link) {
      this.editId = this.item_link.id;
      this.location = Object.assign({}, this.item_link);
      this.loadFilters();
    }
  },
  computed: {
    title() {
      if (this.editId) {
        return this.$t("whs.form_add.title_edit", {
          text: this.settings.location.name
        });
      } else {
        return this.$t("whs.form_add.title", {
          text: this.settings.location.name
        });
      }
    }
  },
  watch:{
    filters(newFilter) { 
      const self = this;
      self.location.filters = JSON.stringify(newFilter);
      self.location.with_filters = true;
    }
  },
  methods: {
    prepareFields(fields){
      fields = fields.filter(e => e.active === true);
      fields.sort((a, b) => (a.order > b.order) ? 1 : -1)
      return fields;
    },
    valueUpdate(e){
      console.log("TCL: valueUpdate -> e", e)
      const self = this;
      switch(e.alias){
        case 'tag':
          self.tagsChange(e.value);
          break;
        case 'parent_location_id':
          self.parentLocationChange(e.value);
          break;
        default:
          self.location[e.alias] = e.value;
          break;
      }      
    },
    addLocation() {
      const self = this;
      if (this.$f7.$("#add-location")[0].checkValidity()) {
        if (this.editId) {
          this.location = this.setDefaults(this.location);
          API.editLocation(this.location, this.editId).then(() => {
            self.$events.$emit("location:updated", this.location);
            self.$f7router.back();
            API.toast(
              self.$t("whs.toast.edit", { text: this.settings.location.name })
            );
          });
        } else {
          this.location = API.removeEmpty(this.location);
          API.createLocation(this.location).then(() => {
            self.$events.$emit("location:aded", this.location);
            self.$f7router.back();
            API.toast(
              self.$t("whs.toast.add", { text: this.settings.location.name })
            );
          });
        }
      } else {
        this.alertDialog(
          this.$t("whs.alert_form.title"),
          this.$t("whs.alert_form.text"),
          this.$t("whs.alert_form.ok")
        );
      }
    },
    deleteLocation() {
      API.deleteLocation(this.editId).then(() => {
        self.$events.$emit("location:deleted", this.item);
        self.$f7router.back("/whs/", { force: true });
        API.toast(
          self.$t("whs.toast.delete", { text: this.settings.location.name })
        );
      });
    },
    deleteDialog() {
      this.confirmDialog(
        this.$t("whs.alert_form.delete_title"),
        this.$t("whs.alert_form.delete_text"),
        this.$t("whs.alert_form.confirm"),
        this.$t("whs.alert_form.cancel"),
        this.deleteLocation
      );
    },
    setDefaults(item) {
      const self = this;
      for (key in self.default_item) {
        if (item[key] === null || item[key] === "")
          item[key] = self.default_item[key];
      }
      return item;
    },
    parentLocationChange(target) {
      const self = this;
      if (target.length > 0) {
        self.location.parent_location_id = target[0].id;
      } else {
        self.location.parent_location_id = null;
      }
    },
    tagsChange(target){
      const self = this;
      self.filters = self.filters.filter(e => e.context!= "tags");
      if (target.length > 0) {
        self.filters = self.filters.concat(target);
      } 
    },
    prepareFilters(tags){
      const self = this;
      tags.forEach(e =>{
        e.id = e.tag_id;
        delete e.tag_id;
        self.filters.push(e);
      })
      self.$refs.field_tag[0].$refs.tags_picker.setValue(self.filters);
    },
    loadFilters() {
      const self = this;
      API.getLocationDetail(self.editId, false, true).then(data => {
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
      location: {
        name: null,
        sku: null,
        parent_location_id: null,
        description: null,
        pallet_capacity: null,
        active: true,
        category: null,
        image: null,
      },
      editId: null,
      indexEdit: null,
      default_location: {},
      settings: API.main_page.$data.settings,
      filters: [],
    };
  }
};
</script>
