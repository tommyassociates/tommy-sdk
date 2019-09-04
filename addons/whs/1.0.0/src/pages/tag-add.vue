<template>
  <f7-page>
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('whs.tag_add.title')}}</f7-nav-title>
      <f7-nav-right class="whs-navbar-links">
        <f7-link icon-only>
          <f7-icon f7="check" />
        </f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-list class="whs-form">
      <ul>
        <f7-list-item divider>
          <i class="whs-form-icon whs-form-icon-aa"></i>
          {{$t('whs.common.name_label')}}
        </f7-list-item>
        <f7-list-input
          type="text"
          :placeholder="$t('whs.common.required_placeholder')"
        />
        <f7-list-item divider>
          <i class="whs-form-icon whs-form-icon-image"></i>
          {{$t('whs.common.icon_label')}}
        </f7-list-item>
        <form-images-picker/>
      </ul>

    </f7-list>


  </f7-page>
</template>
<script>
import API from "../api";
import FormImagesPicker from '../components/form-images-picker.vue';

export default {
  components: {
    FormImagesPicker,
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
