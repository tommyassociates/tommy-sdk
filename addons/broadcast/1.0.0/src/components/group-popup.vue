<template>
  <f7-popup :opened="popupOpened" @popup:closed="popupOpened = false">
    <f7-view :init="true">
      <f7-page>
        <f7-navbar>
          <f7-nav-title>{{$t('broadcast_message_tag', 'group')}}</f7-nav-title>
          <f7-nav-right>
            <f7-link popup-close icon-f7="close"></f7-link>
          </f7-nav-right>
        </f7-navbar>
        <!-- <f7-searchbar search-container=".broadcast-message-customers-list"></f7-searchbar> -->
        <f7-list
          class="broadcast-message-customers-list"
        >
          <f7-list-item 
            v-for="item in items" 
            :key="item.id" 
            :title="item.name"
            radio
            :checked="item.id === checkedId"
            @click="$emit('checkedGroup', item.id)"
          >
            <tommy-circle-avatar slot="media"></tommy-circle-avatar>
          </f7-list-item>
        </f7-list>
      </f7-page>
    </f7-view>
  </f7-popup>
</template>
<script>
  export default {
    props: {
      opened: Boolean,
      items: {
        type: [Array, Object],
        default: null,
      },
      checkedId: Number,
    },
    data() {
      return {
        popupOpened: null,
      };
    },
    watch: {
      popupOpened() {
        if (!this.popupOpened) {
          this.$emit('closed', this.popupOpened);
        }
      },
      opened() {
        this.popupOpened = this.opened;
      },
    },
    mounted() {

    },
    methods: {
    },
  };
</script>