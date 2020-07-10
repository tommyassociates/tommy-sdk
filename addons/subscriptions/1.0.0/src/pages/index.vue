<template>
  <f7-page id="example__index">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{$t('subscriptions.index.title')}}</f7-nav-title>
      <f7-nav-right></f7-nav-right>
    </f7-navbar>

    <f7-page-content>
      <f7-row no-gap align="top">
        <f7-col width="100" tablet-width="50">
          <f7-block strong inset>
            <f7-block-header>{{$t('subscriptions.index.monthly_estimate.title')}}</f7-block-header>
            <p>{{$t('subscriptions.index.monthly_estimate.description')}}</p>
          </f7-block>
        </f7-col>

        <f7-col width="100" tablet-width="50">
          <f7-block strong inset>
            <f7-block-header>{{$t('subscriptions.index.billing.title')}}</f7-block-header>

            <form action="">
              <f7-row>
                <f7-col width="35">
                  <label>{{$t('subscriptions.index.billing.company_label')}}</label>
                </f7-col>
                <f7-col width="65">
                  <f7-input></f7-input>
                </f7-col>
              </f7-row>
            </form>
          </f7-block>
        </f7-col>

      </f7-row>
    </f7-page-content>
  </f7-page>
</template>
<script>

  export default {
    data() {
      return {
      };
    },
    methods: {

    },
  };
</script>
