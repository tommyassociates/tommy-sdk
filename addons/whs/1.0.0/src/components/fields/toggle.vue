<template>
  <div>
          <f7-list-item divider>
            <i class="whs-form-icon whs-form-icon-toggle"></i>
            {{params.name}}
          </f7-list-item>
          <f7-list-item>
            <f7-toggle
              slot="after"
              :checked="value"
              @toggle:change="updateValue"
            />
          </f7-list-item>
  </div>
</template>

<script>
import FieldsLogic from "../../mixins/fileds-logic.vue";

export default {
  name: "ToggleField",
  mixins: [FieldsLogic]
};
</script>