<template>
  <f7-page id="broadcast__index" name="broadcast__index" class="broadcast-page">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{pageTitle}}</f7-nav-title>
      <f7-nav-right>
        <f7-link href="/broadcast/new-message/" icon-f7="add"></f7-link>
        <f7-link href="/broadcast/setting/" icon-f7="gear"></f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-block strong class="subtitle">
      <p>{{$t('broadcast.index.subtitle', 'Send individual messages to many team members at once.')}}</p>
    </f7-block>

    <f7-block-title v-if="lists && lists.length > 0" class="list-title">{{$t('broadcast.index.list_message', 'Message')}}</f7-block-title>
    <f7-list v-if="lists && lists.length > 0" class="list">
      <f7-list-item link="/broadcast/message/" v-for="item in lists" :key="item.id" class="list-item">
        <div class="item">
          <p class="item-message">{{item.message}}</p>
          <p class="item-time">{{$t('broadcast.index.send', 'SEND')}}: {{item.time}}</p>
        </div>
      </f7-list-item>
    </f7-list>

    <f7-block v-else class="noListTxt">
      <p>{{$t('broadcast.index.noListTxt', 'No existing Messages. Click + to send your first message.')}}</p>
    </f7-block>
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
        return self.$t('broadcast.index.title', 'Broadcast');
      },
    },
    mounted() {
      this.getBroadcastLists();
    },
    methods: {
      getBroadcastLists() {
        this.lists = [
          {
            message: 'This is the first part of This is the first part ofThis is the first part ofThis is the first part ofThis is the first part ofThis is the first part of',
            time: '2019-08-09 11:00',
            id: 0,
          },
          {
            message: 'This is the first part of',
            time: '2019-08-09 11:00',
            id: 1,
          },
        ];
      },
    },
  };
</script>

