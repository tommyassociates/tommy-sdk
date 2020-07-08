<template>
  <f7-page id="example__index">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{$t('mini_programs.index.title')}}</f7-nav-title>
      <f7-nav-right></f7-nav-right>
    </f7-navbar>

    <f7-page-content>

      <f7-row no-gap>
        <f7-col width="100">
          <f7-block strong inset>
            <p>{{$t('mini_programs.index.introduction')}} <a :href="$t('mini_programs.index.visit_link.url')"
                                                             target="_blank">
              {{$t('mini_programs.index.visit_link.text')}}
            </a></p>
          </f7-block>
        </f7-col>
      </f7-row>

      <f7-row no-gap v-if="loaded">

        <f7-col width="100" tablet-width="50" v-for="(addon, index) in addons" :key="`addon-${index}`">
          <f7-block strong inset>
            <f7-block-header>
              <f7-row>
                <f7-col width="80">{{ addon.title }}</f7-col>
                <f7-col width="20" align="right">
                  <f7-toggle :checked="addon.installed" @toggle:change="toggleAddon(addon)"></f7-toggle>
                </f7-col>
              </f7-row>
            </f7-block-header>
            <f7-row>
              <f7-col class="col--icon">
                <img :src="addon.icon_url" width="60">
              </f7-col>
              <f7-col class="col--icon-description">
                {{ addon.description }}
              </f7-col>
            </f7-row>

          </f7-block>
        </f7-col>
      </f7-row>
    </f7-page-content>
  </f7-page>
</template>
<script>
  import API from '../api';
  import dialog from "../mixins/dialog.vue";

  export default {
    components: {},
    data() {
      return {
        addons: [],
        loaded: false,
      };
    },
    mixins: [dialog],
    methods: {
      toggleAddon(addon) {
        console.log(addon);
        const self = this;
        if (addon.installed) {
          self.confirmDialog(
            false,
            self.$t("mini_programs.index.uninstall_addon_confirmation_message"),
            self.$t("mini_programs.index.confirm_button"),
            self.$t("mini_programs.index.cancel_button"),
            () => self.uninstallAddon(addon.package),
            () => self.cancelUninstall(addon),
            null,
            true,
            false
          );
        } else {
          self.installAddon(addon.package);
        }
      },
      cancelUninstall(addon) {
        console.log('candel delete');
        console.log(addon);
        addon.installed = true;
      },
      uninstallAddon(pkg) {
        console.log('delete');
        API.uninstallAddon(pkg).then(() => {
          API.getAddons().then(addons => {
            self.addons = addons.filter(addon => addon.private === false);
          });
        });
      },
      installAddon(pkg) {
        const self = this;
        const data = {
          token: self.$root.token,
        };
        API.installAddon(pkg, data).then(() => {
          API.getAddons().then(addons => {
            self.addons = addons.filter(addon => addon.private === false);
          });
        });
      },
    },
    mounted() {
      const self = this;
      API.getAddons().then(addons => {
        self.addons = addons.filter(addon => addon.private === false);
        self.loaded = true;
      });
    }
  };
</script>
