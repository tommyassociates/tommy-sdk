<template>
  <tommy-nav-back v-if="showBackButton || isActorParam" :native="true" :href="href"></tommy-nav-back>
  <f7-nav-left v-else>
    <f7-link panel-open="left" icon-material="menu" icon-only></f7-link>
  </f7-nav-left>
</template>
<script>
export default {
  props: {
    f7route: Object,
    showBackButton: {
      type: Boolean,
      default: false
    },
    href: {
      type: String,
      default: '#',
    },
  },
  computed: {
    isActorParam() {
      return this.f7route?.query?.actor_id;
    },
  },
};
</script>
