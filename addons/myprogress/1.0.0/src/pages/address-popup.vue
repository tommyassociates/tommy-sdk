<template>
  <f7-popup :opened="opened" @popup:closed="onClosed">
    <f7-view :init="false">
      <f7-page class="myprogress-upload myprogress-address-page">
        <f7-navbar>
          <f7-nav-title>{{$t('myprogress.upload.address_title')}}</f7-nav-title>
          <f7-nav-right>
            <f7-link popup-close icon-f7="close"></f7-link>
          </f7-nav-right>
        </f7-navbar>
        <div class="myprogress-upload-button"
          v-if="step === 'step-1'"
          slot="fixed"
          @click="setStep('step-2')"
        >{{$t('myprogress.upload.button_continue')}}</div>

        <template v-if="step === 'step-1'">
          <div class="myprogress-upload-intro">
            <p>
              <img :src="`${$addonAssetsUrl}/icon-address.svg`">
            </p>
            <div v-html="$t('myprogress.upload.address_text').replace(/\n/g, '<br>')"></div>
          </div>
        </template>

        <template v-if="step === 'step-2'">
          <div class="myprogress-address-card">
            <input
              @input="city = $event.target.value"
              :value="city"
              :placeholder="$t('myprogress.upload.address_city_placeholder')"
              type="text"
            >
            <textarea
              @input="address = $event.target.value"
              :value="address"
              :placeholder="$t('myprogress.upload.address_address_placeholder')"
            ></textarea>

            <p class="myprogress-address-radios-label">{{$t('myprogress.upload.address_choose_size')}}</p>
            <div class="myprogress-address-radios">
              <div
                class="myprogress-address-radio"
                :class="{checked: size === 'm'}"
                @click="size = 'm'"
              >{{$t('myprogress.upload.address_size_m')}}</div>
              <div
                class="myprogress-address-radio"
                :class="{checked: size === 'l'}"
                @click="size = 'l'"
              >{{$t('myprogress.upload.address_size_l')}}</div>
              <div
                class="myprogress-address-radio"
                :class="{checked: size === 'xl'}"
                @click="size = 'xl'"
              >{{$t('myprogress.upload.address_size_xl')}}</div>
              <div
                class="myprogress-address-radio"
                :class="{checked: size === 'xxl'}"
                @click="size = 'xxl'"
              >{{$t('myprogress.upload.address_size_xxl')}}</div>
            </div>
            <a :class="{disabled: !city || !address || !size}" @click="save">{{$t('myprogress.upload.button_save')}}</a>
          </div>
        </template>

      </f7-page>
    </f7-view>
  </f7-popup>
</template>
<script>
  export default {
    props: {
      title: String,
      intro: String,
      reminder: String,
      reminderImageSrc: String,
      uploadText: String,
      multipleUpload: {
        type: Boolean,
        default: false,
      },
      cityInitial: String,
      addressInitial: String,
      sizeInitial: String,
    },
    data() {
      return {
        opened: false,
        step: 'step-1',
        city: this.cityInitial || '',
        address: this.addressInitial || '',
        size: this.sizeInitial || '',
      };
    },
    mounted() {
      this.$nextTick(() => {
        this.opened = true;
      });
    },
    methods: {
      save() {
        const self = this;
        const { city, address, size } = self;
        self.$emit('save', { city, address, size });
        self.$f7.popup.close();
      },
      setStep(step) {
        const self = this;
        if (step === 'step-3') {
          self.uploadFiles().then(() => {
            self.step = step;
          });
          return;
        }
        self.step = step;
      },
      onClosed() {
        this.$emit('closed');
      },
    },
  }
</script>