<template>
  <div class="whs-pagination">
    <div class="whs-pagination-rows">{{rows}} {{$t('whs.pagination.rows')}}</div>
    <div class="whs-pagination-nav">
      <a class="link" @click="leftClick">
        <i class="f7-icons">chevron_left</i>
      </a>
      <span>{{$t('whs.pagination.page', { current: current, total: total })}}</span>
      <a class="link" @click="rightClick">
        <i class="f7-icons">chevron_right</i>
      </a>
    </div>
    <div class="whs-pagination-actions">
      <a class="link">
        <i class="icon f7-icons">share</i>
      </a>
      <a class="link">
        <i class="icon f7-icons">gear</i>
      </a>
    </div>
  </div>
</template>

<script>
export default {
  props: {
    link: String,
    parent: String
  },
  data() {
    return {
      current: 1,
      total: 9,
      rows: 999
    };
  },
  methods: {
    leftClick() {
      self = this;
      if (self.current > 1) {
        self.current-= 1;
        self.$events.$emit(
          "pagination:" + self.parent + ":" + self.link + ":change",
          self.current
        );
      }
    },
    rightClick() {
      self = this;
      if (self.current < self.total) {
        self.current+=1;
        self.$events.$emit(
          "pagination:" + self.parent + ":" + self.link + ":change",
          self.current
        );
      }
    },
    setPaginations(target) {
      self = this;
      self.total = target.total;
      self.rows = target.rows;
    }
  },
  created() {
    const self = this;
    self.$events.$on(
      'pagination:' + self.parent + ':' + self.link + ':set',
      self.setPaginations
    );
  },
  beforeDestroy() {
    const self = this;
    self.$events.$off(
      'pagination:' + self.parent + ':' + self.link + ':set',
      self.setPaginations
    );
  },
  mounted() {
    self = this;
  }
};
</script>