<template>
  <div>
    <f7-list-item divider>
      <i class="whs-form-icon whs-form-icon-dot"></i>
      {{params.name}}
    </f7-list-item>
    <f7-list-item
      class="whs-type-selector"
      smart-select
      title=" "
      :smart-select-params="{
              openIn: 'popup',
              pageBackLinkText: '',
              popupCloseLinkText: '',
              closeOnSelect: true,
              pageTitle: $t('whs.common.options_title'),
              valueEl: '.whs-type-selector .item-title',
              cssClass: 'whs-type-options'            
            }"
    >
      <select :name="params.alias" @change="updateValue($event.target.value)">
        <option 
          v-for="(option, index) in params.options"
          :key="'option_'+params.alias+'_'+index"
          :value="option.value"
          :selected="option.value == self_value"
        >
          {{option.name}}
        </option>
      </select>
    </f7-list-item>
  </div>
</template>

<script>
import FieldsLogic from "../../mixins/fileds-logic.vue";

export default {
  name: "SingleSelectField",
  mixins: [FieldsLogic]
};
</script>