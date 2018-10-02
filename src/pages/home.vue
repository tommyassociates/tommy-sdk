<template>
  <f7-page>
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>Addons</f7-nav-title>
      <f7-nav-right>
        <f7-link href="/settings/" icon-material="settings"></f7-link>
      </f7-nav-right>
    </f7-navbar>


    <!-- Main addons list -->
    <f7-block-title>Addons</f7-block-title>
    <f7-list media-list>
      <f7-list-item
        v-for="(addon, index) in $root.addons"
        :key="index"
        :link="`/addon-details.html?package=${addon.package}}&version=${addon.version}`"
        :title="addon.title"
        :after="addon.version"
        :text="addon.summary"
      >
        <img slot="media" class="icon" width="80" :src="addon.icon_url" />
      </f7-list-item>
    </f7-list>

    <!-- Main addons views list -->
    <f7-block-title>Views</f7-block-title>
    <f7-list>
      <f7-list-item
        v-for="(addon, index) in $root.addons"
        :key="index"
        :link="addon.entry_path"
        :title="$t(`${addon.package}.title`, addon.title)"
        :after="addon.version"
      >
        <img slot="media" class="icon" width="29" :src="addon.icon_url" />
      </f7-list-item>
    </f7-list>
  </f7-page>
</template>
<script>
  export default {

  };
</script>

