<script>
export default {
  methods: {
    resizeImage(base64image, width = 1080, height = 1080) {
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
  }
};
</script>