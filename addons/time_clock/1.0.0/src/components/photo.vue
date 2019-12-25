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
  props:{
    direction:{
      type: String,
      default: 'BACK'
    }
  },
  methods: {
    takePhoto() {
      const self = this;
      if (self.isCordova) {
        self.openCamera();
      } else {
        self.$refs.inputFileCamera.click();
      }
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
        saveToPhotoAlbum: false,
      }
      options.cameraDirection = Camera.Direction[String(self.direction).toUpperCase()];
      navigator.camera.getPicture(
        //cameraSuccess
        (image)=>{
          self.$emit("photo:send", image);
          navigator.camera.cleanup();
        },
        //cameraError
        (error) => {
          console.debug("Unable to obtain picture: " + error, "app");
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
          });
        };
        reader.readAsDataURL(file);
      }
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
  data(){
    const self = this;
    return{
      isCordova: self.$f7.device.cordova
    }
  },
};
</script>