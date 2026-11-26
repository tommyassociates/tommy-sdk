<template>
  <f7-page addon="example">
    <f7-navbar>
      <f7-nav-title>Example</f7-nav-title>
      <f7-nav-right></f7-nav-right>
    </f7-navbar>
    Hello World

  </f7-page>
</template>
<script>

  export default {
    props: {
      f7router: Object
    },
    components: {
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
    },
  };
</script>
