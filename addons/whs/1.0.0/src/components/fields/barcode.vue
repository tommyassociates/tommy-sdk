<template>
  <div>
    <f7-list-item divider>
      <i class="whs-form-icon whs-form-icon-barcode"></i>
      {{params.name}}
    </f7-list-item>
    <f7-list-input
      type="text"
      :name="params.name"
      :required="params.required"
      :validate="params.validate"
      :error-message="$t('whs.form_add.validate.required')"
      :value="self_value"
      @input="updateValue($event.target.value)"
      :placeholder="params.placeholder"
    >
      <a class="link whs-form-barcode-link" slot="input">
        <i class="whs-icon whs-icon-barcode"></i>
      </a>
    </f7-list-input>
  </div>
</template>

<script>
import FieldsLogic from "../../mixins/fileds-logic.vue";

export default {
  name: "BarcodeField",
  mixins: [FieldsLogic]
};
</script>