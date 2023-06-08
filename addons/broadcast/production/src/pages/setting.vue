<template>
  <f7-page id="broadcast__index" name="broadcast__index" class="broadcast-page">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{pageTitle}}</f7-nav-title>
    </f7-navbar>

    <div class="message-title">WHO CAN SEE MINI PROGRAM</div>
    <f7-list class="message-list">
      <f7-list-item >
        <search-cmp @clickOpened="togglePopup(true)"></search-cmp>
      </f7-list-item>
      <f7-list-item >
        <tag-cmp 
          :name="seeUser.name"
          @clearName="clearUser(true)"
        ></tag-cmp>
      </f7-list-item>
    </f7-list>

    <div class="message-title">WHO CAN SEND MESSAGES</div>
    <f7-list class="message-list">
      <f7-list-item >
        <search-cmp @clickOpened="togglePopup(false)"></search-cmp>
      </f7-list-item>
      <f7-list-item >
        <tag-cmp 
          :name="sendUser.name"
          @clearName="clearUser(false)"
        ></tag-cmp>
      </f7-list-item>
    </f7-list>

    <!-- Popup -->
    <group-popup-cmp 
      :opened="customerPopupOpened"
      @closed="customerPopupOpened = false"
      :items="items"
      @checkedGroup="checkedGroup"
      :checkedId="checkedId"
    ></group-popup-cmp>

  </f7-page>
</template>
<script>
  // import API from '../api';
  import GroupPopupCmp from '../components/group-popup.vue';
  import SearchCmp from '../components/search.vue';
  import TagCmp from '../components/tag.vue';

  export default {
    data() {
      return {
        lists: null,
        customerPopupOpened: false,
        items: null,
        seeUser: {
          id: null,
          name: null,
        },
        sendUser: {
          id: null,
          name: null,
        },
        isSee: null,
        checkedId: null,
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
        return self.$t('broadcast.setting.title', 'Setting');
      },
    },
    mounted() {
      this.items = [
        {
          id: 1215,
          name: 'elder',
        },
        {
          id: 155,
          name: 'manager',
        },
      ];
    },
    methods: {
      clearUser(isSee) {
        const user = {
          id: null,
          name: null,
        };
        if (isSee) {
          this.seeUser = user;
        } else {
          this.sendUser = user;
        }
      },
      checkedGroup(id) {
        const item = this.items.filter(i => i.id === id)[0];
        if (this.isSee) {
          this.seeUser = item;
        } else {
          this.sendUser = item;
        }
        this.checkedId = this.isSee ? this.seeUser.id : this.sendUser.id;
      },
      togglePopup(isSee) {
        this.isSee = isSee;
        this.checkedId = isSee ? this.seeUser.id : this.sendUser.id;
        this.customerPopupOpened = true;
      },
    },
  };
</script>