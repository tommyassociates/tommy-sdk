<template>
	<f7-page>
		<f7-navbar>
			<tommy-nav-menu></tommy-nav-menu>
			<f7-nav-title> Views </f7-nav-title>
			<f7-nav-right>
				<f7-link href="/settings/" icon-material="settings"></f7-link>
			</f7-nav-right>
		</f7-navbar>
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
	mounted() {},
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
			return this.$root.addons.sort((a, b) => a.title.localeCompare(b.title));
		}
	}
};
</script>
