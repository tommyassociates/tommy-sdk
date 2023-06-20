<template>
  <f7-page id="addon-details">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>
        {{ addon?.title }}
      </f7-nav-title>
    </f7-navbar>
    <f7-block-title>Details</f7-block-title>
    <f7-list v-if="addon">
      <f7-list-item
        header="Name"
        :title="`${addon.title} (${addon.package})`"
      >
      </f7-list-item>
      <!-- <f7-list-item header="Environment" :title="addon.environment">
      </f7-list-item> -->
      <f7-list-item header="Version" :title="addon.version">
      </f7-list-item>
      <f7-list-item header="Developer" :title="`${addon.developer}`">
        <template #title v-if="addon.homepage">
					<span>
						(
						<a
              :href="addon.homepage"
              class="external"
              target="_blank"
            >
							{{ addon.homepage }}
						</a>
						)
					</span>
        </template>
      </f7-list-item>
      <f7-list-item header="Summary" :title="addon.summary">
      </f7-list-item>
      <f7-list-item v-if="addon.private" header="Private" title="Yes">
      </f7-list-item>
    <!-- </f7-list>
    <div id="addon-details-sandbox" v-if="remoteFetched">
      <f7-block-title>Sandbox Testing</f7-block-title>
      <f7-list> -->
        <f7-list-item header="Status" :title="addonStatus">
        </f7-list-item>
        <f7-list-item
          v-if="remoteAddon.updated_at"
          header="Updated At"
          :title="remoteAddon.updated_at"
        >
        </f7-list-item>
      </f7-list>
    <!-- </div> -->

    <div id="addon-upload">
      <f7-block-title>Upload</f7-block-title>
      <f7-list class="list-form mb-16" outset>
        <div class="item-content item-input">
          <div class="item-inner">
            <div class="item-title item-label">
              <!-- item-label -->
              <!-- <div class="item-header"> -->
                Environment
              <!-- </div> -->
            </div>
            <div class="item-input-wrap">
              <select
                  class="input"
                  :disabled="remoteAddon.uploading || remoteAddon.updating"
                  v-model="environment"
                  @change="remoteAddon.status = $event.target.value"
              >
                <option v-for="env in environments" :value="env">{{ env }}</option>
              </select>
            </div>
          </div>
        </div>
      </f7-list>

      <f7-block>
        <template v-if="remoteAddon.status">
          <p>
            <f7-button
              :disabled="remoteAddon.deleting || remoteAddon.updating"
              fill
              large
              class="yellow-button"
              @click="updateAddon"
            >
              {{
                remoteAddon.updating
                  ? "Updating..."
                  : "Update on Sandbox"
              }}
            </f7-button>
          </p>
<!--          <p>-->
<!--            <f7-button-->
<!--              :disabled="remoteAddon.deleting || remoteAddon.updating"-->
<!--              fill-->
<!--              big-->
<!--              class="red-button"-->
<!--              @click="deleteAddon"-->
<!--            >-->
<!--              {{-->
<!--                remoteAddon.deleting-->
<!--                  ? "Deleting..."-->
<!--                  : "Delete from Sandbox"-->
<!--              }}-->
<!--            </f7-button>-->
<!--          </p>-->
        </template>
        <template v-else>
          <p>
            <f7-button
              :disabled="remoteAddon.uploading || remoteAddon.updating"
              fill
              large
              class="red-button"
              @click="uploadAddon"
            >
              {{
                remoteAddon.uploading
                  ? "Uploading..."
                  : "Upload Addon"
              }}
            </f7-button>
          </p>
        </template>
        <!-- <p>
          <f7-button
            :disabled="remoteAddon.uploading || remoteAddon.updating"
            fill
            large
            class="red-button"
            @click="uploadAddon"
          >
            {{
              remoteAddon.uploading
                ? "Uploading..."
                : "Upload Addon"
            }}
          </f7-button>
        </p> -->
      </f7-block>
    </div>
  </f7-page>
</template>
<script>

export default {
  props: {
    f7route: Object,
    pkg: {
      required: true
    },
    // environment: {
    //   required: true
    // }
  },
  data() {
    // const this = this;
    // const pkg = this.f7route.params.package;
    // const addon = this.$root.addons.filter((a) => a.package === pkg)[0];

    return {
      // pkg,
      // addon,
      environment: "development",
      environments: ["development", "beta", "production"],
      remoteAddon: {},
      remoteFetched: false,
    };
  },

  mounted() {
    // const {addon} = this;
    this.$api
      .getAddonVersion(this.pkg, 'production', {
        showErrorMessages: false,
      })
      .then((response) => {
        this.remoteFetched = true;
        this.remoteAddon = response;
      })
      .catch(() => {
        this.remoteFetched = true; // doesn't exist
      });
  },
  computed: {
    addon() {
      return this.$store.getters['addons/addonByPackage'](this.pkg); //, this.environment
    },
    addonStatus() {
      const {status, deleting, uploading, updating} = this.remoteAddon;
      if (status) {
        if (deleting) return "Deleting...";
        if (updating) return "Updating...";
        return "Installed";
      }
      if (uploading) return "Uploading...";
      return "Not installed";
    },
  },
  methods: {
    uploadAddon() {
      this.remoteAddon.status = null;
      this.remoteAddon.uploading = true;
      const { package: pkg, version } = this.addon;
      const { environment } = this;

      this.$request.send({
        url: `/addon/sandbox/upload/${pkg}/${environment}/${version}`,
        method: "POST",
        responseType: "json"
      }).then((data) => {
        this.remoteAddon = data;
        this.remoteAddon.uploading = false;
        this.$api.installAddon(pkg, { environment }, {});
        this.$app.notify(
          "Addon Uploaded",
          "Your addon uploaded successfully"
        );
      }).catch((err) => {
        console.log('sdk: upload addon error:', err);
        this.remoteAddon.status = null;
        this.remoteAddon.uploading = false;
        this.$app.notify(
          "Addon Upload Failed",
          err.message
        );
      });
    },
    updateAddon() {
      this.remoteAddon.status = "Updating...";
      this.remoteAddon.updating = true;
      const { package: pkg, version } = this.addon;
      const { environment } = this;

      this.$request.send({
        url: `/addon/sandbox/upload/${pkg}/${environment}/${version}`,
        method: "POST",
        responseType: "json"
      }).then((data) => {
        this.remoteAddon = data;
        this.remoteAddon.updating = false;
        this.$api.installAddon(pkg, { environment }, {});
        this.$app.notify(
          "Addon Updated",
          "Your addon updated successfully"
        );
      }).catch((err) => {
        console.log('sdk: update addon error:', err);
        this.remoteAddon.status = null;
        this.remoteAddon.updating = false;
        this.$app.notify(
          "Addon Update Failed",
          err.message
        );
      });
    },
    deleteAddon() {
      this.remoteAddon.status = "Deleting...";
      this.remoteAddon.deleting = true;
      const { package: pkg, version } = this.addon;
      const { environment } = this;

      this.$api
        .deleteAddon(pkg, environment, {url: window.SANDBOX_ENDPOINT})
        .then(() => {
          this.remoteAddon.status = null;
          this.remoteAddon.deleting = false;
          this.$app.notify(
            "Addon Uninstalled",
            "Addon uninstalled successfully"
          );
        })
        .catch((err) => {
          this.remoteAddon.status = null;
          this.remoteAddon.deleting = false;
          this.$app.notify(
            "Addon Delete Error",
            err.message
          );
        });
    },
  },
};
</script>
