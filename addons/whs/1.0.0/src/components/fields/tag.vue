<template>
  <div>
    <f7-list-item divider>
      <i class="whs-form-icon whs-form-icon-hash"></i>
      {{params.name}}
    </f7-list-item>
    <tags-picker @selected:change="updateValue" :placeholder="params.placeholder" ref="tags_picker" />
  </div>
</template>

<script>
import FieldsLogic from "../../mixins/fileds-logic.vue";
import TagsPicker from "../../components/picker/tags.vue";

export default {
  name: "TagField",
  components: {
    TagsPicker
  },
  mixins: [FieldsLogic]
};
</script>