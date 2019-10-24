<template>
  <f7-page>
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('whs.location_add.title')}}</f7-nav-title>
      <f7-nav-right class="whs-navbar-links">
        <f7-link icon-only>
          <f7-icon f7="check" />
        </f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-list class="whs-form">
      <ul>
        <form-images-picker
          :lineWithActions="false"
          multiple
        />
        <!-- Name -->
        <f7-list-item divider>
          <i class="whs-form-icon whs-form-icon-aa"></i>
          {{$t('whs.common.name_label')}}
        </f7-list-item>
        <f7-list-input
          type="text"
          :placeholder="$t('whs.common.required_placeholder')"
        />

        <!-- Barcode -->
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

        <!-- Parent Location -->
        <f7-list-item divider>
          <i class="whs-form-icon whs-form-icon-location"></i>
          {{$t('whs.common.parent_location_label')}}
        </f7-list-item>
        <f7-list-item
          link
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
          :placeholder="$t('whs.common.description_placeholder')"
        />

        <!-- Capacity -->
        <f7-list-item divider>
          <i class="whs-form-icon whs-form-icon-1"></i>
          {{$t('whs.common.pallet_capacity_label')}}
        </f7-list-item>
        <f7-list-item
          title="1"
        >
          <f7-stepper
            :input="false"
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
          <f7-toggle slot="after" />
        </f7-list-item>

        <!-- Category -->
        <f7-list-item divider>
          <i class="whs-form-icon whs-form-icon-check"></i>
          {{$t('whs.common.location_category_label')}}
        </f7-list-item>
        <f7-list-item
          link
          :title="$t('whs.common.location_category_placeholder')"
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
