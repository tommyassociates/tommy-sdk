<template>
  <f7-app v-bind="params">
    <template v-if="coreReady">
      <f7-panel left cover v-model:opened="leftPanelOpened">
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
    </template>
  </f7-app>
</template>

<script>
  import { events } from 'tommy-core/src/tommy'

  export default {
    props: {
      params: Object
    },
    created() {
      events.$once('f7ready', () => {
        this.coreReady = true
      })
    },
    data: () => ({
      leftPanelOpened: false,
      coreReady: false // use this to toggle to true upon f7ready event
    }),
    methods: {
      toggleLeftPanel() {
        this.leftPanelOpened = !this.leftPanelOpened
      },
    },
  };
</script>
