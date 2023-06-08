<template>
  <div class="message-list-search">
    <p class="icon">
      <img :src="`${$addonAssetsUrl}icon-search.svg`"/>
    </p>
    <p @click="$emit('clickOpened')">Search Team, Contacts, Tags, Roles</p>
  </div>
</template>
<script>
  export default {
    props: {
      name: String,
    },
    data() {
      return {
        customerPopupOpened: null,
      };
    },
    components: {

    },
    watch: {

    },
    mounted() {

    },
    methods: {

    },
  };
</script>