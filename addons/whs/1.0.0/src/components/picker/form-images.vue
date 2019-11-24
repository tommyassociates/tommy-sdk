<template>
  <li class="item-content whs-form-images-picker">
    <div v-if="lineWithActions" class="item-inner justify-content-flex-end align-items-center">
      <label class="link">
        <input type="file" :multiple="multiple" @change="onFilesChange" accept="image/*">
        <i class="f7-icons">images</i>
      </label>
      <a class="link">
        <i class="f7-icons">camera</i>
      </a>
    </div>
    <div class="whs-form-images-previews" v-if="previews.length || !lineWithActions">
      <div
        v-for="(preview, index) in previews"
        :key="index"
        :style="`background-image: url(${preview})`"
        class="whs-form-images-preview"
      >
        <a @click="deleteFile(index)">
          <i class="f7-icons">close</i>
        </a>
      </div>
      <label v-if="!lineWithActions && (!multiple && previews.length < 1)" class="whs-form-images-add-button">
        <input type="file" :multiple="multiple" @change="onFilesChange" accept="image/*">
        <i class="f7-icons">camera</i>
        <span>{{$t('whs.common.add_photo_label')}}</span>
      </label>
    </div>
  </li>
</template>
<script>
  export default {
    props: {
      lineWithActions: {
        type: Boolean,
        default: true,
      },
      multiple: {
        type: Boolean,
        default: false,
      },
    },
    data() {
      return {
        files: [],
        previews: [],
      };
    },
    methods: {
      onFilesChange(e) {
        const self = this;
        const files = e.target.files;
        if (!files.length) return;
        for (let i = 0; i < files.length; i += 1) {
          const file = files[i];
          const reader = new FileReader();
          reader.onload = () => {
            self.files.push(file);
            self.previews.push(reader.result);
          }
          reader.readAsDataURL(file);
        }
      },
      deleteFile(index) {
        const self = this;
        self.files.splice(index, 1);
        self.previews.splice(index, 1);
      },
    },
  }
</script>
