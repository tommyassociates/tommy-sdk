<template>
  <f7-popup :opened="opened" @popup:closed="onClosed">
    <f7-view :init="false">
      <f7-page class="myprogress-upload">
        <f7-navbar>
          <!-- <f7-nav-left>
            <a class="link icon-only" @click="stepBack" v-if="step !== 'step-1'"><i class="material-icons md-36">keyboard_arrow_left</i></a>
          </f7-nav-left> -->
          <f7-nav-title>{{title}}</f7-nav-title>
          <f7-nav-right>
            <f7-link popup-close icon-f7="close"></f7-link>
          </f7-nav-right>
        </f7-navbar>
        <div class="myprogress-upload-button"
          v-if="step === 'step-1'"
          slot="fixed"
          @click="setStep('step-2')"
        >{{$t('myprogress.upload.button_upload')}}</div>

        <div class="myprogress-upload-button"
          v-if="step === 'step-2'"
          slot="fixed"
          :class="{disabled: !files.length || uploading}"
          @click="setStep('step-3')"
        >{{$t('myprogress.upload.button_submit')}}</div>

        <div class="myprogress-upload-button popup-close"
          v-if="step === 'step-3'"
          slot="fixed"
        >{{$t('myprogress.upload.button_next')}}</div>

        <template v-if="step === 'step-1'">
          <div class="myprogress-upload-intro" v-html="intro.replace(/\n/g, '<br>')"></div>
          <div class="myprogress-upload-reminder-label">{{$t('myprogress.upload.reminder_label')}}:</div>
          <div class="myprogress-upload-reminder-image">
            <img :src="reminderImageSrc" >
          </div>
          <div class="myprogress-upload-reminder-text">{{reminder}}</div>
        </template>

        <template v-if="step === 'step-2'">
          <div class="myprogress-upload-text">{{uploadText}}</div>
          <label
            class="myprogress-upload-camera"
            :class="{
              'has-uploads': files.length > 0,
            }"
          >
            <template v-if="files.length === 0">
              <i></i>
              <span>{{$t('myprogress.upload.add_photos_label')}}</span>
            </template>
            <template v-if="previews.length > 0">
              <img v-for="(src, index) in previews" :src="src" :key="index">
            </template>
            <input type="file" :multiple="multipleUpload" @change="onFilesChange">
          </label>
        </template>
        <template v-if="step === 'step-3'">
          <div class="myprogress-upload-text">{{uploadText}}</div>
          <div class="myprogress-thank-you">
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
        if (!files) return;
        self.previews = [];
        files.forEach((file, index) => {
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
        return self.$api.uploadFiles(self.files).then(() => {
          return Promise.resolve(true);
        });
      },
      onFilesChange(e) {
        this.files = [];
        for (let i = 0; i < Math.min(2, e.target.files.length); i += 1) {
          this.files.push(e.target.files[i]);
        }
      },
      onClosed() {
        this.$emit('closed');
      },
    },
  }
</script>