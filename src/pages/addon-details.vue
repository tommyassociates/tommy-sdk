<template>
  <f7-page id="addon-details">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{addon.title}}</f7-nav-title>
    </f7-navbar>

    <f7-block-title>Details</f7-block-title>
    <f7-list>
      <f7-list-item
        header="Name"
        :title="`${addon.title} (${addon.package})`"
      ></f7-list-item>
      <f7-list-item
        header="Version"
        :title="addon.version"
      ></f7-list-item>
      <f7-list-item
        header="Developer"
        :title="`${addon.developer}`"
      >
        <span slot="title" v-if="addon.homepage"> (<a :href="addon.homepage" class="external" target="_blank">{{addon.homepage}}</a>)</span>
      </f7-list-item>
      <f7-list-item
        header="Summary"
        :title="addon.summary"
      ></f7-list-item>

      <f7-list-item
        v-if="addon.private"
        header="Private"
        title="Yes"
      ></f7-list-item>

    </f7-list>

    <div id="addon-details-sandbox" v-if="remoteFetched">
      <f7-block-title>Sandbox Testing</f7-block-title>

      <f7-list>
        <f7-list-item
          header="Status"
          :title="addonStatus()"
        ></f7-list-item>
        <f7-list-item
          v-if="addonData.updated_at"
          header="Updated At"
          :title="addonData.updated_at"
        ></f7-list-item>
      </f7-list>

      <f7-block>
        <template v-if="addonData.status">
          <p>
            <f7-button
              :disabled="addonData.deleting || addonData.updating"
              fill
              big
              @click="updateAddon"
            >{{addonData.updating ? 'Updating...' : 'Update on Sandbox'}}</f7-button>
          </p>
          <p>
            <f7-button
              :disabled="addonData.deleting || addonData.updating"
              fill
              big
              color="red"
              @click="deleteAddon"
            >{{addonData.deleting ? 'Deleting...' : 'Delete from Sandbox'}}</f7-button>
          </p>
        </template>
        <template v-else>
          <p>
            <f7-button
              :disabled="addonData.uploading"
              fill
              big
              @click="uploadAddon"
            >{{addonData.uploading ? 'Uploading...' : 'Upload to Sandbox'}}</f7-button>
          </p>
        </template>
        <p>
          <f7-button
            :disabled="addonData.uploading"
            fill
            big
            @click="uploadAddon"
          >{{addonData.uploading ? 'Uploading...' : 'Upload to Sandbox'}}</f7-button>
        </p>
      </f7-block>
    </div>
  </f7-page>
</template>
<script>
  export default {
    props: {
      f7route: Object
    },
    data() {
      const self = this;
      const pkg = self.f7route.params.package;
      const addon = self.$root.addons.filter(a => a.package === pkg)[0];

      return {
        addon,
        addonData: {},
        remoteFetched: false,
      };
    },

    mounted() {
      const self = this;
      const { addon } = self;
      self.$api
        .getAddonVersion(addon.package, addon.version, { showErrorMessages: false })
        .then((response) => {
          self.remoteFetched = true;
          self.addonData = response;
        })
        .catch(() => {
          self.remoteFetched = true;
        })
    },
    methods: {
      addonStatus() {
        const self = this;
        const { status, deleting, uploading, updating } = self.addonData;
        if (status) {
          if (deleting) return 'Deleting...';
          if (updating) return 'Updating...';
          return 'Installed';
        }
        if (uploading) return 'Uploading...';
        return 'Not installed';
      },
      uploadAddon() {
        const self = this;
        self.addonData.status = null;
        self.addonData.uploading = true;
        const { package: pkg, version } = self.addon;

        self.$request({
          url: `/addon/sandbox/upload/${pkg}/${version}`,
          method: 'POST',
          dataType: 'json',
          success(data) {
            self.addonData = data;
            self.addonData.uploading = false;
            self.$api.installAddon(pkg, {}, {})
            self.$app.notify(
              'Addon Uploaded',
              'Your addon uploaded successfully'
            )
          },
          error(xhr) {
            self.addonData.status = null;
            self.addonData.uploading = false;
            self.$app.notify(
              'Addon Upload Failed',
              `Your addon uploaded failed: ${xhr.responseText}`
            )
          },
        })
      },
      updateAddon() {
        const self = this;
        self.addonData.status = 'Updating...';
        self.addonData.updating = true;
        const { package: pkg, version } = self.addon;
        self.$request({
          url: `/addon/sandbox/upload/${pkg}/${version}`,
          method: 'POST',
          dataType: 'json',
          success(data) {
            self.addonData = data;
            self.addonData.updating = false;
            self.$app.notify(
              'Addon Updated',
              'Your addon updated successfully'
            )
          },
          error(xhr) {
            self.addonData.status = null;
            self.addonData.updating = false;
            self.$app.notify(
              'Addon Update Failed',
              `Your addon update failed: ${xhr.responseText}`
            )
          },
        })
      },
      deleteAddon() {
        const self = this;
        self.addonData.status = 'Deleting...';
        self.addonData.deleting = true;
        const { package: pkg, version } = self.addon;

        self.$api.deleteAddon(pkg, version, { url: window.SANDBOX_ENDPOINT })
          .then(() => {
            self.addonData.status = null;
            self.addonData.deleting = false;
            self.$app.notify(
              'Addon Uninstalled',
              'Addon uninstalled successfully'
            )
          })
          .catch((err) => {
            self.addonData.status = null;
            self.addonData.deleting = false;
            self.$app.notify(
              'Addon Error',
              `Addon uninstall failed: ${err}`
            )
          })
      },
    },
  };
</script>
