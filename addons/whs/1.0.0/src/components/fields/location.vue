<template>
  <div>
          <f7-list-item divider>
            <i class="whs-form-icon whs-form-icon-location"></i>
            {{params.name}}
          </f7-list-item>
          <location-picker
            :multiply="params.multiply"
            @selected:change="updateValue"
            :loadSelect="[value]"
          />
  </div>
</template>

<script>
import FieldsLogic from "../../mixins/fileds-logic.vue";
import LocationPicker from "../../components/picker/location.vue";


export default {
  name: "LocationField",
  components:{
    LocationPicker
  },
  mixins: [FieldsLogic]
};
</script>