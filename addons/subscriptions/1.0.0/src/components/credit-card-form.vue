<template>
  <form action="#" method="post" id="payment-form" @submit.prevent="paymentFormSubmit">

    <label for="card-element">
      {{$t('subscriptions.index.credit_card.label')}}
    </label>
    <div id="card-element">
      <!-- a Stripe Element will be inserted here. -->
    </div>

    <!-- Used to display form errors -->
    <div id="card-errors" role="alert"></div>

    <div class="actions">
      <input type="submit" class="tommy-button tommy-button--primary"
             :value="$t('subscriptions.index.credit_card.submit_button')">
    </div>
  </form>

</template>

<script>
  import {injectStripe} from '../utils/inject-stripe';
  import API from '../api';

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
    mounted() {
      injectStripe().then(() => {
        const self = this;
        const stripeKey = process.env.NODE_ENV === 'production' ?
            'pk_live_itlNkXwiG4eNNv1tkWTJIiou' :
            'pk_test_e7zZmcCW40CdVJXV9roky5ik'
        self.stripe = Stripe(stripeKey);
        const style = {
          style: {
            base: {
              iconColor: '#000',
              color: '#000',
              fontWeight: 400,
              fontFamily: 'Arial, Open Sans, Segoe UI, sans-serif',
              fontSize: '14.33px',
              fontSmoothing: 'antialiased',
              ':-webkit-autofill': {
                color: '#bbbbbbb',
              },
              '::placeholder': {
                color: '#bbbbbb',
              },
            },
            invalid: {
              iconColor: '#ff0000',
              color: '#ff0000',
            },
          }
        };
        self.elements = self.stripe.elements();
        self.card = self.elements.create('card', style);
        self.card.mount('#card-element');
      });
    },
    methods: {
      // updateCreditCardDetailsClick() {
      //   const self = this;
      //   Stripe.card.createToken($form, () => {
      //     // Grab the form:
      //     var $form = $('.payment-details form');
      //
      //     if (response.error) { // Problem!
      //
      //       // Show the errors on the form:
      //       $form.find('.payment-errors').html("<div class='alert alert-danger'>" + response.error.message + "<div>");
      //
      //       // Re-enable submission
      //       $form.find('.submit').prop('disabled', false);
      //       this.loading = false;
      //
      //     } else { // Token was created!
      //
      //       // Get the token ID:
      //       var token = response.id;
      //       // console.log("this", this);
      //       this.billing.token = token;
      //
      //       // Insert the token ID into the form so it gets submitted to the server:
      //       $form.append($('<input type="hidden" name="stripeToken">').val(token));
      //
      //       // Submit the form:
      //       // $form.get(0).submit();
      //       var payload = {
      //         card_last4: this.billing.card_last4,
      //         card_expiry_month: this.billing.card_expiry_month,
      //         card_expiry_year: this.billing.card_expiry_year,
      //         stripe_token: this.billing.token,
      //         first_name: this.$root.user.first_name,
      //         last_name: this.$root.user.last_name,
      //         country: this.$root.user.country,
      //         address_line1: this.billing.address_line1,
      //         city: this.billing.city,
      //         state: this.billing.state,
      //         postcode: this.billing.postcode
      //       };
      //
      //       this.$http.put('https://api.mytommy.com/v1/account/billing', payload).then((response) => {
      //         this.billing = response.body;
      //         this.hasCreditCard = true;
      //         this.initialHasCreditCard = true;
      //         this.loading = false;
      //
      //         this.creditCard = {
      //           card_brand: response.body.card_brand,
      //           card_last4: response.body.card_last4,
      //           card_expiry_month: response.body.card_expiry_month,
      //           card_expiry_year: response.body.card_expiry_year
      //         }
      //
      //         this.isEditingPaymentInfo = false;
      //
      //       }, (response) => {
      //         this.loading = false;
      //       });
      //     }
      //   });
      // },

      paymentFormSubmit() {
        const self = this;
        const createToken = () => {
          self.stripe.createToken(self.card).then((result) => {
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
          // form.submit();

          // console.log('token', token);

          const data = {
            card_brand: token.card.brand,
            card_last4: token.card.last4,
            card_expiry_month: token.card.exp_month,
            card_expiry_year: token.card.exp_year,
            stripe_token: token.id,
            first_name: self.billingInfo.first_name,
            last_name: self.billingInfo.last_name,
            country: self.billingInfo.country,
            address_line1: self.billingInfo.address_line1,
            city: self.billingInfo.city,
            state: self.billingInfo.state,
            postcode: self.billingInfo.postcode,
          }

          API.updateBillingInfo({data}).then(billingInfo => {
            self.$app.notify('Card updated successfully');
            self.card.clear()
            console.log('updateBillingInfo', token, billingInfo);
            self.$emit('update', billingInfo);
            //   console.log('loop', self.$parent, self.$parent.billingInfo)
            // self.$parent.billingInfo = billingInfo
            // self.$parent.forceUpdate()
          });

        }
        // Create a token when the form is submitted.
        // var form = document.getElementById('payment-form');
        // form.addEventListener('submit', function (e) {
        //   e.preventDefault();
        //   createToken();
        // });

        createToken();
      }
    },
  }
</script>

<style scoped>

</style>
