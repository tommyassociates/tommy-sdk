<template>
  <f7-page>
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('whs.settings_field.title')}}</f7-nav-title>
      <f7-nav-right class="whs-navbar-links">
        <f7-link icon-only>
          <f7-icon f7="check" />
        </f7-link>
      </f7-nav-right>
    </f7-navbar>

    <div slot="fixed" class="whs-field-delete-button">
      <a>{{$t('whs.settings_field.delete')}}</a>
    </div>

    <f7-list class="whs-form">
      <ul>
        <f7-list-item divider>
          <i class="whs-form-icon whs-form-icon-aa"></i>
          {{$t('whs.settings_field.name_label')}}
        </f7-list-item>
        <f7-list-input
          type="text"
          :placeholder="$t('whs.common.required_placeholder')"
          value="Name"
        />

        <f7-list-item divider>
          <i class="whs-form-icon whs-form-icon-aa"></i>
          {{$t('whs.settings_field.alias_label')}}
        </f7-list-item>
        <f7-list-input
          type="text"
          :placeholder="$t('whs.common.required_placeholder')"
          value="Name"
        />

        <f7-list-item divider>
          <i class="whs-form-icon whs-form-icon-aa"></i>
          {{$t('whs.settings_field.description_label')}}
        </f7-list-item>
        <f7-list-input
          type="text"
          :placeholder="$t('whs.common.required_placeholder')"
          value="Short single line name of the item"
        />

        <f7-list-item divider>
          <i class="whs-form-icon whs-form-icon-dot"></i>
          {{$t('whs.settings_field.type_label')}}
        </f7-list-item>
        <f7-list-item link popup-open=".whs-field-type-popup" title="Single line text" />
      </ul>
    </f7-list>

    <field-type-picker :type="type" @change="(v) => type = v" />
  </f7-page>
</template>
<script>
import API from "../../api";
import FieldTypePicker from "../../components/picker/field-type.vue";

export default {
  components: {
    FieldTypePicker
  },
  data() {
    return {
      type: "single_line_text"
    };
  },
  created() {},
  computed: {},
  methods: {},
  beforeDestroy() {
    const self = this;
  },
  mounted() {
    const self = this;
  }
};
</script>
