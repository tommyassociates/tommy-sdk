<template>
  <div class="free-trial" @click="freeTrialClick">
    <h2>{{$t('dashboard.index.subscription.free_trial.title')}} <span
      style="position:relative; transform: translateY(2px); display:inline-block;"><smileIcon></smileIcon></span>
    </h2>
    <p>{{$t('dashboard.index.subscription.free_trial.description')}}</p>
  </div>
</template>

<script>
  import smileIcon from './icons/smile-icon.vue';

  export default {
    name: "free-trial",
    components: {
      smileIcon,
    },
    methods: {
      freeTrialClick() {
        const self = this;
        self.$f7router.navigate('/subscriptions/')
      }
    }
  }
</script>

<style scoped>

</style>
