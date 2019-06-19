<template>
  <f7-page class="education-page education-splash-page" @page:beforein="onBeforeIn" @page:beforeout="onBeforeOut">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{$t('education.splash.title')}}</f7-nav-title>
    </f7-navbar>
    <a href="/education-index/" class="education-toolbar-button" slot="fixed">{{$t('education.splash.continue_button')}}</a>
    <div class="education-splash-text">{{$t('education.splash.text')}}</div>
  </f7-page>
</template>
<script>
  export default {
    methods: {
      onBeforeIn(e, page) {
        page.$navbarEl.closest('.navbar').addClass('education-splash-navbar')
      },
      onBeforeOut(e, page) {
        page.$navbarEl.closest('.navbar').removeClass('education-splash-navbar')
      },
    },
  };
</script>

