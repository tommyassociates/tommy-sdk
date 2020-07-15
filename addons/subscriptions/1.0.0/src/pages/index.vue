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

              <form action="">
                <f7-row class="row--valign-center row--mb">
                  <f7-col width="35">
                    <label for="billing_first_name">{{$t('subscriptions.index.billing.first_name')}}</label>
                  </f7-col>
                  <f7-col width="65">
                    <f7-input type="text" name="first_name" input-id="billing_first_name"
                              :value="billingInfo.first_name"
                              @input="billingInfo.first_name = $event.target.value;" class="input--outlined"></f7-input>

                  </f7-col>
                </f7-row>

                <f7-row class="row--valign-center row--mb">
                  <f7-col width="35">
                    <label for="billing_last_name">{{$t('subscriptions.index.billing.last_name')}}</label>
                  </f7-col>
                  <f7-col width="65">
                    <f7-input type="text" name="last_name" input-id="billing_last_name"
                              :value="billingInfo.last_name"
                              @input="billingInfo.last_name = $event.target.value;" class="input--outlined"></f7-input>

                  </f7-col>
                </f7-row>

                <f7-row class="row--valign-center row--mb">
                  <f7-col width="35">
                    <label for="billing_company">{{$t('subscriptions.index.billing.company')}}</label>
                  </f7-col>
                  <f7-col width="65">
                    <f7-input type="text" name="company" input-id="billing_company"
                              :value="billingInfo.company"
                              @input="billingInfo.company = $event.target.value;" class="input--outlined"></f7-input>

                  </f7-col>
                </f7-row>

                <f7-row class="row--valign-center row--mb">
                  <f7-col width="35">
                    <label for="billing_country">{{$t('subscriptions.index.billing.country')}}</label>
                  </f7-col>
                  <f7-col width="65">
                    <f7-input type="select" name="country" input-id="billing_country" class="input--outlined">
                      <option value="">Select</option>
                      <option v-for="(city_obj, city) in countries" :value="city_obj.Code"
                              :selected="city_obj.Code === billingInfo.country">{{city_obj.Name}}
                      </option>
                    </f7-input>

                  </f7-col>
                </f7-row>

                <f7-row class="row--valign-center row--mb">
                  <f7-col width="35">
                    <label for="billing_address_line1">{{$t('subscriptions.index.billing.address_line1')}}</label>
                  </f7-col>
                  <f7-col width="65">
                    <f7-input type="text" name="address_line1" input-id="billing_address_line1"
                              :value="billingInfo.address_line1"
                              @input="billingInfo.address_line1 = $event.target.value;"
                              class="input--outlined"></f7-input>

                  </f7-col>
                </f7-row>

                <f7-row class="row--valign-center row--mb">
                  <f7-col width="35">
                    <label for="billing_address_line2">{{$t('subscriptions.index.billing.address_line2')}}</label>
                  </f7-col>
                  <f7-col width="65">
                    <f7-input type="text" name="address_line2" input-id="billing_address_line2"
                              :value="billingInfo.address_line2"
                              @input="billingInfo.address_line2 = $event.target.value;"
                              class="input--outlined"></f7-input>

                  </f7-col>
                </f7-row>

                <f7-row class="row--valign-center row--mb">
                  <f7-col width="35">
                    <label for="billing_city">{{$t('subscriptions.index.billing.city')}}</label>
                  </f7-col>
                  <f7-col width="65">
                    <f7-input type="text" name="city" input-id="billing_city"
                              :value="billingInfo.city"
                              @input="billingInfo.city = $event.target.value;" class="input--outlined"></f7-input>

                  </f7-col>
                </f7-row>

                <f7-row class="row--valign-center row--mb">
                  <f7-col width="35">
                    <label for="billing_postcode">{{$t('subscriptions.index.billing.postcode')}}</label>
                  </f7-col>
                  <f7-col width="65">
                    <f7-input type="text" name="postcode" input-id="billing_postcode"
                              :value="billingInfo.postcode"
                              @input="billingInfo.postcode = $event.target.value;" class="input--outlined"></f7-input>

                  </f7-col>
                </f7-row>

                <f7-row class="row--valign-center row--mb">
                  <f7-col width="35">
                    <label for="billing_state">{{$t('subscriptions.index.billing.state')}}</label>
                  </f7-col>
                  <f7-col width="65">
                    <f7-input type="text" name="state" input-id="billing_state"
                              :value="billingInfo.state"
                              @input="billingInfo.state = $event.target.value;" class="input--outlined"></f7-input>

                  </f7-col>
                </f7-row>


                <f7-row class="row--valign-center row--mb" v-if="billingInfo.country === 'AU'">
                  <f7-col width="35">
                    <label for="billing_company_number">{{$t('subscriptions.index.billing.company_number')}}</label>
                  </f7-col>
                  <f7-col width="65">
                    <f7-input type="text" name="company_number" input-id="billing_state"
                              :value="billingInfo.company_number"
                              @input="billingInfo.company_number = $event.target.value;"
                              class="input--outlined"></f7-input>

                  </f7-col>
                </f7-row>

                <f7-row>
                  <f7-col>
                    <a href="#" class="tommy-button tommy-button--primary tommy-button--full-width"
                       @click="updateBillingDetails">{{$t('subscriptions.index.billing.update_billing_details_button')}}</a>
                  </f7-col>
                </f7-row>

              </form>
            </f7-block>
          </f7-col>

          <f7-col width="100" tablet-width="50">
            <f7-block strong inset>
              <f7-block-header>{{$t('subscriptions.index.payment_method.title')}}</f7-block-header>

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
                    <f7-row class="row--mb">
                      <f7-col>
                        <label for="card_last4"
                               class="label--mb">{{$t('subscriptions.index.credit_card.number.label')}}</label>
                        <f7-input input-id="card_last4"
                                  type="text"
                                  :placeholder="$t('subscriptions.index.credit_card.number.placeholder')"
                                  class="input--outlined"
                                  :value="billingInfo.card_last4"
                                  @input="billingInfo.card_last4 = $event.target.value;"></f7-input>
                      </f7-col>
                    </f7-row>

                    <f7-row>
                      <f7-col>
                        <label
                          for="card_exipiry_month" class="label--mb">{{$t('subscriptions.index.credit_card.expiry.label')}}</label>
                      </f7-col>
                    </f7-row>
                    <f7-row class="row--mb">

                      <f7-col width="50">

                        <f7-input input-id="card_exipiry_month"
                                  type="select"
                                  class="input--outlined">

                          <option value="">{{$t('subscriptions.index.credit_card.expiry.placeholder_month')}}</option>
                          <option v-for="(month) in ['01','02','03','04','05','06','07','08','09','10','11','12']"
                                  :value="month"
                                  :selected="month === billingInfo.card_exipiry_month">{{month}}
                          </option>
                        </f7-input>
                      </f7-col>
                      <f7-col width="50">

                        <f7-input input-id="card_exipiry_year"
                                  type="select"
                                  class="input--outlined">

                          <option value="">{{$t('subscriptions.index.credit_card.expiry.placeholder_year')}}</option>
                          <option v-for="(year) in years"
                                  :value="year"
                                  :selected="year === billingInfo.card_exipiry_year">{{year}}
                          </option>
                        </f7-input>
                      </f7-col>
                    </f7-row>

                    <f7-row class="row--mb">

                      <f7-col width="50">

                        <label
                          for="card_exipiry_cvc"
                          class="label--mb">{{$t('subscriptions.index.credit_card.cvc.label')}}</label>

                        <f7-input input-id="card_exipiry_cvc"
                                  type="text"
                                  class="input--outlined"
                                  :placeholder="$t('subscriptions.index.credit_card.cvc.placeholder')"
                                  :value="billingInfo.card_cvc"
                                  @input="billingInfo.card_cvc = $event.target.value;">

                        </f7-input>
                      </f7-col>
                    </f7-row>

                    <f7-row>
                      <f7-col width="50">
                        <a href="#" class="tommy-button tommy-button--primary"
                           @click.prevent="updateCreditCardDetailsClick">{{$t('subscriptions.index.payment_method.update_credit_card_details_button')}}</a>
                      </f7-col>
                    </f7-row>


                  </template>




                </f7-col>

              </f7-row>



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

  import API from '../api';
  import countryList from '../data/countryList.json';
  import addonAssetsUrl from '../utils/addon-assets-url';

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

      const years = () => {
        const _years = []
        const dateStart = self.$moment();
        const dateEnd = self.$moment().add(10, 'y')
        while (dateEnd.diff(dateStart, 'years') >= 0) {
          _years.push(dateStart.format('YY'));
          dateStart.add(1, 'year');
        }
        return _years;
      }

      return {
        loaded: false,
        billingInfo: {
          first_name: firstName,
          last_name: lastName,
        },
        subscriptions: [],
        countries: countryList,
        isEditingPaymentInfo: false,
        years: years(),
      };
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
        const demoData = true;
        API.getBillingInfo({demoData}).then(billingInfo => {
          const newBillingInfo = {...self.billingInfo, ...billingInfo};
          self.billingInfo = newBillingInfo;
          API.getSubscriptions({demoData}).then(subscriptions => {
            self.subscriptions = subscriptions;
            self.loaded = true;
          });
        });

      },

      updateBillingDetails() {
        const self = this;
        const data = self.billingInfo;
        API.updateBillingInfo({data});
      },

      editCreditCardDetailsClick() {
        const self = this;
        self.isEditingPaymentInfo = !self.isEditingPaymentInfo;
      },

      updateCreditCardDetailsClick() {
        const self = this;
      },
    },
    mounted() {
      const self = this;
      self.updateAll();
    },
  };
</script>
