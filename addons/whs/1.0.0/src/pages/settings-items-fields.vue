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

    <f7-list class="no-margin no-hairlines whs-settings-list whs-fields-list" sortable sortableEnabled>
      <ul>
        <f7-list-item
          divider
          :title="$t('whs.settings_fields.active')"
        />
        <f7-list-item
          :title="$t('whs.settings_fields.name_label')"
          link="/whs/settings/items/field/"
        >
          <i slot="media" class="whs-form-icon whs-form-icon-aa"></i>
        </f7-list-item>
        <f7-list-item
          :title="$t('whs.settings_fields.description_label')"
          link="/whs/settings/items/field/"
        >
          <i slot="media" class="whs-form-icon whs-form-icon-aa"></i>
          <div slot="title">{{$t('whs.settings_fields.description_info')}}</div>
        </f7-list-item>
        <f7-list-item
          :title="$t('whs.settings_fields.photo_label')"
          link="/whs/settings/items/field/"
        >
          <i slot="media" class="whs-form-icon whs-form-icon-photo"></i>
          <div slot="title">{{$t('whs.settings_fields.photo_info')}}</div>
        </f7-list-item>
        <f7-list-item
          :title="$t('whs.settings_fields.value_label')"
          link="/whs/settings/items/field/"
        >
          <i slot="media" class="whs-form-icon whs-form-icon-dollar"></i>
          <div slot="title">{{$t('whs.settings_fields.value_info')}}</div>
        </f7-list-item>
        <f7-list-item
          :title="$t('whs.settings_fields.weight_label')"
          link="/whs/settings/items/field/"
        >
          <i slot="media" class="whs-form-icon whs-form-icon-int"></i>
          <div slot="title">{{$t('whs.settings_fields.weight_info')}}</div>
        </f7-list-item>
      </ul>
    </f7-list>
    <f7-list class="no-margin no-hairlines whs-settings-list whs-fields-list">
      <ul>
        <f7-list-item
          divider
          :title="$t('whs.settings_fields.inactive')"
        />
        <f7-list-item
          title="Lot Code"
          link="/whs/settings/items/field/"
        >
          <i slot="media" class="whs-form-icon whs-form-icon-aa"></i>
        </f7-list-item>
      </ul>
    </f7-list>
    <f7-list class="no-margin no-hairlines whs-settings-list whs-fields-list">
      <ul>
        <f7-list-item
          divider
          :title="$t('whs.settings_fields.inactive_custom')"
        />
        <f7-list-item
          title="Custom Field Name"
          link="/whs/settings/items/field/"
        >
          <div slot="title">Custom description</div>
          <i slot="media" class="whs-form-icon whs-form-icon-calendar"></i>
        </f7-list-item>
        <f7-list-item
          :title="$t('whs.settings_fields.new_custom_field')"
          link="/whs/settings/items/field/"
        >
          <i slot="media" class="icon f7-icons color-red">add</i>
        </f7-list-item>
      </ul>
    </f7-list>
  </f7-page>
</template>
<script>
  import API from "../api";

  export default {
    data() {
      return {
      };
    },
    created() {

    },
    computed: {

    },
    methods: {

    },
    beforeDestroy() {
      const self = this;
    },
    mounted() {
      const self = this;
    }
};
</script>
