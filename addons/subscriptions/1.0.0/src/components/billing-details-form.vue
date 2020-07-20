<template>
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

        <div class="input--outlined item-input-wrap">
          <select name="country" id="billing_country"
                  @change="billingInfo.country = $event.target.value;">
            <option value="">Select</option>
            <option v-for="(city_obj, city) in countries" :value="city_obj.Code"
                    :key="`country-${city_obj.Code}`"
                    :selected="city_obj.Code === billingInfo.country">{{city_obj.Name}}
            </option>
          </select>

        </div>

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


    <f7-row class="row--valign-center row--mb" v-if="String(billingInfo.country) === 'AU'">
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
</template>

<script>
  import API from "../api";
  import countryList from '../data/countryList.json';

  export default {
    name: "billing-details-form",
    data() {
      return {
        countries: countryList,
      }
    },
    props: {
      billingInfo: {
        type: Object,
      }
    },

    methods: {
      updateBillingDetails() {
        const self = this;
        const data = self.billingInfo;
        API.updateBillingInfo({data});
      },
    }
  }
</script>

<style scoped>

</style>
