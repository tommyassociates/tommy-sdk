<template>
  <f7-popup :opened="opened" @popup:closed="onClosed">
    <f7-view :init="false">
      <f7-page class="myprogress__upload">
        <f7-navbar>
          <!-- <f7-nav-left>
            <a class="link icon-only" @click="stepBack" v-if="step !== 'step-1'"><i class="material-icons md-36">keyboard_arrow_left</i></a>
          </f7-nav-left> -->
          <f7-nav-title>{{title}}</f7-nav-title>
          <f7-nav-right>
            <f7-link popup-close icon-f7="close"></f7-link>
          </f7-nav-right>
        </f7-navbar>
        <div class="myprogress__upload-button"
          v-if="step === 'step-1'"
          slot="fixed"
          @click="setStep('step-2')"
        >{{$t('myprogress.upload.button_upload')}}</div>

        <div class="myprogress__upload-button"
          v-if="step === 'step-2'"
          slot="fixed"
          :class="{disabled: uploading || files.length < (multipleUpload ? 2 : 1)}"
          @click="setStep('step-3')"
        >{{$t('myprogress.upload.button_submit')}}</div>

        <div class="myprogress__upload-button popup-close"
          v-if="step === 'step-3'"
          slot="fixed"
        >{{$t('myprogress.upload.button_next')}}</div>

        <template v-if="step === 'step-1'">
          <div class="myprogress__upload-intro" v-html="intro.replace(/\n/g, '<br>')"></div>
          <div class="myprogress__upload-reminder-label">{{$t('myprogress.upload.reminder_label')}}:</div>
          <div class="myprogress__upload-reminder-image">
            <img :src="reminderImageSrc" >
          </div>
          <div class="myprogress__upload-reminder-text">{{reminder}}</div>
        </template>

        <template v-if="step === 'step-2'">
          <div class="myprogress__upload-text">{{uploadText}}</div>
          <f7-swiper ref="swiper" v-if="multipleUpload" :params="{speed: 500}">
            <f7-swiper-slide>
              <label
                class="myprogress__upload-camera"
                :class="{
                  'has-uploads': !!files[0],
                }"
              >
                <template v-if="!files[0]">
                  <i></i>
                  <span>{{$t('myprogress.upload.add_photos_label')}}</span>
                </template>
                <template v-if="previews[0]">
                  <img :src="previews[0]">
                </template>
                <input type="file" accept="image/*" capture @change="onFilesChange($event, 0)">
              </label>
            </f7-swiper-slide>
            <f7-swiper-slide>
              <label
                class="myprogress__upload-camera"
                :class="{
                  'has-uploads': !!files[1],
                }"
              >
                <template v-if="!files[1]">
                  <i></i>
                  <span>{{$t('myprogress.upload.add_photos_label')}}</span>
                </template>
                <template v-if="previews[1]">
                  <img :src="previews[1]">
                </template>
                <input type="file" accept="image/*" capture @change="onFilesChange($event, 1)">
              </label>
            </f7-swiper-slide>
          </f7-swiper>
          <label
            v-else
            class="myprogress__upload-camera"
            :class="{
              'has-uploads': files.length > 0,
            }"
          >
            <template v-if="files.length === 0">
              <i></i>
              <span>{{$t('myprogress.upload.add_photos_label')}}</span>
            </template>
            <template v-if="previews.length > 0">
              <img :src="previews[0]" :key="index">
            </template>
            <input type="file" accept="image/*" capture @change="onFilesChange($event, 0)">
          </label>
        </template>
        <template v-if="step === 'step-3'">
          <div class="myprogress__upload-text">{{uploadText}}</div>
          <div class="myprogress__thank-you">
            <i></i>
            <span>{{$t('myprogress.upload.thank_you_label')}}</span>
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
    },
    data() {
      return {
        opened: false,
        step: 'step-1',
        uploads: [],
        files: [],
        previews: [],
        uploading: false,
      };
    },
    watch: {
      files() {
        const self = this;
        const files = self.files;
        self.previews = [];
        files.forEach((file, index) => {
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (e) => {
            self.$set(self.previews, index, e.target.result);
          };
          reader.readAsDataURL(file);
        });
      },
    },
    mounted() {
      this.$nextTick(() => {
        this.opened = true;
      });
    },
    methods: {
      stepBack() {},
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
      uploadFiles() {
        const self = this;
        self.uploading = true;
        return new Promise((resolve, reject) => {
          return Promise.all(
            self.files.map(f => self.$api.uploadFiles([f]))
          ).then((files) => {
            const result = [];
            files.forEach((filesArray) => {
              result.push(...filesArray);
            });
            self.$emit('uploaded', result);
            resolve(files);
          }).catch((err) => {
            reject(err);
            console.error(err);
          });
        });
      },
      onFilesChange(e, index) {
        const self = this;
        self.$set(self.files, index, e.target.files[0]);
        self.$nextTick(() => {
          if (index === 0 && !self.files[1] && self.multipleUpload) {
            self.$refs.swiper.swiper.slideNext();
          }
          if (index === 1 && !self.files[0] && self.multipleUpload) {
            self.$refs.swiper.swiper.slidePrev();
          }
        });
      },
      onClosed() {
        this.$emit('closed');
      },
    },
  }
</script>