<template>
  <f7-popup
    class="time-clock-camera-popup"
    @popup:opened="popupCameraOpened"
    @popup:open="popupCameraOpen"
    @popup:close="popupCameraClose"
    @popup:closed="popupCameraClosed"
    ref="cameraPopup"
  >
    <f7-page :page-content="false">
      <f7-navbar>
        <f7-nav-left v-if="geolocation">
          <div class="geo-icon"></div>
          <div class="coords">{{geoCoordinates}}</div>
        </f7-nav-left>
      </f7-navbar>
      <f7-page-content>
        <div :class="['image-camera-container', portrait ? 'portrait':'landscape']" :style="imageContainerStyle">
          <input
            type="file"
            :multiple="false"
            @change="onFilesChange"
            accept="image/*"
            v-if="!cordova && !photo_taken"
            ref="inputFile"
          />
          <div class="control-buttons-container">
            <f7-button class="go-back" @click="goBack"></f7-button>
            <f7-button class="shoot" v-if="!photo_taken" @click="takePhoto"></f7-button>
            <f7-button class="send" v-if="photo_taken" @click="sendPhoto"></f7-button>
            <f7-button class="reshoot" v-if="photo_taken" @click="reShoot"></f7-button>
            <div class="empty-button" v-if="!photo_taken"></div>
          </div>
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
  props:{
    geolocation:{
      type: Boolean,
      default: false
    }
  },
  methods: {
    open() {
      const self = this;
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
      self.$emit('camera:send', self.photo);
      self.$refs.cameraPopup.close();
    },
    popupCameraOpened() {      
      const self = this;
      self.$emit('popup:opened');
      window.addEventListener('resize', self.orientationChange);
    },
    popupCameraOpen() {
      const self = this;
      self.$emit('popup:open');
      self.orientationChange();
    },
    popupCameraClose() {
      const self = this;
      self.$emit('popup:close');
    },
    popupCameraClosed(){
      const self = this;
      self.$emit('popup:closed');
      self.clean();
    },
    clean(){      
      const self = this;
      self.photo_taken = false;
      self.photo = null;
      self.geo = null;
      window.removeEventListener('resize', self.orientationChange);
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
    },
    orientationChange() {
      const self = this;
      let new_portrait = true;
      if(window.innerWidth > window.innerHeight) {
        new_portrait = false;
      }
      if (new_portrait !== self.portrait) self.portrait = new_portrait;
    }
  },
  computed: {
    imageContainerStyle() {
      const self = this;
      if (!self.photo) return null;
      return { backgroundImage: 'url("' + self.photo + '")' };
    },
    geoCoordinates(){

    },
  },
  created(){
    const self = this;    
  },
  beforeDestroy(){
    window.removeEventListener('resize', self.orientationChange);
  },
  data() {
    const self = this;
    return {
      portrait: true,
      photo_taken: false,
      photo: null,
      geo: null,
      cordova: self.$f7.device.cordova
    };
  }
};
</script>