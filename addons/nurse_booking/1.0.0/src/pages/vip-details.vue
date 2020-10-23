<template>
  <f7-page name="nurse_booking__vip-details" id="nurse_booking__vip-details" @page:beforein="onPageBeforeIn" @page:beforeout="onPageBeforeOut">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
    </f7-navbar>

    <div class="vip-header">
      <div class="avatar" :style="`background-image: url(${$addonAssetsUrl}demo-avatar.png`">
        <div class="medal medal-green"></div>
      </div>
      <div class="name">Allen Zhang</div>
    </div>
    <div class="vip-plan-details">
      <div class="vip-plan-current">{{$t('nurse_booking.vip.plan_green')}}</div>
      <div class="vip-plan-expiration">Expires 3rd April</div>
    </div>
    <div class="list vip-details-list">
      <ul>
        <li class="item-divider">{{$t('nurse_booking.vip.details_plan_inclusion')}}</li>
        <li class="item-content">
          <div class="item-inner">
            <div class="item-title">
              <div>Nurse Visit</div>
              <div class="item-subtitle">
                <b>Four</b> (<b>one</b> time left) per month
              </div>
            </div>
          </div>
        </li>
        <li class="item-content">
          <div class="item-inner">
            <div class="item-title">
              <div>Clean</div>
              <div class="item-subtitle">
                <b>Four+One</b> per month
              </div>
            </div>
          </div>
        </li>
        <li class="item-content">
          <div class="item-inner">
            <div class="item-title">
              <div>Massage</div>
            </div>
          </div>
        </li>
        <li class="item-divider">{{$t('nurse_booking.vip.details_administration')}}</li>
        <li>
          <a href="#" class="item-content item-link">
            <div class="item-inner">
              <div class="item-title">Change Subscription</div>
            </div>
          </a>
        </li>
        <li>
          <a href="#" class="item-content item-link">
            <div class="item-inner">
              <div class="item-title">Coupon</div>
              <div class="item-after"><b>4 Sheets</b></div>
            </div>
          </a>
        </li>
      </ul>
    </div>
  </f7-page>
</template>
<script>
  export default {
    methods: {
      onPageBeforeIn() {
        // const self = this;
        // self.$f7router.view.$navbarEl.addClass('nurse-booking__vip-navbar');
      },
      onPageBeforeOut() {
        // const self = this;
        // self.$f7router.view.$navbarEl.removeClass('nurse-booking__vip-navbar');
      },
    },
  };
</script>

