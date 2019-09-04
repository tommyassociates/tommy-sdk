<template>
  <f7-page>
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('whs.item_add.title')}}</f7-nav-title>
      <f7-nav-right class="whs-navbar-links">
        <f7-link icon-only>
          <f7-icon f7="check" />
        </f7-link>
      </f7-nav-right>
    </f7-navbar>

    <a class="whs-toolbar-button" slot="fixed">{{$t('whs.item_add.add_more_button')}}</a>

    <f7-list class="whs-form">
      <ul>
        <form-images-picker
          :lineWithActions="false"
          multiple
        />
        <f7-list-item divider>
          <i class="whs-form-icon whs-form-icon-aa"></i>
          {{$t('whs.common.name_label')}}
        </f7-list-item>
        <f7-list-input
          type="text"
          :placeholder="$t('whs.common.required_placeholder')"
        />

        <f7-list-item divider>
          <i class="whs-form-icon whs-form-icon-barcode"></i>
          {{$t('whs.common.sku_barcode_label')}}
        </f7-list-item>
        <f7-list-input
          type="text"
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
          :placeholder="$t('whs.common.price_placeholder')"
        />

        <f7-list-item divider>
          <i class="whs-form-icon whs-form-icon-hash"></i>
          {{$t('whs.common.tags_label')}}
        </f7-list-item>
        <tags-picker />
        <f7-list-item divider>
          <i class="whs-form-icon whs-form-icon-1"></i>
          {{$t('whs.common.minimum_stock_level_label')}}
        </f7-list-item>
        <f7-list-input
          type="text"
          :placeholder="$t('whs.common.minimum_stock_level_placeholder')"
        />

        <f7-list-item divider>
          <i class="whs-form-icon whs-form-icon-location"></i>
          {{$t('whs.common.location_quantity_label')}}
        </f7-list-item>
        <f7-list-item
          link
          :title="$t('whs.common.location_quantity_placeholder')"
        />

        <f7-list-item divider>
          <i class="whs-form-icon whs-form-icon-text"></i>
          {{$t('whs.common.notes_label')}}
        </f7-list-item>
        <f7-list-input
          type="textarea"
          resizable
          :placeholder="$t('whs.common.notes_placeholder')"
        />

        <f7-list-item divider>
          <i class="whs-form-icon whs-form-icon-check"></i>
          {{$t('whs.common.storage_label')}}
        </f7-list-item>
        <f7-list-item
          link
          :title="$t('whs.common.storage_placeholder')"
        />



      </ul>

    </f7-list>


  </f7-page>
</template>
<script>
import API from "../api";
import FormImagesPicker from '../components/form-images-picker.vue';
import TagsPicker from '../components/tags-picker.vue';

export default {
  components: {
    FormImagesPicker,
    TagsPicker,
  },
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
