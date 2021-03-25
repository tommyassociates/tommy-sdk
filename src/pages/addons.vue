<template>
	<f7-page>
		<f7-navbar>
			<tommy-nav-menu></tommy-nav-menu>
			<f7-nav-title> Addons </f7-nav-title>
			<f7-nav-right>
				<f7-link href="/settings/" icon-material="settings"></f7-link>
			</f7-nav-right>
		</f7-navbar>
		<!-- Main addons list -->
		<f7-block-title> Addons </f7-block-title>
		<f7-list media-list>
			<f7-list-item
				v-for="(addon, index) in $root.addons"
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
export default {};
</script>
