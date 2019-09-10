<template>
  <f7-list-item :title="title" @click="openColorPicker">
    <span ref="targetEl" slot="after" class="list-color-picker-target" :style="`background-color: ${value}`"></span>
  </f7-list-item>
</template>
<script>
  import createColorPicker from '../utils/color-picker/color-picker-class';

  export default {
    props: {
      title: String,
      value: String,
    },
    mounted() {
      const self = this;
      self.colorPicker = createColorPicker(self.$f7, {
        targetEl: self.$refs.targetEl,
        value: { hex: self.value },
        openIn: 'popover',
        openInPhone: 'popover',
        backdrop: false,
        modules: ['wheel'],
        cssClass: 'whs-color-picker-popover',
        on: {
          change(cp, value) {
            self.$emit('change', value.hex);
          },
        },
      });
    },
    beforeDestroy() {
      const self = this;
      if (self.colorPicker) { self.colorPicker.destroy(); }
    },
    methods: {
      openColorPicker() {
        const self = this;
        self.colorPicker.open();
      }
    },
  };
</script>
