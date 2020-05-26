<template>
  <div class="camera-input-file" style="opacity: 0;">
    <input
      type="file"
      :multiple="false"
      @change="onFileCameraChange"
      accept="image/*"
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
        console.log('takePhoto');
        const self = this;
        if (self.isCordova) {
          self.openCamera();
          window.addEventListener("focus", self.CordovaCameraCheck, false);

        } else {
          //wath the file form
          console.log('not cordova');
          window.addEventListener("focus", self.FileCameraCheck, false);
          //self.$nextTick().then(() => {
          console.log('before file click');
            self.$refs.inputFileCamera.click();
            console.log('after file click');
            //document.getElementById("inputFileCamera").click();
         // });
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
        console.log('openCamera');
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


            function dataURLToBlob(dataURL) {
              const BASE64_MARKER = ';base64,';
              if (dataURL.indexOf(BASE64_MARKER) === -1) {
                const parts = dataURL.split(',');
                const contentType = parts[0].split(':')[1];
                const raw = decodeURIComponent(parts[1]);
                return new Blob([raw], { type: contentType });
              }
              const parts = dataURL.split(BASE64_MARKER);
              const contentType = parts[0].split(':')[1];
              const raw = window.atob(parts[1]);
              const rawLength = raw.length;
              const dataArray = new Uint8Array(rawLength);

              for (let i = 0; i < rawLength; i += 1) {
                dataArray[i] = raw.charCodeAt(i);
              }

              return new Blob([dataArray], { type: contentType });
            }

            const base64str = `data:image/jpg;base64,${image}`;
            const selfie = dataURLToBlob(base64str);


            if (typeof self.resolvePromise === "function") self.resolvePromise(selfie);
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
        console.log('onFileCameraChange');
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
        console.log('FileCameraCheck');
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
        console.log('CordovaCameraCheck');
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
        console.log('resizeImageCamera');
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

              //reduce the dize by 50% each time
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
              resolve(outputCanvas.toDataURL("image/jpeg", 0.85));
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
