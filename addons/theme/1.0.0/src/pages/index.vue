<template>
  <f7-page id="theme__index">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{$t('theme.index.title')}}</f7-nav-title>
      <f7-nav-right></f7-nav-right>
    </f7-navbar>

    <f7-page-content>
      <f7-row no-gap align="top">
        <f7-col width="100" tablet-width="50">
          <f7-block strong inset>
            <f7-block-header>{{$t('theme.index.profile_icon.title')}}</f7-block-header>

            <f7-row>
              <f7-col width="40" :class="'col--icon'">
                <div v-if="!$device.cordova">
                  <div class="profile-image--with-file-input">

                    <div class="">
                      <a href="#" @click="deleteIconImage" class="profile-image__delete-button"
                         v-if="$root.team.icon_url !== ''">
                        <delete-icon/>
                      </a>
                      <circle-avatar :size="74" :url="$root.team.icon_url"></circle-avatar>
                    </div>
                    <input type="file" id="photochangefile" ref="photochangefile"
                           @change="onPhotoChangeOnNonCordovaDevice()">
                  </div>
                </div>

                <a href="#" @click="deleteIconImage" class="profile-image__delete-button"
                   v-if="$device.cordova && $root.team.icon_url !== ''">
                  <delete-icon/>
                </a>
                <a id="change-profile-picture" class="item-link list-button" href="#" @click="changeProfilePicture"
                   v-if="$device.cordova">
                  <circle-avatar :size="74" :url="$root.team.icon_url"></circle-avatar>
                </a>


              </f7-col>
              <f7-col width="60" :class="'col--icon-description'">
                {{$t('theme.index.profile_icon.summary')}}
              </f7-col>
            </f7-row>

          </f7-block>
        </f7-col>
        <f7-col width="100" tablet-width="50">
          <f7-block strong inset>
            <f7-block-header>{{$t('theme.index.background_image.title')}}</f7-block-header>
            <f7-row>
              <f7-col width="40" :class="'col--bg-icon'">

                <div v-if="!$device.cordova">
                  <div class="profile-background--with-file-input">

                    <div class="">
                      <a href="#" @click="deleteBackground" class="profile-background__delete-button"
                         v-if="$root.team.background_url !== ''">
                        <delete-icon/>
                      </a>
                      <div class="profile-background__preview" :style="profileBackgroundPreviewStyles"></div>
                    </div>
                    <input type="file" id="photobackgrondfile" ref="photobackgrondfile"
                           @change="onBackgroundChangeOnNonCordovaDevice()">
                  </div>
                </div>

                <a href="#" @click="deleteBackground" class="profile-backgrond__delete-button"
                   v-if="$device.cordova && $root.team.background_url !== ''">
                  <delete-icon/>
                </a>
                <a id="change-profile-background" class="item-link list-button" href="#"
                   @click="changeProfileBackground"
                   v-if="$device.cordova">
                  <div class="profile-background__preview" :style="profileBackgroundPreviewStyles"></div>
                </a>


              </f7-col>
              <f7-col width="60" :class="'col--bg-icon-description'">
                {{$t('theme.index.background_image.summary')}}
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
  import circleAvatar from 'tommy-core/src/components/circle-avatar';
  import photoChanger from '../utils/photo-changer';
  import deleteIcon from '../components/icons/delete-icon';
  import dialog from 'tommy-core/src/mixins/dialog.vue';

  export default {
    components: {
      circleAvatar,
      deleteIcon,
    },
    data() {
      return {};
    },
    mixins: [dialog],
    computed: {
      profileBackgroundPreviewStyles() {
        const self = this;
        const backgroundImage = self.$root.team.background_url
          ? self.$root.team.background_url
          : `${self.$addonAssetsUrl}MenuBackgroundWithShadow.png`;

        const styles = {
          backgroundImage: `url(${backgroundImage})`,
        };

        return styles;
      },
    },
    methods: {
      changeProfilePicture() {
        const self = this;
        photoChanger.init({
          url: 'team',
          f7: self.$f7,
          success(response) {
            if (response.icon_url) {
              // if (self.$root.account.icon_url) {
                self.$root.team.icon_url = response.icon_url;
              // }
              // self.$root.updateAccount();
            }
          },
        });
        photoChanger.openMenu();
      },

      /**
       * This is for use by iPhone. We need to use a hidden <input type="file"> to have access to the camera.
       */
      onPhotoChangeOnNonCordovaDevice() {
        const self = this;
        photoChanger.init({
          url: 'team',
          f7: self.$f7,
          success(response) {
            if (response.icon_url) {
              // if (self.$root.account.icon_url) {
                self.$root.team.icon_url = response.icon_url;
              // }
              // self.$root.updateAccount();
            }
          },
        });
        photoChanger.upload(self.$refs.photochangefile.files[0]);
      },

      deleteIconImage() {
        const self = this;

        self.confirmDialog(
          false,
          self.$t("theme.index.profile_icon.delete_confirmation_message"),
          self.$t("theme.index.profile_icon.confirm_button"),
          self.$t("theme.index.profile_icon.cancel_button"),
          () => {
            API.deleteIconImage().then(() => {
              self.$root.team.icon_url = '';
            });
          },
          null,
          null,
          true,
          false
        );
      },


      changeProfileBackground() {
        const self = this;
        photoChanger.init({
          url: 'team',
          f7: self.$f7,
          success(response) {
            if (response.background_url) {
              // if (self.$root.account.background_url) {
                self.$root.team.background_url = response.background_url;
              // }
              // self.$root.updateAccount();
            }
          },
        });
        photoChanger.openMenu();
      },

      /**
       * This is for use by iPhone. We need to use a hidden <input type="file"> to have access to the camera.
       */
      onBackgroundChangeOnNonCordovaDevice() {
        const self = this;
        photoChanger.init({
          url: 'team',
          f7: self.$f7,
          param: 'background',
          filename: 'backgroundimage.jpg',
          success(response) {
            console.log('onPhotoChangeOnNonCordovaDevice response', response);

            if (response.background_url) {
              // if (self.$root.account.background_url) {
                self.$root.team.background_url = response.background_url;
              // }
              // self.$root.updateAccount();
            }
          },
        });
        console.log('onPhotoChangeOnNonCordovaDevice', self.$refs.photobackgrondfile, self.$refs.photobackgrondfile.files);

        photoChanger.upload(self.$refs.photobackgrondfile.files[0]);
      },

      deleteBackground() {
        const self = this;

        self.confirmDialog(
          false,
          self.$t("theme.index.background_image.delete_confirmation_message"),
          self.$t("theme.index.background_image.confirm_button"),
          self.$t("theme.index.background_image.cancel_button"),
          () => {
            API.deleteBackground().then(() => {
              self.$root.team.background_url = '';
            });
          },
          null,
          null,
          true,
          false
        );
      },
    },

  };
</script>
