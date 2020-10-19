<template>
  <f7-page :page-content="false">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{ $t(`${addonConfig.package}.settings.title`) }}</f7-nav-title>
    </f7-navbar>
    <f7-page-content>

      <f7-block-title>{{ $t('label.lock_addon', 'Lock mini program') }}</f7-block-title>

      <f7-list>
        <f7-list-item :title="$t('label.lock_addon', 'Lock mini program')"
                      :footer="$t('label.lock_addon_description', 'Lock this mini program so that team members can interact with it by entering a pin code.')"
                      :link="`tommy://lock?addon=${addonConfig.package}&showmenu=true`">

        </f7-list-item>
      </f7-list>


    </f7-page-content>
  </f7-page>
</template>

<script>
import addonConfig from "../addonConfig";

export default {
  name: "settings",
  data() {
    return {
      addonConfig,
    };
  },
}
</script>

<style scoped>

</style>

