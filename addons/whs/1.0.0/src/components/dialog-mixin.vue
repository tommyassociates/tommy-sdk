<script>
export default {
  methods: {
    alertDialog(title, text, okButton) {
      this.$f7.dialog
        .create({
          title: title,
          text: text,
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
    confirmDialog(title, text, okButton, cancelButton, okCallback, cancelCallback) {
      this.$f7.dialog
        .create({
          title: title,
          text: text,
          buttons: [
            {
              text: cancelButton,
              keyCodes: [27],
              onClick: ()=>{
                  if (typeof cancelCallback === "function") cancelCallback();
              }
            },
            {
              text: okButton,
              cssClass: "dialog-button-bold",
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