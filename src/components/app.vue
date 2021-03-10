<template>
  <f7-app v-bind="params">
    <f7-panel left cover theme-dark :opened="leftPanelOpened">
      <f7-view :init="false">
        <f7-page>
          <f7-navbar title="Navigation"></f7-navbar>
          <f7-list>
            <f7-list-item
              link="/addons/"
              title="Addons"
              reload-all
              panel-close
            ></f7-list-item>
            <f7-list-item
              link="/views/"
              title="Views"
              reload-all
              panel-close
            ></f7-list-item>
            <f7-list-item
              link="/settings/"
              title="Settings"
              reload-all
              panel-close
            ></f7-list-item>
          </f7-list>
        </f7-page>
      </f7-view>
    </f7-panel>
    <f7-view class="ios-edges" main url="/" :masterDetailBreakpoint="1024"></f7-view>
  </f7-app>
</template>

<script>
  export default {
    props: {
      params: Object
    },
    data: () => ({
      leftPanelOpened: false
    }),
    methods: {
      toggleLeftPanel() {
        this.leftPanelOpened = !this.leftPanelOpened
      },
    },
  };
</script>
