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
  methods: {
    takePhoto() {
      if (this.isCordova) {
        this.openCamera();
        window.addEventListener("focus", this.CordovaCameraCheck, false);

      } else {
        //wath the file form
        window.addEventListener("focus", this.FileCameraCheck, false);
        this.$refs.inputFileCamera.click();
      }
    },
    takePhotoAsync() {
      const photoPromise = new Promise((resolve, reject) => {
        this.resolvePromise = resolve;
        this.rejectPromise = reject;
      });
      this.takePhoto();
      return photoPromise;
    },
    openCamera() {
      const srcType = Camera.PictureSourceType.CAMERA;
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
        Camera.Direction[String(this.direction).toUpperCase()];
      navigator.camera.getPicture(
        //cameraSuccess
        image => {
          this.photo_taken = true;
          this.$emit("photo:send", image);
          if (typeof this.resolvePromise === "function") this.resolvePromise(image);
          navigator.camera.cleanup();
        },
        //cameraError
        error => {
          this.$app.notify("Unable to obtain picture: " + error, "app");
          console.debug("Unable to obtain picture: " + error, "app");
          if (typeof this.rejectPromise === "function") this.rejectPromise(error);
          navigator.camera.cleanup();
        },
        options
      );
    },
    onFileCameraChange(e) {
      const files = e.target.files;
      if (!files.length) return;
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i];
        const reader = new FileReader();
        reader.onload = () => {
          this.photo_taken = true;
          this.resizeImageCamera(reader.result).then(data => {
            this.$emit("photo:send", data);
            if (typeof this.resolvePromise === "function")
              this.resolvePromise(data);
          });
        };

        reader.onError = error => {
          this.$emit("photo:error", error);
          if (typeof this.rejectPromise === "function")
            this.rejectPromise(error);
        };
        reader.readAsDataURL(file);
      }
    },
    FileCameraCheck(e) {
      setTimeout(() => {
        if (this.$refs.inputFileCamera.files.length === 0) {
          this.$emit("photo:error", "Photo not taken");
          window.removeEventListener("focus", this.FileCameraCheck, false);
          if (typeof this.rejectPromise === "function")
            this.rejectPromise("Photo not taken");
        }
      }, 300);
    },
    CordovaCameraCheck(e) {
      setTimeout(() => {
        if (photo_taken === false) {
          this.$emit("photo:error", "Photo not taken");
          window.removeEventListener("focus", this.CordovaCameraCheck, false);
          if (typeof this.rejectPromise === "function")
            this.rejectPromise("Photo not taken");
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
    return {
      photo_taken: false,
      isCordova: this.$f7.device.cordova
    };
  }
};
</script>
