<template>
  <f7-page class="education-page education-certificate-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
    </f7-navbar>

    <div class="education-certificate-title">{{$t('education.certificate.title')}}</div>
    <div class="education-certificate-text">{{$t('education.certificate.text', { course })}}</div>
    <div class="education-certificate-icon"></div>

  </f7-page>
</template>
<script>
  export default {
    props: {
      course: Object,
    },
  };
</script>

