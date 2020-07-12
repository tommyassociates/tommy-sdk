<template>
  <f7-page id="example__index">
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

                    <div class="profile-header-cover__photo-name-container ">
                      <circle-avatar :size="74" :url="$root.team.icon_url"></circle-avatar>
                    </div>
                    <input type="file" id="photochangefile" ref="photochangefile" @change="onPhotoChangeOnNonCordovaDevice()">
                  </div>
                </div>


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
                <div style="border:1px solid #ccc; background: #e6e6e6; width: 104px; height: 50px;"></div>
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
  import circleAvatar from 'tommy-core/src/components/circle-avatar';
  import photoChanger from '../utils/photo-changer';

  export default {
    components: {
      circleAvatar
    },
    data() {
      return {
      };
    },
    methods: {
      changeProfilePicture() {
        const self = this;
        if (!self.allowChangePicture) return;
        photoChanger.init({
          url: 'team',
          f7: self.$f7,
          success(response) {
            if (response.icon_url) {
              if (self.$root.account.icon_url) {
                self.$root.team.icon_url = response.icon_url;
              }
              self.$root.updateAccount();
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
              if (self.$root.account.icon_url) {
                self.$root.team.icon_url = response.icon_url;
              }
              self.$root.updateAccount();
            }
          },
        });
        photoChanger.upload(self.$refs.photochangefile.files[0]);
      }
    },
  };
</script>
