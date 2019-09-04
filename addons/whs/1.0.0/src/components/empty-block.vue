<template>
  <div class="whs-empty-block">
    <i class="icon whs-icon-empty"></i>
    <span>{{text}}</span>
  </div>
</template>
<script>
  export default {
    props: {
      text: String,
    },
  };
</script>
