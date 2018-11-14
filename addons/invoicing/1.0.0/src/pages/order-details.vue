<template>

  <f7-page name="invoicing__order-details" id="invoicing__order-details" class="invoicing-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('invoicing.order_details.title', 'Order')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link v-if="showSave" @click="save" icon-f7="check"></f7-link>
      </f7-nav-right>
    </f7-navbar>
    <template v-if="order">
      <f7-list class="list-custom">
        <f7-list-item
          v-if="order.created_at"
          :title="$t('invoicing.order_details.created')"
          :after="formatDate(order.created_at)"
        ></f7-list-item>

        <f7-list-item
          :title="$t('invoicing.order_details.due')"
        >
          <input style="text-align: right; height: auto; line-height: 1" slot="after" type="datetime-local" :value="formatValueDate(order.data ? order.data.date : null)" @change="onDateChange">
        </f7-list-item>

        <f7-list-item
          v-if="order.data && order.data.location"
          :title="$t('invoicing.order_details.location')"
          :after="`${order.data.location.address} ${order.data.location.city}`"
        ></f7-list-item>

        <f7-list-item
          :title="$t('invoicing.order_details.status')"
          smart-select
          :smart-select-params="{openIn: 'popover', closeOnSelect: true}"
        >
          <select @change="onStatusChange">
            <option
              v-for="(status, index) in orderStatuses"
              :key="index"
              :value="status"
              :selected="order.status === status"
            >{{$t(`invoicing.order_status.${status}`)}}</option>
          </select>
        </f7-list-item>
        <f7-list-item
          :title="$t('invoicing.order_details.type')"
          smart-select
          :smart-select-params="{openIn: 'popover', closeOnSelect: true}"
        >
          <select @change="onTypeChange">
            <option :selected="!order.quote" value="invoice">{{$t('invoicing.list_edit.type_invoice')}}</option>
            <option :selected="order.quote" value="quote">{{$t('invoicing.list_edit.type_quote')}}</option>
          </select>
        </f7-list-item>

        <f7-list-item
          v-if="order.discount"
          :title="$t('invoicing.order_details.discount')"
          :after="order.discount"
          class="invoicing-money-amount-item"
        ></f7-list-item>
        <f7-list-item
          :title="$t('invoicing.order_details.total')"
          :after="order.total"
          class="invoicing-money-amount-item"
        ></f7-list-item>

        <f7-list-item divider :title="$t('invoicing.order_details.customer')"></f7-list-item>
        <f7-list-item
          :title="orderUserName(order.user_id)"
        >
          <tommy-circle-avatar :url="orderUserAvatar(order.user_id)" slot="media"></tommy-circle-avatar>
        </f7-list-item>
      </f7-list>
    </template>
  </f7-page>
</template>
<script>
  import API from '../api';
  import orderStatuses from '../utils/order-statuses';

  export default {
    props: {
      id: [Number, String],
    },
    data() {
      return {
        order: null,
        showSave: false,
        orderStatuses,
      };
    },
    mounted() {
      const self = this;
      API.loadOrder(self.id).then((order) => {
        self.order = order;
      });
    },
    methods: {
      orderUserName(user_id) {
        const self = this;
        const user = self.$root.teamMembers.filter(m => m.user_id === parseInt(user_id, 10))[0];
        return `${user.first_name} ${user.last_name}`;
      },
      orderUserAvatar(user_id) {
        const self = this;
        const user = self.$root.teamMembers.filter(m => m.user_id === parseInt(user_id, 10))[0];
        return user.icon_url;
      },
      formatValueDate(date) {
        const self = this;
        if (!date) return '';
        return self.$moment(new Date(parseInt(date, 10))).format('YYYY-MM-DDTHH:mm');
      },
      formatDate(date) {
        const self = this;
        return self.$moment(new Date(date)).format('HH:mm D MMM YYYY');
      },
      onDateChange(e) {
        const self = this;
        const value = e.target.value;
        clearTimeout(self.dateChangeTimeout);
        self.order.data.date = new Date(value).getTime();
        self.dateChangeTimeout = setTimeout(() => {
          self.saveOrder({ data: self.order.data });
        }, 600);
      },
      onStatusChange(e) {
        const self = this;
        self.order.status = e.target.value;
        self.saveOrder({ status: self.order.status });
      },
      onTypeChange(e) {
        const self = this;
        if (e.target.value === 'quote') self.order.quote = true;
        else self.order.quote = false;
        self.saveOrder({ quote: self.order.quote });
      },
      saveOrder(data) {
        const self = this;
        self.$events.$emit('invoicing:reloadListsOrders');
        return API.saveOrder({ ...data, id: self.order.id });
      },
      save() {},
    },
  };
</script>