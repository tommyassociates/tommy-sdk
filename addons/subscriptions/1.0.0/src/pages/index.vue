<template>
  <f7-page id="example__index">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{$t('subscriptions.index.title')}}</f7-nav-title>
      <f7-nav-right></f7-nav-right>
    </f7-navbar>

    <f7-page-content>
      <template v-if="loaded">
        <f7-row align="top">
          <f7-col width="100" tablet-width="50">
            <f7-block strong inset>
              <f7-block-header>{{$t('subscriptions.index.monthly_estimate.title')}}</f7-block-header>
              <p>{{$t('subscriptions.index.monthly_estimate.description')}}</p>
              <p class="text-color-red text-large">{{totalAmount}}</p>
            </f7-block>

            <f7-block strong inset>
              <f7-block-header>{{$t('subscriptions.index.billing.title')}}</f7-block-header>
              <billing-details-form :billingInfo="billingInfo" @update="onBillingInfoUpdate"></billing-details-form>
            </f7-block>
          </f7-col>

          <f7-col width="100" tablet-width="50">
            <f7-block strong inset>
              <f7-block-header>{{$t('subscriptions.index.payment_method.title')}}</f7-block-header>

              <div class="alert alert-danger" v-if="!initialHasCreditCard && $root.team">
                {{ $t('subscriptions.index.billing.missing_payment_details', {teamName: $root.team.name}) }}
                <credit-card-form :billingInfo="billingInfo"></credit-card-form>
              </div>

              <template v-if="initialHasCreditCard">
                <f7-row class="row--mb">
                  <f7-col class="col--credit-card-icon">
                    <img :src="`${addonAssetsUrl()}/images/account/${billingInfo.card_brand}.png`"
                         :alt="billingInfo.card_brand">
                  </f7-col>
                  <f7-col class="col--credit-card-details">
                    <template v-if="!isEditingPaymentInfo">
                      <p>{{billingInfo.card_brand}} ending in {{billingInfo.card_last4}}<br>
                        {{billingInfo.card_exipiry_month}}/{{billingInfo.card_exipiry_year}}<br>
                        {{billingInfo.first_name}} {{billingInfo.last_name}}</p>
                      <f7-row>
                        <f7-col width="50">
                          <a href="#" class="tommy-button tommy-button--primary"
                             @click.prevent="editCreditCardDetailsClick">{{$t('subscriptions.index.payment_method.edit_button')}}</a>
                        </f7-col>
                        <f7-col width="50">
                          <a href="#" class="tommy-button tommy-button--secondary">{{$t('subscriptions.index.payment_method.details_button')}}</a>
                        </f7-col>
                      </f7-row>
                    </template>
                    <template v-if="isEditingPaymentInfo">
                      <credit-card-form :billingInfo="billingInfo" @update="onCreditCardUpdate"></credit-card-form>
                    </template>
                  </f7-col>

                </f7-row>
              </template>
            </f7-block>

            <f7-block strong inset>
              <f7-block-header>{{$t('subscriptions.index.subscription_plan.title')}}</f7-block-header>
              <p>{{$t('subscriptions.index.monthly_estimate.description')}}</p>
            </f7-block>
          </f7-col>
        </f7-row>
      </template>
    </f7-page-content>
  </f7-page>
</template>
<script>
  import API from "../api";
  import addonAssetsUrl from '../utils/addon-assets-url';
  import billingDetailsForm from '../components/billing-details-form';
  import creditCardForm from '../components/credit-card-form';


  export default {
    data() {
      const self = this;

      const name = self.$root.account.contact_name
        .trim()
        .replace(/\s\s+/g, ' ');

      const namesArray = name.split(' ');
      const firstName = namesArray[0];
      let lastName = '';

      if (namesArray.length > 1) {
        const [, ...surnameArray] = namesArray;
        lastName = surnameArray.join(' ');
      }

      return {
        loaded: false,
        billingInfo: {
          first_name: firstName,
          last_name: lastName,
        },
        subscriptions: [],
        isEditingPaymentInfo: false,
        initialHasCreditCard: false,
      };
    },
    components: {
      billingDetailsForm,
      creditCardForm,
    },
    computed: {
      totalAmount() {
        const self = this;
        const amount = self.subscriptions.reduce((total, subscription) => Math.trunc(total) + Math.trunc(subscription.amount_cents), 0);
        return amount;
      },
    },
    methods: {
      addonAssetsUrl,
      updateAll() {
        const self = this;
        const demoData = false;
        API.getBillingInfo({demoData}).then(billingInfo => {
          const newBillingInfo = {...self.billingInfo, ...billingInfo};
          self.billingInfo = newBillingInfo;
          API.getSubscriptions({demoData}).then(subscriptions => {
            self.subscriptions = subscriptions;
            self.loaded = true;
          });
        });
      },

      onBillingInfoUpdate(billingInfo) {
        const self = this;
        self.billingInfo = billingInfo;
      },

      onCreditCardUpdate(billingInfo) {
        const self = this;
        self.billingInfo = billingInfo;
      },


      editCreditCardDetailsClick() {
        const self = this;
        self.isEditingPaymentInfo = !self.isEditingPaymentInfo;
      },


    },
    mounted() {
      const self = this;
      self.updateAll();
    },
  };
</script>
