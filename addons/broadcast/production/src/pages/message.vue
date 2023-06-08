<template>
  <f7-page id="broadcast__index" name="broadcast__index" class="broadcast-page">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{pageTitle}}</f7-nav-title>
    </f7-navbar>

    <f7-list>
      <f7-list-item title="Sent" >2019-08-09 12:00:02</f7-list-item>
      <f7-list-item title="Total Recipients">300</f7-list-item>
    </f7-list>

    <div class="message-title">FILTERS</div>
    <div class="message-filters">
      <tag-cmp 
        name="name"
      ></tag-cmp>
    </div>

    <div class="message-title">MESSAGE</div>
    <f7-input
      type="textarea"
      placeholder="Type message here"
      class="message-textarea"
    >
    </f7-input>

  </f7-page>
</template>
<script>
  import TagCmp from '../components/tag.vue';

  export default {
    data() {
      return {
        lists: null,
      };
    },
    components: {
      TagCmp,
    },
    computed: {
      pageTitle() {
        const self = this;
        return self.$t('broadcast.message.title', 'Message');
      },
    },
    mounted() {

    },
    methods: {

    },
  };
</script>