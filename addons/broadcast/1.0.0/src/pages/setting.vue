<template>
  <f7-page id="broadcast__index" name="broadcast__index" class="broadcast-page">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{pageTitle}}</f7-nav-title>
    </f7-navbar>

    <div class="message-title">WHO CAN SEE MINI PROGRAM</div>
    <f7-list class="message-list">
      <f7-list-item >
        <div class="message-list-search">
          <span>icon search</span>
          <p>Search Team Members</p>
        </div>
      </f7-list-item>
      <f7-list-item >
        <div class="message-list-tag">
          <div class="tag">
            <span class="tag1">#</span>
            <span>Role</span>
          </div>
          <div class="title">
            <p class="name">Manager</p>
            <p>icon x</p>
          </div>
        </div>
      </f7-list-item>
    </f7-list>

    <div class="message-title">WHO CAN SEND MESSAGES</div>
    <f7-list class="message-list">
      <f7-list-item >
        <div class="message-list-search">
          <span>icon search</span>
          <p>Search Team Members</p>
        </div>
      </f7-list-item>
      <f7-list-item >
        <div class="message-list-tag">
          <div class="tag">
            <span class="tag1">#</span>
            <span>Role</span>
          </div>
          <div class="title">
            <p class="name">Manager</p>
            <p>icon x</p>
          </div>
        </div>
      </f7-list-item>
    </f7-list>

  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    data() {
      return {
        lists: null,
      };
    },
    computed: {
      pageTitle() {
        const self = this;
        return self.$t('broadcast.setting.title', 'Setting');
      },
    },
    mounted() {

    },
    methods: {

    },
  };
</script>