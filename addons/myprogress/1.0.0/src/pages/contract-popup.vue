<template>
  <f7-popup :opened="opened" @popup:closed="onClosed">
    <f7-view :init="false">
      <f7-page class="myprogress-upload myprogress-contract-page">
        <f7-navbar>
          <f7-nav-title>{{$t('myprogress.upload.contract_page_title')}}</f7-nav-title>
          <f7-nav-right>
            <f7-link popup-close icon-f7="close"></f7-link>
          </f7-nav-right>
        </f7-navbar>
        <div class="myprogress-upload-button"
          slot="fixed"
          @click="sign()"
        >{{$t('myprogress.upload.contract_page_button')}}</div>

        <div class="myprogress-contract-title">{{$t('myprogress.upload.contract_title')}}</div>
        <div class="myprogress-contract-text" v-html="$t('myprogress.upload.contract_text')"></div>

      </f7-page>
    </f7-view>
  </f7-popup>
</template>
<script>
  export default {
    data() {
      return {
        opened: false,
      };
    },
    mounted() {
      this.$nextTick(() => {
        this.opened = true;
      });
    },
    methods: {
      sign() {
        const self = this;
        self.$emit('submit');
        self.$f7.popup.close();
      },
      onClosed() {
        this.$emit('closed');
      },
    },
  }
</script>