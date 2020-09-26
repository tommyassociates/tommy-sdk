<template>
  <div class="subscription">
    <f7-row>
      <f7-col>
        <img src="https://via.placeholder.com/100" :alt="$t('dashboard.index.subscription.tommy_plus.title')">
      </f7-col>
      <f7-col>
        <h2>{{$t('dashboard.index.subscription.tommy_plus.title')}}</h2>
        <p><f7-link href="/subscriptions/">{{$t('dashboard.index.subscription.tommy_plus.view_details')}}</f7-link></p>
      </f7-col>
    </f7-row>
  </div>
</template>

<script>
  export default {
    name: "subscription"
  }
</script>

<style scoped>

</style>
