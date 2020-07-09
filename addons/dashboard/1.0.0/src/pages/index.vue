<template>
  <f7-page id="example__index">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{$t('dashboard.index.title')}}</f7-nav-title>
      <f7-nav-right></f7-nav-right>
    </f7-navbar>

    <f7-page-content>

      <f7-row no-gap>
        <f7-col width="100" tablet-width="50">
          <f7-block strong inset>
            <f7-block-header>{{$t('dashboard.index.subscription.title')}}</f7-block-header>
          </f7-block>
        </f7-col>
      </f7-row>

      <f7-row no-gap>
        <f7-col width="100">
          <f7-block strong inset>
            <f7-block-header>{{$t('dashboard.index.team_members.title')}}</f7-block-header>

            <f7-row no-gap>
              <f7-col width="100" tablet-width="50">

                <f7-row>
                  <f7-col width="40">
                    {{$t('dashboard.index.team_members.pending_invites')}}
                  </f7-col>
                  <f7-col width="60">
                    100 {{$t('dashboard.index.team_members.people')}}
                  </f7-col>
                </f7-row>
                <f7-row>
                  <f7-col width="40">
                    {{$t('dashboard.index.team_members.active')}}
                  </f7-col>
                  <f7-col width="60">
                    100 {{$t('dashboard.index.team_members.people')}}
                  </f7-col>
                </f7-row>
                <f7-row>
                  <f7-col width="40">
                    {{$t('dashboard.index.team_members.inactive')}}
                  </f7-col>
                  <f7-col width="60">
                    100 {{$t('dashboard.index.team_members.people')}}
                  </f7-col>
                </f7-row>
                <f7-row>
                  <f7-col width="40">
                    {{$t('dashboard.index.team_members.archived')}}
                  </f7-col>
                  <f7-col width="60">
                    100 {{$t('dashboard.index.team_members.people')}}
                  </f7-col>
                </f7-row>

              </f7-col>
              <f7-col width="100" tablet-width="50">
                GRAPH.
              </f7-col>
            </f7-row>
          </f7-block>
        </f7-col>
      </f7-row>


    </f7-page-content>
  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    components: {},
    data() {
      return {
        loaded: false,
      };
    },
    methods: {},
    mounted() {
      const self = this;

    }
  };
</script>
