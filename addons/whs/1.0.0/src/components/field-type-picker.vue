<template>
  <f7-popup class="whs-field-type-popup">
    <f7-page>
      <f7-navbar>
        <f7-nav-left>
          <f7-link icon-f7="close" popup-close=".whs-field-type-popup" />
        </f7-nav-left>
        <f7-nav-title>{{$t('whs.settings_type.title')}}</f7-nav-title>
      </f7-navbar>

      <f7-list class="no-margin no-hairlines">
        <f7-list-item
          :title="$t('whs.settings_type.currency')"
          :checked="type === 'currency'"
          @change="onChange('currency')"
          radio
        >
          <i slot="media" class="whs-form-icon whs-form-icon-dollar"></i>
        </f7-list-item>
        <f7-list-item
          :title="$t('whs.settings_type.switch')"
          :checked="type === 'switch'"
          @change="onChange('switch')"
          radio
        >
          <i slot="media" class="whs-form-icon whs-form-icon-toggle"></i>
        </f7-list-item>
        <f7-list-item
          :title="$t('whs.settings_type.single_line_text')"
          :checked="type === 'single_line_text'"
          @change="onChange('single_line_text')"
          radio
        >
          <i slot="media" class="whs-form-icon whs-form-icon-aa"></i>
        </f7-list-item>
        <f7-list-item
          :title="$t('whs.settings_type.multi_line_text')"
          :checked="type === 'multi_line_text'"
          @change="onChange('multi_line_text')"
          radio
        >
          <i slot="media" class="whs-form-icon whs-form-icon-text-multiline"></i>
        </f7-list-item>
        <f7-list-item
          :title="$t('whs.settings_type.percentage')"
          :checked="type === 'percentage'"
          @change="onChange('percentage')"
          radio
        >
          <i slot="media" class="whs-form-icon whs-form-icon-percentage"></i>
        </f7-list-item>
        <f7-list-item
          :title="$t('whs.settings_type.integer')"
          :checked="type === 'integer'"
          @change="onChange('integer')"
          radio
        >
          <i slot="media" class="whs-form-icon whs-form-icon-1"></i>
        </f7-list-item>
        <f7-list-item
          :title="$t('whs.settings_type.barcode')"
          :checked="type === 'barcode'"
          @change="onChange('barcode')"
          radio
        >
          <i slot="media" class="whs-form-icon whs-form-icon-barcode"></i>
        </f7-list-item>
        <f7-list-item
          :title="$t('whs.settings_type.date')"
          :checked="type === 'date'"
          @change="onChange('date')"
          radio
        >
          <i slot="media" class="whs-form-icon whs-form-icon-calendar"></i>
        </f7-list-item>
        <f7-list-item
          :title="$t('whs.settings_type.url')"
          :checked="type === 'url'"
          @change="onChange('url')"
          radio
        >
          <i slot="media" class="whs-form-icon whs-form-icon-link"></i>
        </f7-list-item>
        <f7-list-item
          :title="$t('whs.settings_type.single_select')"
          :checked="type === 'single_select'"
          @change="onChange('single_select')"
          radio
        >
          <i slot="media" class="whs-form-icon whs-form-icon-dot"></i>
        </f7-list-item>
        <f7-list-item
          :title="$t('whs.settings_type.multi_select')"
          :checked="type === 'multi_select'"
          @change="onChange('multi_select')"
          radio
        >
          <i slot="media" class="whs-form-icon whs-form-icon-check"></i>
        </f7-list-item>
      </f7-list>
    </f7-page>
  </f7-popup>
</template>
<script>
  export default {
    props: {
      type: String,
    },
    methods: {
      onChange(v) {
        this.$emit('change', v);
      },
    },
  }
</script>
