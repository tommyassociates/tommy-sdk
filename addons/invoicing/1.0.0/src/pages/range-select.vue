<template>
  <f7-page class="invoicing__page" name="invoicing__range-select" id="invoicing__range-select">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{pageTitle}}</f7-nav-title>
      <f7-nav-right>
        <f7-link v-if="showSave" @click="save" icon-f7="check"></f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-list class="list-custom">
      <f7-list-item :title="$t('invoicing.common.choose_range', 'Choose Range')">
        <f7-toggle slot="after" :checked="isCustomRange" @change="toggleCustomRange($event.target.checked)"></f7-toggle>
      </f7-list-item>
      <f7-list-input
        v-if="isCustomRange"
        :label="$t('invoicing.common.amount_min', 'From')"
        type="number"
        :value="amount_min"
        @input="setMin($event.target.value)"
      ></f7-list-input>
      <f7-list-input
        v-if="isCustomRange"
        :label="$t('invoicing.common.amount_max', 'To')"
        type="number"
        :value="amount_max"
        @input="setMax($event.target.value)"
      ></f7-list-input>
    </f7-list>
  </f7-page>
</template>
<script>
  export default {
    props: {
      from: Number,
      to: Number,
      pageTitle: String,
      onSave: Function,
    },
    data() {
      const self = this;
      const amount_min = self.from;
      const amount_max = self.to;
      return {
        showSave: false,
        amount_min,
        amount_max,
        isCustomRange: (typeof amount_min !== 'undefined' || typeof amount_max !== 'undefined'),
      };
    },
    methods: {
      save() {
        const self = this;
        if (self.saving) return;
        self.saving = true;
        self.showSave = false;
        // const newList = Object.assign({}, self.list);
        const { amount_min, amount_max } = self;
        let from;
        let to;

        if (self.isCustomRange) {
          from = amount_min;
          to = amount_max;
          if (!from) {
            from = undefined;
          }
          if (!to) {
            to = undefined;
          }
          if (amount_min && amount_max && (amount_max < amount_min)) {
            to = amount_min;
          }
        } else {
          from = undefined;
          to = undefined;
        }

        self.onSave({
          from,
          to,
        });
      },
      setMin(value) {
        const self = this;
        self.amount_min = value;
        self.showSave = true;
      },
      setMax(value) {
        const self = this;
        self.amount_max = value;
        self.showSave = true;
      },
      toggleCustomRange(isCustom) {
        const self = this;
        self.showSave = true;
        if (!isCustom) {
          self.isCustomRange = false;
          self.amount_min = undefined;
          self.amount_max = undefined;
        } else {
          self.isCustomRange = true;
          self.amount_min = self.from;
          self.amount_max = self.to;
        }
      },
    },
  };
</script>

