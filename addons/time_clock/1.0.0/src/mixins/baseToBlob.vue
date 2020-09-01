<script>
export default {
  methods: {
    dataURLToBlob(dataURL) {
      console.log('dataURLToBlob');
      // console.log(dataURL);
      const BASE64_MARKER = ";base64,";
      if (dataURL.indexOf(BASE64_MARKER) === -1) {
        const contentType = 'image/jpeg';
        const raw = window.atob(dataURL);
        const rawLength = raw.length;
        const dataArray = new Uint8Array(rawLength);

        for (let i = 0; i < rawLength; i += 1) {
          dataArray[i] = raw.charCodeAt(i);
        }

        return new Blob([dataArray], { type: contentType });
      } else {
        const parts = dataURL.split(BASE64_MARKER);
        const contentType = parts[0].split(":")[1];
        const raw = window.atob(parts[1]);
        const rawLength = raw.length;
        const dataArray = new Uint8Array(rawLength);

        for (let i = 0; i < rawLength; i += 1) {
          dataArray[i] = raw.charCodeAt(i);
        }

        return new Blob([dataArray], {type: contentType});
      }
    }
  }
};
</script>
