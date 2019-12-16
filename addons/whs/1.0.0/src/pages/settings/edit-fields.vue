<template>
  <f7-page>
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('whs.settings_fields.title')}}</f7-nav-title>
      <f7-nav-right class="whs-navbar-links">
        <f7-link icon-only>
          <f7-icon f7="check" />
        </f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-block-title class="whs-list-divider">{{$t('whs.settings_fields.active')}}</f7-block-title>
    <f7-list
      class="no-margin no-hairlines whs-settings-list whs-fields-list"
      sortable      
      sortable-enabled
      @sortable:sort="onSort"
      v-if="activeFields.length > 0"
      ref='sort_list'
    >
      <ul>
        <template 
          v-for="(field, index) in activeFields"
        >
          <f7-list-item
            :title="field.name"
            link="/whs/settings/items/field/"
            :key="'active_field'+index"
          >
            <i slot="media" :class="'whs-form-icon whs-form-icon-'+field.type"></i>
            <div slot="title">{{field.description}}</div>
          </f7-list-item>
        </template>
      </ul>
    </f7-list>
    <f7-list class="no-margin no-hairlines whs-settings-list whs-fields-list" v-if="inactiveFields.length > 0">
      <f7-block-title class="whs-list-divider">{{$t('whs.settings_fields.inactive')}}</f7-block-title>
      <ul>
        <template 
          v-for="(field, index) in inactiveFields"
        >
          <f7-list-item
            :title="field.name"
            link="/whs/settings/items/field/"
            :key="'inactive_field'+index"
          >
            <i slot="media" :class="'whs-form-icon whs-form-icon-'+field.type"></i>
            <div slot="title">{{field.description}}</div>
          </f7-list-item>
        </template>
      </ul>
    </f7-list>
    <f7-list class="no-margin no-hairlines whs-settings-list whs-fields-list" v-if="inactiveCustomFields.length > 0">
      <f7-block-title class="whs-list-divider">{{$t('whs.settings_fields.inactive_custom')}}</f7-block-title>
      <ul>
        <template 
          v-for="(field, index) in inactiveCustomFields"
        >
          <f7-list-item
            :title="field.name"
            link="/whs/settings/items/field/"
            :key="'inactive_custom_field'+index"
          >
            <i slot="media" :class="'whs-form-icon whs-form-icon-'+field.type"></i>
            <div slot="title">{{field.description}}</div>
          </f7-list-item>
        </template>
      </ul>
    </f7-list>
  </f7-page>
</template>
<script>
import API from "../../api";

export default {
  name: "EditFields",
  created() {
    const self = this;
    self.typeEdit = self.$f7route.query.type;
    const temp_fields = JSON.parse(
      JSON.stringify(API.main_page.$data.settings[self.typeEdit + "_fields"])
    );
    temp_fields.sort((a, b) => (a.order > b.order ? 1 : -1));
    self.fields = self.fields.concat(temp_fields);
    self.fields_clone = self.fields_clone.concat(temp_fields);
  },
  computed: {
    activeFields() {
      const self = this;
      fields_active = self.fields_clone.filter(e => e.active === true);
      return fields_active;
    },
    inactiveFields() {
      const self = this;
      fields_deactive = self.fields_clone.filter(e => e.active === false && e.custom !== true);
      return fields_deactive;
    },
    inactiveCustomFields() {
      const self = this;
      fields_deactive = self.fields_clone.filter(e => e.active === false && e.custom === true);
      return fields_deactive;
    }
  },
  methods: {
    onSort(data){
      const self = this;
      const from = data.detail.from -1;
      const to = data.detail.to -1;

      self.fields.splice(to, 0, self.fields.splice(from, 1)[0]);
      self.fields.forEach((f,index)=>{
        f.order = index;
      })      
    }
  },
  beforeDestroy() {
    const self = this;
  },
  mounted() {
    const self = this;
    //self.$refs
    console.log("TCL: mounted -> self.$refs", self.$refs)
  },
  data() {
    return {
      typeEdit: null,
      fields: [],
      fields_clone: [],
    };
  }
};
</script>
