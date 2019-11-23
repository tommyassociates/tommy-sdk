<template>
  <f7-page>
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{title}}</f7-nav-title>
      <f7-nav-right class="whs-navbar-links">
        <f7-link icon-only @click="addTag" v-if="!editId">
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
          <!--
          <f7-list-item divider>
            <i class="whs-form-icon whs-form-icon-image"></i>
            {{$t('whs.common.icon_label')}}
          </f7-list-item>
          <form-images-picker />
          -->
        </ul>
      </f7-list>
    </form>

    <div class="whs-form-delete" v-if="editId" style="position:absolute; bottom:0; left: 50%">
      <f7-link
        class="delete"
        @click="deleteDialog()"
        style="left: -50%;"
      >{{$t('whs.common.delete')}}</f7-link>
    </div>
  </f7-page>
</template>
<script>
import API from "../../api";
import FormImagesPicker from "../../components/form-images-picker.vue";
import Dialog from "../../mixins/dialog.vue";

export default {
  components: {
    FormImagesPicker
  },
  mixins: [Dialog],
  created() {
    if (
      this.$f7route.query.edit_id !== null &&
      this.$f7route.query.edit_id !== undefined
    ) {
      this.editId = this.$f7route.query.edit_id;
      this.indexEdit = this.$f7route.query.index;
      ///load tag from maim tags and clone
      this.tag = Object.assign({}, API.main_page.$data.tags[this.indexEdit]);
    }
  },
  computed: {
    title() {
      if (this.editId) {
        //fix for v1 withot edit function
        //return this.$t('whs.form_add.title_edit', { text: this.settings.tag.name})
        return this.$t("whs.form_add.title_delete", {
          text: this.settings.tag.name
        });
      } else {
        return this.$t("whs.form_add.title", { text: this.settings.tag.name });
      }
    }
  },
  methods: {
    addTag() {
      self = this;
      if (this.$f7.$("#add-tag")[0].checkValidity()) {
        if (this.editId) {
          API.editTag(this.tag, this.editId).then(() => {
            self.$events.$emit("tag:updated", this.tag);
            self.$f7router.back();
            API.toast(
              self.$t("whs.toast.edit", { text: this.settings.tag.name })
            );
          });
        } else {
          this.tag = API.removeEmpty(this.tag);
          API.createTag(this.tag).then(() => {
            self.$events.$emit("tag:aded", this.tag);
            self.$f7router.back();
            API.toast(
              self.$t("whs.toast.add", { text: this.settings.tag.name })
            );
          });
        }
      } else {
        this.alertDialog(
          this.$t("whs.alert_form.title"),
          this.$t("whs.alert_form.text"),
          this.$t("whs.alert_form.ok")
        );
      }
    },
    deleteTag() {
      API.deleteTag(this.editId).then(() => {
        self.$events.$emit("tag:deleted", this.tag);
        self.$f7router.back("/whs/", { force: true });
        API.toast(
          self.$t("whs.toast.delete", { text: this.settings.tag.name })
        );
      });
    },
    deleteDialog() {
      this.confirmDialog(
        this.$t("whs.alert_form.delete_title"),
        this.$t("whs.alert_form.delete_text"),
        this.$t("whs.alert_form.confirm"),
        this.$t("whs.alert_form.cancel"),
        this.deleteTag
      );
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
        name: null
      },
      editId: null,
      indexEdit: null,
      settings: API.main_page.$data.settings
    };
  }
};
</script>
