<template>
  <f7-nav-left>
    <a :href="href" :data-force="force" class="link back icon-only"><i class="material-icons md-36">keyboard_arrow_left</i></a>
  </f7-nav-left>
</template>
<script>
  export default {
    props: {
      href: {
        type: String,
        default: '#',
      },
      force: Boolean,
    },
  };
</script>