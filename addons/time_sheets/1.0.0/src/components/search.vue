<template>
  <div class="message-list-search">
    <p class="icon">
      <f7-icon f7="search"/>
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
