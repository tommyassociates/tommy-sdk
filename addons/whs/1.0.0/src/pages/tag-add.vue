<template>
  <f7-page>
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('whs.tag_add.title')}}</f7-nav-title>
      <f7-nav-right class="whs-navbar-links">
        <f7-link icon-only @click="addTag">
          <f7-icon f7="check" />
        </f7-link>
      </f7-nav-right>
    </f7-navbar>
    <form class="list" id="add-tag" action="javascript:void(0)" enctype="multipart/form-data">
      <f7-list class="whs-form">
        <ul>
          <f7-list-item divider>
            <i class="whs-form-icon whs-form-icon-aa"></i>
            {{$t('whs.common.name_label')}}
          </f7-list-item>
          <f7-list-input
            type="text"
            name="name"
            required
            validate
            :error-message="$t('whs.common.required_name_error')"
            :value="tag.name"
            @input="tag.name = $event.target.value"
            :placeholder="$t('whs.common.required_placeholder')"
          />
          <f7-list-item divider>
            <i class="whs-form-icon whs-form-icon-image"></i>
            {{$t('whs.common.icon_label')}}
          </f7-list-item>
          <form-images-picker />
        </ul>
      </f7-list>
    </form>
  </f7-page>
</template>
<script>
import API from "../api";
import FormImagesPicker from "../components/form-images-picker.vue";

export default {
  components: {
    FormImagesPicker
  },
  created() {},
  computed: {},
  methods: {
    addTag() {
      self = this;
      if (this.$f7.$("#add-tag")[0].checkValidity()) {
        API.createLocation(API.removeEmpty(this.tag)).then(() => {
          self.$f7router.back();
          API.toast(self.$t("whs.toast.add_tag"));
        });
      } else {
        this.$f7.dialog.alert(
          this.$t("whs.alert_form.text"),
          this.$t("whs.alert_form.title"),
          false
        );
      }
    }
  },
  beforeDestroy() {
    const self = this;
  },
  mounted() {
    const self = this;
  },
  data() {
    return {
      tag: {
        name: null,
        image: null
      }
    };
  }
};
</script>
