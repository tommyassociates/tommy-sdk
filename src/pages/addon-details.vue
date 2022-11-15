<template>
  <f7-page id="addon-details">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>
        {{ addon.title }}
      </f7-nav-title>
    </f7-navbar>
    <f7-block-title> Details</f7-block-title>
    <f7-list>
      <f7-list-item
        header="Name"
        :title="`${addon.title} (${addon.package})`"
      >
      </f7-list-item>
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
    </f7-list>
    <div id="addon-details-sandbox" v-if="remoteFetched">
      <f7-block-title> Sandbox Testing</f7-block-title>
      <f7-list>
        <f7-list-item header="Status" :title="addonStatus()">
        </f7-list-item>
        <f7-list-item
          v-if="addonData.updated_at"
          header="Updated At"
          :title="addonData.updated_at"
        >
        </f7-list-item>
        <f7-list-item
          header="Server"
          title="China"
          v-if="isChinaServer"
        >

          <svg style="max-width: 50px" version="1.1" xmlns="http://www.w3.org/2000/svg"
               xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
               viewBox="0 0 15000 10000" enable-background="new 0 0 15000 10000" xml:space="preserve">

            <g id="Layer_2">
	<rect fill="#DC2F27" width="15000" height="10000"/>
              <path id="path3374_1_" fill="#FEDC00" d="M4623.2,671.7l187,311.5l-238.6,274.1l354.1-81.5l186.9,311.5l32-361.9l354-81.5
		l-334.3-142.1l31.8-362l-238.5,274.1L4623.2,671.7z"/>
              <path id="path3433_1_" fill="#FEDC00" d="M2500.2,1000l-336.5,1036.5l-1090.2,0l881.8,640.7l-336.7,1036.3l881.9-640.4l881.6,640.3
		l-336.8-1036.1l881.6-641l-1090,0.3L2500.2,1000z"/>
              <path id="path3447_1_" fill="#FEDC00" d="M5780.4,1551.2l51.5,359.5l-326.2,160l357.9,62.3l51.4,359.5l169.9-321.1l357.8,62.2
		L6189.7,1973l169.7-321.2l-326.1,160.1L5780.4,1551.2z"/>
              <path id="path3453_1_" fill="#FEDC00" d="M5176.9,4032.2L4950,4315.9l-340-128.2l199.6,303.5l-226.9,283.6l350.3-96l199.6,303.3
		l16.8-362.7l350.3-96.2L5160,4395.1L5176.9,4032.2z"/>
              <path id="path3475_1_" fill="#FEDC00" d="M5982.6,3000.3l-99.7,349.3l-363.2,13l301.4,202.9l-99.8,349.2l286.1-223.9l301.3,202.7
		l-124.6-341.1l286-224.1l-363.1,13.1L5982.6,3000.3z"/>
