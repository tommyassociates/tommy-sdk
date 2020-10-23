<template>
  <f7-page class="education__page education__certificate-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
    </f7-navbar>

    <div class="education__certificate-title">{{$t('education.certificate.title')}}</div>
    <div class="education__certificate-text">{{$t('education.certificate.text', { course })}}</div>
    <div class="education__certificate-icon"></div>

  </f7-page>
</template>
<script>
  export default {
    props: {
      course: Object,
    },
  };
</script>

