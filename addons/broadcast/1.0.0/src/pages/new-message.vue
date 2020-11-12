<template>
  <f7-page id="broadcast__index" name="broadcast__index" class="broadcast-page">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{pageTitle}}</f7-nav-title>
    </f7-navbar>

    <div class="message-title">{{$t('broadcast.message.title', 'WHO TO MESSAGE')}}</div>
    
    <f7-list class="message-list">
      <f7-list-item >
        <search-cmp @clickOpened="customerPopupOpened = true"></search-cmp>
      </f7-list-item>
      <f7-list-item >
        <tag-cmp 
          :name="group.name"
          @clearName="clearGroup"
        ></tag-cmp>
      </f7-list-item>

      <!-- <search-tag-cmp></search-tag-cmp> -->
      <f7-list-item title="Total Recipients">{{group.count}}</f7-list-item>
    </f7-list>

    <div class="message-title">{{$t('broadcast.message.title', 'MESSAGE')}}</div>
    <f7-input
      type="textarea"
      placeholder="Type message here"
      class="message-textarea"
      :value="message"
      @change="message = $event.target.value"
    >
    </f7-input>
    
    <button class="message-button" @click="sendMessage">SEND {{group.count}} MESSAGES</button>

    <!-- Customer Popup -->
    <group-popup-cmp 
      :opened="customerPopupOpened"
      @closed="customerPopupOpened = false"
      :items="items"
      @checkedGroup="checkedGroup"
      :checkedId="group.id"
    ></group-popup-cmp>

  </f7-page>
</template>
<script>
  import API from '../api';
  import GroupPopupCmp from '../components/group-popup.vue';
  import SearchCmp from '../components/search.vue';
  import TagCmp from '../components/tag.vue';

  export default {
    data() {
      return {
        lists: null,
        message: '',
        customerPopupOpened: false,
        items: null,
        group: {
          id: null,
          name: null,
          count: 0,
        },
      };
    },
    components: {
      GroupPopupCmp,
      SearchCmp,
      TagCmp,
    },
    computed: {
      pageTitle() {
        const self = this;
        return self.$t('broadcast.message.title', 'New Message');
      },
    },
    mounted() {
      this.items = [
        {
          id: 342,
          name: 'aaa',
          count: 53,
        },
        {
          id: 42340,
          name: 'abbba',
          count: 66,
        },
      ];
    },
    methods: {
      clearGroup() {
        this.group = {
          id: null,
          name: null,
          count: 0,
        };
      },
      checkedGroup(id) {
        this.group = this.items.filter(i => i.id === id)[0];
      },
      sendMessage() {
        const self = this;
        if (self.message && self.message.length > 0) {
          API.sendMessage(self.message);
        } else {
          self.$f7.dialog.alert(self.$t('broadcast.message.no_message', 'Message content cannot be empty'));
        }
      },
    },
  };
</script>