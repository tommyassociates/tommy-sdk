<template>
  <f7-page>
    <f7-navbar innerClass="forms-blue-navbar-inner">
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('forms.template_details.template_view_title')}}</f7-nav-title>
    </f7-navbar>

    <f7-list no-hairlines class="no-margin">
      <f7-list-item
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
        :header="$t('forms.template_edit.template_description_label')"
      >
        <div slot="title">{{template.data.description}}</div>
      </f7-list-item>
      <f7-list-item
        :title="$t('forms.template_details.template_details_created_label')"
        :after="$moment(template.created_at).format('DD MMM YYYY')"
      />
      <f7-list-item
        :title="$t('forms.index.version_label')"
        after="???"
      />
    </f7-list>

  </f7-page>
</template>
<script>
  export default {
    props: {
      template: Object,
      id: [String, Number],
    },

  };
</script>

