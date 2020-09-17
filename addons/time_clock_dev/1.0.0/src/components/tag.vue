<template>
  <div class="message-list-tag">
    <div class="tag">
      <span class="tag1">#</span>
      <span>Role</span>
    </div>
    <div class="title">
      <p class="name">{{name ? name : 'No one is chosen'}}</p>
      <p @click="$emit('clearName')" v-if="name">
        <img :src="`${$addonAssetsUrl}icon-x.svg`"/>
      </p>
    </div>
  </div>
</template>
<script>
  export default {
    props: {
      name: String,
    },
    data() {
      return {

      };
    },
    watch: {

    },
    mounted() {

    },
    methods: {

    },
  };
</script>
