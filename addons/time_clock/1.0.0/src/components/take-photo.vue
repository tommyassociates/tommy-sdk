<template>
  <f7-popup
    class="time-clock-camera-popup"
    @popup:opened="popupCameraOpened"
    @popup:close="popupCameraClose"
    @popup:closed="popupCameraClosed"
    ref="cameraPopup"
  >
    <f7-page :page-content="false">
      <f7-navbar>
        <f7-nav-left>
          <div class="geo-icon"></div>
          <div class="coords">{{geo}}</div>
        </f7-nav-left>
      </f7-navbar>
      <f7-toolbar>
        <f7-button class="back" @click="goBack"></f7-button>
        <f7-button class="shoot" v-if="!photo_taken" @click="takePhoto"></f7-button>
        <f7-button class="send" v-if="photo_taken" @click="sendPhoto"></f7-button>
        <f7-button class="reshoot" v-if="photo_taken" @click="reShoot"></f7-button>
        <div class="empty-button" v-if="!photo_taken"></div>
      </f7-toolbar>
      <f7-page-content>
        <div class="image-camera-container" :style="imageContainerStyle">
          <input
            type="file"
            :multiple="false"
            @change="onFilesChange"
            accept="image/*"
            v-if="!cordova && !photo_taken"
            ref="inputFile"
          />
        </div>
      </f7-page-content>
    </f7-page>
  </f7-popup>
</template>

<script>
import API from "../api";
import resizeImage from "../mixins/resize-image.vue";

export default {
  name: "TakePhoto",
  mixins: [resizeImage],
  methods: {
    open(callback) {
      const self = this;
      self.callback = callback;
      self.$refs.cameraPopup.open();
    },
    takePhoto() {
      const self = this;      
      if (self.cordova) {
      } else {
        self.$refs.inputFile.click();
      }
    },
    reShoot() {
      const self = this;
      self.photo_taken = false;
      self.photo = null;
    },
    goBack() {
      const self = this;
      self.$refs.cameraPopup.close();
    },
    sendPhoto() {
      const self = this;
      self.callback();
      self.$refs.cameraPopup.close();
    },
    popupCameraOpened() {
      const self = this;
    },
    popupCameraClose() {
      const self = this;
    },
    popupCameraClosed(){
      const self = this;
      self.clean();
    },
    clean(){
      const self = this;
      self.photo_taken = false;
      self.photo = null;
      self.geo = null;
    },
    onFilesChange(e) {
      const self = this;
      const files = e.target.files;
      if (!files.length) return;
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const reader = new FileReader();
        reader.onload = () => {
          self.photo_taken = true;
          self.resizeImage(reader.result).then(data => {
            self.photo_taken = true;
            self.photo = data;
          });
        };
        reader.readAsDataURL(file);
      }
    }
  },
  computed: {
    imageContainerStyle() {
      const self = this;
      if (!self.photo) return null;
      return { backgroundImage: 'url("' + self.photo + '")' };
    }
  },
  data() {
    const self = this;
    return {
      photo_taken: false,
      photo: null,
      geo: null,
      cordova: self.$f7.device.cordova
    };
  }
};
</script>