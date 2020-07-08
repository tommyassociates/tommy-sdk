<script>
export default {
  methods: {
    alertDialog(title, text, okButton, cssClass = null) {
      this.$f7.dialog
        .create({
          title: title,
          text: text,
          cssClass: cssClass,
          buttons: [
            {
              text: okButton,
              cssClass: "dialog-button-bold",
              keyCodes: [13]
            }
          ]
        })
        .open();
    },
    confirmDialog(title, text, okButton, cancelButton, okCallback, cancelCallback, cssClass = null, firstBold = false, secondBold = true) {
      this.$f7.dialog
        .create({
          title: title,
          text: text,
          cssClass: cssClass,
          buttons: [
            {
              text: cancelButton,
              bold: firstBold,
              keyCodes: [27],
              onClick: ()=>{
                  if (typeof cancelCallback === "function") cancelCallback();
              }
            },
            {
              text: okButton,
              bold: secondBold,
              keyCodes: [13],
                onClick: ()=>{
                  if (typeof okCallback === "function") okCallback();
              }
            }
          ]
        })
        .open();
    }
  }
};
</script>