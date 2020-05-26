<template>
  <f7-page class="time-sheet-main-page" :page-content="false">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{$t('time_sheet.index.title')}}</f7-nav-title>
      <f7-nav-right class="time-sheet-navbar-links">
        <f7-link href="/time-sheet/add/" icon-only>
          <f7-icon f7="plus"/>
        </f7-link>
        <f7-link href="/time-sheet/search/" icon-only>
          <f7-icon f7="search"/>
        </f7-link>
        <!--<f7-link href="/time-sheet/settings/" icon-only>
          <f7-icon f7="gear"/>
        </f7-link>-->
      </f7-nav-right>
    </f7-navbar>



    <f7-page-content>





    </f7-page-content>
  </f7-page>
</template>
<script>
  import API from "../api";
  import TimeSheetService from "../services/time-sheet-service";


  export default {
    name: "Timesheet",
    data() {
      const self = this;
      return {

      };
    },
    components: {

    },
    mixins: [Blob],
    created() {
      const self = this;
      API.actorId = API.getUserId(self);
      API.actor = API.getActor(self);
    },
    computed: {

    },
    methods: {


    },
    beforeDestroy() {
      const self = this;

    },
    mounted() {
      const self = this;





    },

  };
</script>
