<template>
  <f7-page>
    <f7-navbar innerClass="forms-blue-navbar-inner">
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('forms.assignment.assignment_label')}}</f7-nav-title>
    </f7-navbar>

    <f7-list no-hairlines class="no-margin">
      <f7-list-item
        v-if="template"
        :title="template.data.name"
      >
        <div
          class="forms-template-icon s60"
          slot="media"
          :style="{
            'background-image': template.iconUrl ? `url(${template.iconUrl})` : null,
          }"
        ></div>
      </f7-list-item>
    </f7-list>

    <f7-list no-hairlines>
      <f7-list-item
        :title="$t('forms.assignment.enabled_label')"
      >
        <f7-toggle :checked="assignment.data.enabled || typeof assignment.data.enabled === 'undefined'" @change="toggleEnabled($event.target.checked)" />
      </f7-list-item>
      <f7-list-item
        :title="$t('forms.assignment.type_label')"
        :after="$t(`forms.shortcuts_type_options.${assignment.data.type}_label`)"
      />
      <f7-list-item
        :title="$t('forms.template_details.template_details_created_label')"
        :after="$moment(assignment.created_at).format('DD MMM YYYY')"
      />
      <f7-list-item
        :title="$t('forms.assignment.deadline_label')"
        :after="$moment(assignment.data.deadline).format('DD MMM YYYY')"
      />
      <f7-list-item
        :title="$t('forms.template_details.template_details_anonymous_label')"
        :after="$t(`label.${assignment.data.anonymous ? 'yes' : 'no'}`)"
      />
      <f7-list-item
        link
        :title="$t('forms.template_edit.template_completes_label')"
        after="5"
      />
    </f7-list>

    <f7-list no-hairlines>
      <f7-list-button :href="`/forms/assignment-edit/${assignment.id}/`" :route-props="{
        assignment,
      }">
        {{$t('forms.index.edit_button')}}
      </f7-list-button>
      <f7-list-button color="red" @click="deleteAssignment">
        {{$t('forms.template_edit.delete_button')}}
      </f7-list-button>
    </f7-list>

  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    props: {
      template: Object,
      assignment: Object,
      id: [String, Number],
    },
    methods: {
      toggleEnabled(enabled) {
        const self = this;
        const newObj = Object.assign({}, self.assignment);
        newObj.data.enabled = enabled;
        API.updateAssignment(newObj).then(() => {
          self.$events.$emit('forms:assignmentupdated');
        });
      },
      deleteAssignment() {
        const self = this;
        self.$f7.dialog.confirm(self.$t('forms.assignment_delete_confirm.text'), () => {
          API.deleteAssignment(self.assignment.id).then(() => {
            self.$events.$emit('forms:assignmentdeleted');
            self.$f7router.back();
          });
        });
      },
    },
  };
</script>

