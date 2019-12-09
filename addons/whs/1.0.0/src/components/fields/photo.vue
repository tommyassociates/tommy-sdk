<template>
  <div>
    <f7-list-item divider>
      <i class="whs-form-icon whs-form-icon-photo"></i>
      {{params.name}}
    </f7-list-item>
    <li class="item-content whs-form-images-picker">
      <div class="whs-form-images-previews">
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
        <label
          v-if="params.multiple !== true && previews.length < 1"
          class="whs-form-images-add-button"
        >
          <input type="file" :multiple="params.multiple" @change="onFilesChange" accept="image/*" />
          <i class="f7-icons">camera</i>
          <span>{{$t('whs.common.add_photo_label')}}</span>
        </label>
      </div>
    </li>
  </div>
</template>

<script>
import FieldsLogic from "../../mixins/fileds-logic.vue";

export default {
  name: "PhotoField",
  mixins: [FieldsLogic],
  data() {
    return {
      files: [],
      previews: []
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
        };
        reader.readAsDataURL(file);
      }
    },
    deleteFile(index) {
      const self = this;
      self.files.splice(index, 1);
      self.previews.splice(index, 1);
    }
  }
};
</script>