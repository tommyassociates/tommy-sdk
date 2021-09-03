<template>
	<f7-page>
		<f7-navbar>
			<tommy-nav-menu></tommy-nav-menu>
			<f7-nav-title> Addons </f7-nav-title>
			<f7-nav-right>
				<f7-link href="/settings/" icon-material="settings"></f7-link>
			</f7-nav-right>
		</f7-navbar>
    <f7-input
      type="text"
      label="Search"
      v-model:value="search"
      style="margin: 20px; border:1px solid #999; padding: 8px;font-size:21px;"
    />
		<!-- Main addons list -->
		<f7-block-title> Addons </f7-block-title>
		<f7-list media-list>
			<f7-list-item
				v-for="(addon, index) in addonsSorted"
				:key="index"
				:link="`/addon-details/${addon.package}/`"
				:title="addon.title"
				:after="addon.version"
				:text="addon.summary"
			>
				<template #media>
					<img class="icon" width="80" :src="addon.icon_url" />
				</template>
			</f7-list-item>
		</f7-list>
	</f7-page>
</template>
<script>
export default {
  props: {
    f7router: Object,
  },
  data() {
    return {
      search: localStorage.tommy_addon_search,
    }
  },
  mounted() {
    // Alternative implementation of default 'starting_page'
    // by re-routing to desired starting_page.
    // this.f7router.navigate({ name: config.starting_page })
  },
  computed: {
    addonsSorted() {
      let addons = this.$root.addons;
      if (this.search) {
        addons = addons.filter((addon) => {
          const title = addon.title.toUpperCase();
          const desc = addon.description.toUpperCase();
          return title.includes(this.search.toUpperCase())
            || title.replace(' ', '').includes(this.search.toUpperCase())
            || desc.includes(this.search.toUpperCase());
        });
      }
      addons = addons.sort((a, b) => a.title.localeCompare(b.title));
      return addons;
    }
  },
  watch: {
    search: (value) => {
      localStorage.tommy_addon_search = value;
    },
  }
};
</script>
