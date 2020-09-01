<template>
  <div class="camera-input-file" style="display: none">
    <input
      type="file"
      :multiple="false"
      @change="onFileCameraChange"
      accept="image/*"
      v-if="!isCordova"
      ref="inputFileCamera"
    />
  </div>
</template>

<script>
export default {
  props: {
    direction: {
      type: String,
      default: "BACK"
    }
  },
  mounted() {
    console.log('SDK - PHOTO mounted');
  },
  methods: {
    takePhoto() {
      const self = this;
      if (self.isCordova) {
        self.openCamera();
        window.addEventListener("focus", self.CordovaCameraCheck, false);

      } else {
        //wath the file form
        window.addEventListener("focus", self.FileCameraCheck, false);
        self.$refs.inputFileCamera.click();
      }
    },
    takePhotoAsync() {
      console.log('takePhotoAsync');
      const self = this;
      const photoPromise = new Promise((resolve, reject) => {
        self.resolvePromise = resolve;
        self.rejectPromise = reject;
      });
      self.takePhoto();
      return photoPromise;
    },
    openCamera() {
      const self = this;
      var srcType = Camera.PictureSourceType.CAMERA;
      const options = {
        quality: 85,
        targetHeight: 1080,
        targetWidth: 1080,
        destinationType: Camera.DestinationType.DATA_URL,
        sourceType: Camera.PictureSourceType.CAMERA,
        encodingType: Camera.EncodingType.JPEG,
        mediaType: Camera.MediaType.PICTURE,
        allowEdit: false,
        correctOrientation: true,
        saveToPhotoAlbum: false
      };
      options.cameraDirection =
        Camera.Direction[String(self.direction).toUpperCase()];
      navigator.camera.getPicture(
        //cameraSuccess
        image => {
          self.photo_taken = true;
          self.$emit("photo:send", image);
          if (typeof self.resolvePromise === "function") self.resolvePromise(image);
          navigator.camera.cleanup();
        },
        //cameraError
        error => {
          self.$app.notify("Unable to obtain picture: " + error, "app");
          console.debug("Unable to obtain picture: " + error, "app");
          if (typeof self.rejectPromise === "function") self.rejectPromise(error);
          navigator.camera.cleanup();
        },
        options
      );
    },
    onFileCameraChange(e) {
      const self = this;
      const files = e.target.files;
      if (!files.length) return;
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const reader = new FileReader();
        reader.onload = () => {
          self.photo_taken = true;
          self.resizeImageCamera(reader.result).then(data => {
            self.$emit("photo:send", data);
            if (typeof self.resolvePromise === "function")
              self.resolvePromise(data);
          });
        };

        reader.onError = error => {
          self.$emit("photo:error", error);
          if (typeof self.rejectPromise === "function")
            self.rejectPromise(error);
        };
        reader.readAsDataURL(file);
      }
    },
    FileCameraCheck(e) {
      const self = this;
      setTimeout(() => {
        if (self.$refs.inputFileCamera.files.length === 0) {
          self.$emit("photo:error", "Photo not taken");
          window.removeEventListener("focus", self.FileCameraCheck, false);
          if (typeof self.rejectPromise === "function")
            self.rejectPromise("Photo not taken");
        }
      }, 300);
    },
    CordovaCameraCheck(e) {
      const self = this;
      setTimeout(() => {
        if (photo_taken === false) {
          self.$emit("photo:error", "Photo not taken");
          window.removeEventListener("focus", self.CordovaCameraCheck, false);
          if (typeof self.rejectPromise === "function")
            self.rejectPromise("Photo not taken");
        }
      }, 300);
    },
    resizeImageCamera(base64image, width = 1080, height = 1080) {
      let img = new Image();
      img.src = base64image;

      return new Promise(resolve => {
        img.onload = () => {
          if (img.height <= height && img.width <= width) {
            resolve(base64image);
          } else {
            if (img.height > img.width) {
              width = Math.floor(height * (img.width / img.height));
            } else {
              height = Math.floor(width * (img.height / img.width));
            }

            let resizingCanvas = document.createElement("canvas");
            let resizingCanvasContext = resizingCanvas.getContext("2d");

            resizingCanvas.width = img.width;
            resizingCanvas.height = img.height;

            resizingCanvasContext.drawImage(
              img,
              0,
              0,
              resizingCanvas.width,
              resizingCanvas.height
            );

            let curImage = {
              width: Math.floor(img.width),
              height: Math.floor(img.height)
            };

            let halfImage = {
              width: null,
              height: null
            };

            //reduce the size by 50% each time
            while (curImage.width * 0.5 > width) {
              halfImage.width = Math.floor(curImage.width * 0.5);
              halfImage.height = Math.floor(curImage.height * 0.5);

              resizingCanvasContext.drawImage(
                resizingCanvas,
                0,
                0,
                curImage.width,
                curImage.height,
                0,
                0,
                halfImage.width,
                halfImage.height
              );

              curImage.width = halfImage.width;
              curImage.height = halfImage.height;
            }

            let outputCanvas = document.createElement("canvas");
            let outputCanvasContext = outputCanvas.getContext("2d");

            outputCanvas.width = width;
            outputCanvas.height = height;

            outputCanvasContext.drawImage(
              resizingCanvas,
              0,
              0,
              curImage.width,
              curImage.height,
              0,
              0,
              width,
              height
            );

            const outputBase64 = outputCanvas.toDataURL('image/jpeg');
            resolve(outputBase64);
          }
        };
      });
    }
  },
  data() {
    const self = this;
    return {
      photo_taken: false,
      isCordova: self.$f7.device.cordova
    };
  }
};
</script>
