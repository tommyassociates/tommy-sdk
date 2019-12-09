<template>
  <div>
    <f7-list-item divider>
      <i class="whs-form-icon whs-form-icon-1"></i>
      {{params.name}}
    </f7-list-item>
    <f7-list-input
      type="number"
      :name="params.name"
      :required="params.required"
      :validate="params.validate"
      :error-message="$t('whs.form_add.validate.required')"
      :value="self_value"
      @input="updateValue($event.target.value)"
      :placeholder="params.placeholder"
    />
  </div>
</template>

<script>
import FieldsLogic from "../../mixins/fileds-logic.vue";

export default {
  name: "IntegerField",
  mixins: [FieldsLogic]
};
</script>