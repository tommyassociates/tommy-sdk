<template>
  <f7-page id="example__index">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>Example</f7-nav-title>
      <f7-nav-right></f7-nav-right>
    </f7-navbar>
    <f7-list class="list-custom">
      <!-- Example: Date Range Select -->
      <li class="item-divider">Date Range Select</li>
      <date-range-select
        v-model="dateRange"
        @change="onDateRangeChange"
        @save="onSave"
        :f7router="f7router"
      ></date-range-select>

      <!-- Example: Tag Select -->
      <tag-select
        title="Tag Select"
        v-model="testTags"
        @change="onTagsChange"
        @save="onSave"
        :f7router="f7router"
      ></tag-select>
      <!-- <f7-list-item
        title="Selected Tags"
        :after="testTags.map(x => x.name).join(', ')"
      ></f7-list-item> -->

      <!-- Example: Permission Select -->
      <permission-select
        title="Permission Select: Team Member Access"
        permission-name="addon_access"
        addon-name="example"
      ></permission-select>
      <!-- <f7-list-item
        title="Selected Date Range"
        :after="dateRange ? dateRange.join(' - ') : ''"
      ></f7-list-item> -->
    </f7-list>
  </f7-page>
</template>
<script>
  import TagSelect from 'tommy-core/src/components/tag-select';
  import PermissionSelect from 'tommy-core/src/components/permission-select';
  import DateRangeSelect from 'tommy-core/src/components/date-range-select';

  export default {
    props: {
      f7router: Object
    },
    components: {
      TagSelect,
      PermissionSelect,
      DateRangeSelect
    },
    data() {
      return {
        testTags: [{name: 'Test Tag'}],
        dateRange: null,
      };
    },
    methods: {
      onDateRangeChange(value) {
        console.log('example addon: date range changed', value)
      },
      onTagsChange(value) {
        console.log('example addon: tags changed', value)
      },
      onSave() {
        console.log('example addon: save requested')
      }
      // savePermission(permission) {
      //   console.log('example addon: save permissions', permission)
      // }
    },
  };
</script>
