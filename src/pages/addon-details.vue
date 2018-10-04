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
          <p v-if="addonData.deleting">
            <f7-button fill big color="red" class="disabled">Deleting...</f7-button>
          </p>
          <p v-else>
            <f7-button fill big color="red" @click="deleteAddon">Delete from Sandbox</f7-button>
          </p>
        </template>
        <template v-else>
          <p v-if="addonData.uploading">
            <f7-button fill big class="disabled">Uploading...</f7-button>
          </p>
          <p v-else>
            <f7-button fill big @click="uploadAddon">Upload to Sandbox</f7-button>
          </p>
        </template>
      </f7-block>
    </div>
  </f7-page>
</template>
<script>
  export default {
    data() {
      const self = this;
      const pkg = self.$f7route.params.package;
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
        });
    },
    methods: {
      addonStatus() {
        const self = this;
        const { status, deleting, uploading } = self.addonData;
        if (status) {
          if (deleting) return 'Deleting...';
          return 'Installed';
        }
        if (uploading) return 'Uploading...';
        return 'Not installed';
      },
      uploadAddon() {
        const self = this;
        delete self.addonData.status;
        self.addonData.uploading = true;
        const { package: pkg, version } = self.addon;

        self.$request({
          url: `/addon/sandbox/upload/${pkg}/${version}`,
          method: 'POST',
          dataType: 'json',
          success(data) {
            self.addonData = data;
            self.$api.call({endpoint: `addons/${pkg}/install`, method: 'POST' });
            self.$app.notify(
              'Addon Uploaded',
              'Your addon uploaded successfully'
            );
          },
          error(xhr) {
            self.$app.notify(
              'Addon Upload Failed',
              `Your addon uploaded failed: ${xhr.responseText}`
            );
          },
        });
      },
      deleteAddon() {
        const self = this;
        self.addonData.status = 'Deleting...';
        self.addonData.deleting = true;
        const { package: pkg, version } = self.addon;

        self.$api.deleteAddonVersion(pkg, version, { url: window.SANDBOX_ENDPOINT })
          .then(() => {
            delete self.addonData.status;
            self.addonData.deleting = false;
            self.$app.notify(
              'Addon Uninstalled',
              'Addon uninstalled successfully'
            );
          })
          .catch((err) => {
            delete self.addonData.status;
            self.addonData.deleting = false;
            self.$app.notify(
              'Addon Error',
              `Addon uninstall failed: ${err}`
            );
          });
      },
    },
  };
</script>

