<template>
	<f7-page>
		<f7-navbar>
			<tommy-nav-menu></tommy-nav-menu>
			<f7-nav-title> Views </f7-nav-title>
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
		<!-- Main addons views list -->
		<f7-block-title> Views </f7-block-title>
    <f7-list>
      <template v-for="(addon, index) in addonsSorted" :key="index">
        <template v-if="addon.entry_path">
          <f7-list-item
            :link="addonUrl(addon)"
            :title="$t(`${addon.package}.title`, addon.title)"
            :after="addon.version"
          >
            <template #media>
              <img class="icon" width="29" :src="addon.icon_url"/>
            </template>
          </f7-list-item>
        </template>
      </template>
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
  methods: {
    addonUrl(addon) {
      const self = this;
      let url = addon.entry_path;
      if (self.$root.actorId) url += `?actor_id=${self.$root.actorId}`;
      return url;
    },
  },
  computed: {
    addonsSorted() {
      let addons = this.$store.state.addons.addonInstalls; //$root.addons;
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
