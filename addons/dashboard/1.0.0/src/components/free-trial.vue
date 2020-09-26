<template>
  <div class="free-trial" @click.prevent="$f7router.navigate('/subscriptions/')">
    <h2>{{$t('dashboard.index.subscription.free_trial.title')}} <span
      style="position:relative; transform: translateY(2px); display:inline-block;"><smileIcon></smileIcon></span>
    </h2>
    <p>{{$t('dashboard.index.subscription.free_trial.description', {trialExpiry: formatDate(billingInfo.trial_exipre_at, 'MMMM Do')})}}</p>
  </div>
</template>

<script>
import smileIcon from './icons/smile-icon.vue';
import formatDate from 'tommy-core/src/utils/format-date';

export default {
  name: "free-trial",
  props: ['billingInfo'],
  components: {
    smileIcon,
  },
  methods: {
    formatDate
  }
}
</script>
