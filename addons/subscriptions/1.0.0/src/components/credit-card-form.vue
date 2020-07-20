<template>
  <form action="/charge" method="post" id="payment-form">

    <label for="card-element">
      Credit or debit card
    </label>
    <div id="card-element">
      <!-- a Stripe Element will be inserted here. -->
    </div>

    <!-- Used to display form errors -->
    <div id="card-errors" role="alert"></div>


    <input type="submit" class="submit" value="Submit Payment">
  </form>

  <!--
  <form action="">
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
          for="card_expiry_month" class="label--mb">{{$t('subscriptions.index.credit_card.expiry.label')}}</label>
      </f7-col>
    </f7-row>
    <f7-row class="row--mb">

      <f7-col width="50">

        <f7-input input-id="card_expiry_month"
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

        <f7-input input-id="card_expiry_year"
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
          for="card_cvc"
          class="label--mb">{{$t('subscriptions.index.credit_card.cvc.label')}}</label>

        <f7-input input-id="card_cvc"
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
  </form>-->
</template>

<script>
  import {injectStripe} from '../utils/inject-stripe';

  export default {
    name: "credit-card-form",
    props: {
      billingInfo: {
        type: Object,
      }
    },
    data() {
      const self = this;
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
        years: years(),
      }
    },
    methods: {
      updateCreditCardDetailsClick() {
        const self = this;
        Stripe.card.createToken($form, () => {
          // Grab the form:
          var $form = $('.payment-details form');

          if (response.error) { // Problem!

            // Show the errors on the form:
            $form.find('.payment-errors').html("<div class='alert alert-danger'>" + response.error.message + "<div>");

            // Re-enable submission
            $form.find('.submit').prop('disabled', false);
            this.loading = false;

          } else { // Token was created!

            // Get the token ID:
            var token = response.id;
            // console.log("this", this);
            this.billing.token = token;

            // Insert the token ID into the form so it gets submitted to the server:
            $form.append($('<input type="hidden" name="stripeToken">').val(token));

            // Submit the form:
            // $form.get(0).submit();
            var payload = {
              card_last4: this.billing.card_last4,
              card_exipiry_month: this.billing.card_exipiry_month,
              card_exipiry_year: this.billing.card_exipiry_year,
              stripe_token: this.billing.token,
              first_name: this.$root.user.first_name,
              last_name: this.$root.user.last_name,
              country: this.$root.user.country,
              address_line1: this.billing.address_line1,
              city: this.billing.city,
              state: this.billing.state,
              postcode: this.billing.postcode
            };

            this.$http.put('https://api.mytommy.com/v1/account/billing', payload).then((response) => {
              this.billing = response.body;
              this.hasCreditCard = true;
              this.initialHasCreditCard = true;
              this.loading = false;

              this.creditCard = {
                card_brand: response.body.card_brand,
                card_last4: response.body.card_last4,
                card_exipiry_month: response.body.card_exipiry_month,
                card_exipiry_year: response.body.card_exipiry_year
              }

              this.isEditingPaymentInfo = false;

            }, (response) => {
              this.loading = false;
            });
          }


        });
      },

      creditCardSubmit() {
        const createToken = () => {
          stripe.createToken(card).then(function(result) {
            if (result.error) {
              // Inform the user if there was an error
              var errorElement = document.getElementById('card-errors');
              errorElement.textContent = result.error.message;
            } else {
              // Send the token to your server
              stripeTokenHandler(result.token);
            }
          });
        };

        const stripeTokenHandler = token => {
          // Insert the token ID into the form so it gets submitted to the server
          var form = document.getElementById('payment-form');
          var hiddenInput = document.createElement('input');
          hiddenInput.setAttribute('type', 'hidden');
          hiddenInput.setAttribute('name', 'stripeToken');
          hiddenInput.setAttribute('value', token.id);
          form.appendChild(hiddenInput);

          // Submit the form
          form.submit();
        }

        // Create a token when the form is submitted.
        var form = document.getElementById('payment-form');
        form.addEventListener('submit', function(e) {
          e.preventDefault();
          createToken();
        });
      }
    },
    mounted() {
      injectStripe().then(() => {
        const stripe = Stripe('pk_test_e7zZmcCW40CdVJXV9roky5ik');
        const style = {
          style: {
            base: {
              iconColor: '#c4f0ff',
              color: '#fff',
              fontWeight: 500,
              fontFamily: 'Roboto, Open Sans, Segoe UI, sans-serif',
              fontSize: '16px',
              fontSmoothing: 'antialiased',
              ':-webkit-autofill': {
                color: '#fce883',
              },
              '::placeholder': {
                color: '#87BBFD',
              },
            },
            invalid: {
              iconColor: '#FFC7EE',
              color: '#FFC7EE',
            },
          }
        };
        const elements = stripe.elements(style);
        const card = elements.create('card');
        card.mount('#card-element');
      });
    },
  }
</script>

<style scoped>

</style>