</g>
</svg>
        </f7-list-item>
        <f7-list-item
          header="Server"
          title="Tommy"
          v-if="isIntlServer"
        >
          <svg
            xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
            xmlns="http://www.w3.org/2000/svg"
            xmlns:cc="http://web.resource.org/cc/"
            xmlns:xlink="http://www.w3.org/1999/xlink"
            xmlns:dc="http://purl.org/dc/elements/1.1/"
            id="svg1"
            viewBox="0 0 1000 500"
            version="1"
            y="0"
            x="0"
            style="max-width:50px"
          >
            <g
              id="g602"
              transform="scale(8.3333)"
            >
              <rect
                id="rect124"
                style="stroke-width:1pt;fill:#000066"
                height="60"
                width="120"
                y="0"
                x="0"
              />
              <g
                id="g584"
              >
                <path
                  id="path146"
                  style="stroke-width:1pt;fill:#ffffff"
                  d="m0 0v3.3541l53.292 26.646h6.708v-3.354l-53.292-26.646h-6.708zm60 0v3.354l-53.292 26.646h-6.708v-3.354l53.292-26.646h6.708z"
                />
                <path
                  id="path136"
                  style="stroke-width:1pt;fill:#ffffff"
                  d="m25 0v30h10v-30h-10zm-25 10v10h60v-10h-60z"
                />
                <path
                  id="path141"
                  style="stroke-width:1pt;fill:#cc0000"
                  d="m0 12v6h60v-6h-60zm27-12v30h6v-30h-6z"
                />
                <path
                  id="path150"
                  style="stroke-width:1pt;fill:#cc0000"
                  d="m0 30l20-10h4.472l-20 10h-4.472zm0-30l20 10h-4.472l-15.528-7.7639v-2.2361zm35.528 10l20-10h4.472l-20 10h-4.472zm24.472 20l-20-10h4.472l15.528 7.764v2.236z"
                />
              </g
              >
              <polygon
                id="polygon589"
                style="fill-rule:evenodd;stroke-width:1pt;fill:#ffffff"
                points="30 36 31.736 41.396 37.036 39.389 33.9 44.11 38.774 47.003 33.127 47.494 33.905 53.109 30 49 26.095 53.109 26.873 47.494 21.226 47.003 26.1 44.11 22.964 39.389 28.264 41.396"
              />
              <g
                id="g596"
              >
                <polygon
                  id="polygon590"
                  style="fill-rule:evenodd;stroke-width:1pt;fill:#ffffff"
                  points="90 45.714 90.826 48.284 93.351 47.328 91.857 49.576 94.178 50.954 91.489 51.188 91.86 53.861 90 51.905 88.14 53.861 88.511 51.188 85.822 50.954 88.143 49.576 86.649 47.328 89.174 48.284"
                />
                <polygon
                  id="polygon592"
                  style="fill-rule:evenodd;stroke-width:1pt;fill:#ffffff"
                  points="90 5.7143 90.826 8.2839 93.351 7.3279 91.857 9.5762 94.178 10.954 91.489 11.188 91.86 13.861 90 11.905 88.14 13.861 88.511 11.188 85.822 10.954 88.143 9.5762 86.649 7.3279 89.174 8.2839"
                />
                <polygon
                  id="polygon593"
                  style="fill-rule:evenodd;stroke-width:1pt;fill:#ffffff"
                  points="75 21.964 75.826 24.534 78.351 23.578 76.857 25.826 79.178 27.204 76.489 27.438 76.86 30.111 75 28.155 73.14 30.111 73.511 27.438 70.822 27.204 73.143 25.826 71.649 23.578 74.174 24.534"
                />
                <polygon
                  id="polygon594"
                  style="fill-rule:evenodd;stroke-width:1pt;fill:#ffffff"
                  points="103.33 17.964 104.16 20.534 106.68 19.578 105.19 21.826 107.51 23.204 104.82 23.438 105.19 26.111 103.33 24.155 101.47 26.111 101.84 23.438 99.155 23.204 101.48 21.826 99.983 19.578 102.51 20.534"
                />
                <polygon
                  id="polygon595"
                  style="fill-rule:evenodd;stroke-width:1pt;fill:#ffffff"
                  points="96 30 96.653 31.601 98.378 31.728 97.057 32.843 97.47 34.522 96 33.611 94.53 34.522 94.943 32.843 93.622 31.728 95.347 31.601"
                />
              </g
              >
            </g
            >

          </svg
          >

        </f7-list-item>
      </f7-list>
      <f7-block>
        <template v-if="addonData.status">
          <p>
            <f7-button
              :disabled="addonData.deleting || addonData.updating"
              fill
              large
              class="yellow-button"
              @click="updateAddon"
            >
              {{
                addonData.updating
                  ? "Updating..."
                  : "Update on Sandbox"
              }}
            </f7-button>
          </p>
