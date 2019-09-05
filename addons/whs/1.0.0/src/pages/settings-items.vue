<template>
  <f7-page>
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('whs.settings_items.title')}}</f7-nav-title>
    </f7-navbar>

    <f7-list class="no-margin no-hairlines whs-settings-list">
      <f7-list-input
        type="text"
        :label="$t('whs.general.name_label')"
        inline-label
        value="Items"
      />
    </f7-list>

  </f7-page>
</template>
<script>
import API from "../api";

export default {
  components: {
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
