<template>
  <div class="tommy-plus">
    <f7-row>
      <f7-col>
        <img src="https://via.placeholder.com/100" :alt="$t('dashboard.index.subscription.tommy_plus.title')">
      </f7-col>
      <f7-col>
        <h2>{{$t('dashboard.index.subscription.tommy_plus.title')}}</h2>
        <p><a href="#">{{$t('dashboard.index.subscription.tommy_plus.view_details')}}</a></p>
      </f7-col>
    </f7-row>
  </div>
</template>

<script>
  export default {
    name: "tommy-plus"
  }
</script>

<style scoped>

</style>