<!--          <p>-->
<!--            <f7-button-->
<!--              :disabled="addonData.deleting || addonData.updating"-->
<!--              fill-->
<!--              big-->
<!--              class="red-button"-->
<!--              @click="deleteAddon"-->
<!--            >-->
<!--              {{-->
<!--                addonData.deleting-->
<!--                  ? "Deleting..."-->
<!--                  : "Delete from Sandbox"-->
<!--              }}-->
<!--            </f7-button>-->
<!--          </p>-->
        </template>
        <template v-else>
          <p>
            <f7-button
              :disabled="addonData.uploading || addonData.updating"
              fill
              large
              class="red-button"
              @click="uploadAddon"
            >
              {{
                addonData.uploading
                  ? "Uploading..."
                  : "Upload Addon"
              }}
            </f7-button>
          </p>
        </template>
        <!-- <p>
          <f7-button
            :disabled="addonData.uploading || addonData.updating"
            fill
            large
            class="red-button"
            @click="uploadAddon"
          >
            {{
              addonData.uploading
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
import config from '../../config.json';

export default {
  props: {
    f7route: Object,
  },
  data() {
    const self = this;
    const pkg = self.f7route.params.package;
    const addon = self.$root.addons.filter((a) => a.package === pkg)[0];

    return {
      addon,
      addonData: {},
      remoteFetched: false,
    };
  },

  mounted() {
    const self = this;
    const {addon} = self;
    self.$api
      .getAddonVersion(addon.package, addon.version, {
        showErrorMessages: false,
      })
      .then((response) => {
        self.remoteFetched = true;
        self.addonData = response;
      })
      .catch(() => {
        self.remoteFetched = true;
      });
  },
  computed: {
    isChinaServer() {
      return config.apiEndpoint === 'https://api.tuome.com.cn';
    },
    isIntlServer() {
      return config.apiEndpoint === 'https://api.mytommy.com';
    }
  },
  methods: {
    addonStatus() {
      const self = this;
      const {status, deleting, uploading, updating} = self.addonData;
      if (status) {
        if (deleting) return "Deleting...";
        if (updating) return "Updating...";
        return "Installed";
      }
      if (uploading) return "Uploading...";
      return "Not installed";
    },
    uploadAddon() {
      const self = this;
      self.addonData.status = null;
      self.addonData.uploading = true;
      const {package: pkg, version} = self.addon;

      self.$request({
        url: `/addon/sandbox/upload/${pkg}/${version}`,
        method: "POST",
        dataType: "json",
        success(data) {
          self.addonData = data;
          self.addonData.uploading = false;
          self.$api.installAddon(pkg, {}, {});
          self.$app.notify(
            "Addon Uploaded",
            "Your addon uploaded successfully"
          );
        },
        error(xhr) {
          self.addonData.status = null;
          self.addonData.uploading = false;
          self.$app.notify(
            "Addon Upload Failed",
            `Your addon uploaded failed: ${xhr.responseText}`
          );
        },
      });
    },
    updateAddon() {
      const self = this;
      self.addonData.status = "Updating...";
      self.addonData.updating = true;
      const {package: pkg, version} = self.addon;
      self.$request({
        url: `/addon/sandbox/upload/${pkg}/${version}`,
        method: "POST",
        dataType: "json",
        success(data) {
          self.addonData = data;
          self.addonData.updating = false;
          self.$app.notify(
            "Addon Updated",
            "Your addon updated successfully"
          );
        },
        error(xhr) {
          self.addonData.status = null;
          self.addonData.updating = false;
          self.$app.notify(
            "Addon Update Failed",
            `Your addon update failed: ${xhr.responseText}`
          );
        },
      });
    },
    deleteAddon() {
      const self = this;
      self.addonData.status = "Deleting...";
      self.addonData.deleting = true;
      const {package: pkg, version} = self.addon;

      self.$api
        .deleteAddon(pkg, version, {url: window.SANDBOX_ENDPOINT})
        .then(() => {
          self.addonData.status = null;
          self.addonData.deleting = false;
          self.$app.notify(
            "Addon Uninstalled",
            "Addon uninstalled successfully"
          );
        })
        .catch((err) => {
          self.addonData.status = null;
          self.addonData.deleting = false;
          self.$app.notify(
            "Addon Error",
            `Addon uninstall failed: ${err}`
          );
        });
    },
  },
};
</script>
