<template>
  <div class="circle">
    <div class="circle__content">
      <span class="circle__text">{{ hours }}h</span>
      <span class="circle__text circle__text--small">{{ minutes }}m</span>
    </div>
  </div>
</template>

<script>
  export default {
    name: "HoursMinutesBadge",
    props: {
      hours: {
        type: String,
        default: 0
      },
      minutes: {
        type: String,
        default: 0
      },
    },
    data() {
      const self = this;
      return {};
    },
    mounted() {
      const self = this;
    },
  };
</script>
