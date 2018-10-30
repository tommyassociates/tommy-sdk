<template>
  <f7-page class="wallet_accounts__page" name="wallet_accounts__amount-select" id="wallet_accounts__amount-select">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('wallet_accounts.list-edit.filter-amount', 'Transaction Amount')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link v-if="showSave" @click="save" icon-f7="check"></f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-list class="list-custom">
      <f7-list-item :title="$t('wallet_accounts.common.choose_range', 'Choose Range')">
        <f7-toggle slot="after" :checked="isCustomRange" @change="toggleCustomRange($event.target.checked)"></f7-toggle>
      </f7-list-item>
      <f7-list-input
        v-if="isCustomRange"
        :label="$t('wallet_accounts.common.amount_min', 'From')"
        type="number"
        :value="amount_min"
        @input="setMin($event.target.value)"
      ></f7-list-input>
      <f7-list-input
        v-if="isCustomRange"
        :label="$t('wallet_accounts.common.amount_max', 'To')"
        type="number"
        :value="amount_max"
        @input="setMax($event.target.value)"
      ></f7-list-input>
    </f7-list>
  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    props: {
      list: Object,
    },
    data() {
      const self = this;
      const { list } = self;
      const { amount_min, amount_max } = list.data;
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
        const newList = Object.assign({}, self.list);
        const { amount_min, amount_max } = self;

        if (self.isCustomRange) {
          newList.data.amount_min = amount_min;
          newList.data.amount_max = amount_max;
          if (!newList.data.amount_min) {
            delete newList.data.amount_min;
          }
          if (!newList.data.amount_max) {
            delete newList.data.amount_max;
          }
          if (newList.data.amount_min && newList.data.amount_max && (newList.data.amount_max < newList.data.amount_min)) {
            newList.data.amount_max = newList.data.amount_min;
          }
        } else {
          delete newList.data.amount_min;
          delete newList.data.amount_max;
        }

        API.saveList(newList).then(() => {
          self.$events.$emit('wallet_accounts:setListAmount', self.list.id, newList.data.amount_min, newList.data.amount_max);
          self.$f7router.back();
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
          self.amount_min = self.list.data.amount_min;
          self.amount_max = self.list.data.amount_max;
        }
      },
    },
  };
</script>

