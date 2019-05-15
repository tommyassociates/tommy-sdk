<template>
  <f7-page class="myprogress-page myprogress-home-page">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{$t('myprogress.index.title')}}</f7-nav-title>
    </f7-navbar>

    <f7-progressbar class="myprogress-progressbar" slot="static" :progress="itemsProgress" v-if="items"/>

    <div class="myprogress-progress" v-if="items">{{itemsProgressCount}}/10</div>

    <div class="myprogress-list" v-if="items">
      <div class="myprogress-list-item">
        <div class="myprogress-item-number">1.</div>
        <div class="myprogress-item-content">
          <div class="myprogress-item-label">{{$t('myprogress.points.training')}}</div>

        </div>
        <div class="myprogress-item-checkbox">
          <label class="myprogress-checkbox" :class="{ disabled: isNurse }">
            <input type="checkbox" :checked="items.training.checked" @change="toggleItem('training')">
            <i></i>
          </label>
        </div>
      </div>
      <div class="myprogress-list-item">
        <div class="myprogress-item-number">2.</div>
        <div class="myprogress-item-content">
          <div class="myprogress-item-label">{{$t('myprogress.points.national_id')}}</div>
          <a href="#" class="myprogress-button" @click="nationalIdOpened = true">{{$t('myprogress.index.upload')}}</a>
        </div>
        <div class="myprogress-item-checkbox">
          <label class="myprogress-checkbox" :class="{ disabled: isNurse }">
            <input type="checkbox" :checked="items.national_id.checked" @change="toggleItem('national_id')">
            <i></i>
          </label>
        </div>
      </div>
      <div class="myprogress-list-item">
        <div class="myprogress-item-number">3.</div>
        <div class="myprogress-item-content">
          <div class="myprogress-item-label">{{$t('myprogress.points.profile_photo')}}</div>
          <a href="#" class="myprogress-button" @click="profilePhotoOpened = true">{{$t('myprogress.index.upload')}}</a>
        </div>
        <div class="myprogress-item-checkbox">
          <label class="myprogress-checkbox" :class="{ disabled: isNurse }">
            <input type="checkbox" :checked="items.profile_photo.checked" @change="toggleItem('profile_photo')">
            <i></i>
          </label>
        </div>
      </div>
      <div class="myprogress-list-item">
        <div class="myprogress-item-number">4.</div>
        <div class="myprogress-item-content">
          <div class="myprogress-item-label">{{$t('myprogress.points.health_cert')}}</div>
          <a href="#" class="myprogress-button" @click="healthCertOpened = true">{{$t('myprogress.index.upload')}}</a>
        </div>
        <div class="myprogress-item-checkbox">
          <label class="myprogress-checkbox" :class="{ disabled: isNurse }">
            <input type="checkbox" :checked="items.health_cert.checked" @change="toggleItem('health_cert')">
            <i></i>
          </label>
        </div>
      </div>
      <div class="myprogress-list-item">
        <div class="myprogress-item-number">5.</div>
        <div class="myprogress-item-content">
          <div class="myprogress-item-label">{{$t('myprogress.points.address')}}</div>
          <a href="#" class="myprogress-button">{{$t('myprogress.index.fill_address')}}</a>
        </div>
        <div class="myprogress-item-checkbox">
          <label class="myprogress-checkbox" :class="{ disabled: isNurse }">
            <input type="checkbox" :checked="items.address.checked" @change="toggleItem('address')">
            <i></i>
          </label>
        </div>
      </div>
      <div class="myprogress-list-item">
        <div class="myprogress-item-number">6.</div>
        <div class="myprogress-item-content">
          <div class="myprogress-item-label">{{$t('myprogress.points.residential_permit')}}</div>
          <a href="#" class="myprogress-button" @click="residentialPermitOpened = true">{{$t('myprogress.index.upload')}}</a>
        </div>
        <div class="myprogress-item-checkbox">
          <label class="myprogress-checkbox" :class="{ disabled: isNurse }">
            <input type="checkbox" :checked="items.residential_permit.checked" @change="toggleItem('residential_permit')">
            <i></i>
          </label>
        </div>
      </div>
      <div class="myprogress-list-item">
        <div class="myprogress-item-number">7.</div>
        <div class="myprogress-item-content">
          <div class="myprogress-item-label">{{$t('myprogress.points.approval')}} <span class="myprogress-pending-label" v-if="isPendingApproval">({{$t('myprogress.index.pending')}})</span></div>
        </div>
        <div class="myprogress-item-checkbox">
          <label class="myprogress-checkbox" :class="{ disabled: isNurse }">
            <input type="checkbox" :checked="items.approval.checked" @change="toggleItem('approval')">
            <i></i>
          </label>
        </div>
      </div>
      <div class="myprogress-list-item">
        <div class="myprogress-item-number">8.</div>
        <div class="myprogress-item-content">
          <div class="myprogress-item-label">{{$t('myprogress.points.sign_contract')}}</div>
        </div>
        <div class="myprogress-item-checkbox">
          <label class="myprogress-checkbox" :class="{ disabled: isNurse }">
            <input type="checkbox" :checked="items.sign_contract.checked" @change="toggleItem('sign_contract')">
            <i></i>
          </label>
        </div>
      </div>
      <div class="myprogress-list-item">
        <div class="myprogress-item-number">9.</div>
        <div class="myprogress-item-content">
          <div class="myprogress-item-label">{{$t('myprogress.points.receive_tuome_bag')}}</div>
        </div>
        <div class="myprogress-item-checkbox">
          <label class="myprogress-checkbox" :class="{ disabled: isNurse }">
            <input type="checkbox" :checked="items.receive_tuome_bag.checked" @change="toggleItem('receive_tuome_bag')">
            <i></i>
          </label>
        </div>
      </div>
      <div class="myprogress-list-item">
        <div class="myprogress-item-number">10.</div>
        <div class="myprogress-item-content">
          <div class="myprogress-item-label">{{$t('myprogress.points.the_first_job')}}</div>
        </div>
        <div class="myprogress-item-checkbox">
          <label class="myprogress-checkbox" :class="{ disabled: isNurse }">
            <input type="checkbox" :checked="items.the_first_job.checked" @change="toggleItem('the_first_job')">
            <i></i>
          </label>
        </div>
      </div>
    </div>

    <UploadPopup
      v-if="profilePhotoOpened"
      slot="fixed"
      :title="$t('myprogress.upload.profile_photo_title')"
      :intro="$t('myprogress.upload.profile_photo_intro')"
      :reminder="$t('myprogress.upload.profile_photo_reminder')"
      :reminderImageSrc="`${$addonAssetsUrl}/reminder_profile_photo.png`"
      :uploadText="$t('myprogress.upload.profile_photo_upload_text')"
      @closed="profilePhotoOpened = false"
    ></UploadPopup>

    <UploadPopup
      v-if="healthCertOpened"
      slot="fixed"
      :title="$t('myprogress.upload.health_cert_title')"
      :intro="$t('myprogress.upload.health_cert_intro')"
      :reminder="$t('myprogress.upload.health_cert_reminder')"
      :reminderImageSrc="`${$addonAssetsUrl}/reminder_health_cert.png`"
      :uploadText="$t('myprogress.upload.health_cert_upload_text')"
      :multipleUpload="true"
      @closed="healthCertOpened = false"
    ></UploadPopup>

    <UploadPopup
      v-if="nationalIdOpened"
      slot="fixed"
      :title="$t('myprogress.upload.national_id_title')"
      :intro="$t('myprogress.upload.national_id_intro')"
      :reminder="$t('myprogress.upload.national_id_reminder')"
      :reminderImageSrc="`${$addonAssetsUrl}/reminder_national_id.png`"
      :uploadText="$t('myprogress.upload.national_id_upload_text')"
      :multipleUpload="true"
      @closed="nationalIdOpened = false"
    ></UploadPopup>

    <UploadPopup
      v-if="residentialPermitOpened"
      slot="fixed"
      :title="$t('myprogress.upload.residential_permit_title')"
      :intro="$t('myprogress.upload.residential_permit_intro')"
      :reminder="$t('myprogress.upload.residential_permit_reminder')"
      :reminderImageSrc="`${$addonAssetsUrl}/reminder_residential_permit.png`"
      :uploadText="$t('myprogress.upload.residential_permit_upload_text')"
      :multipleUpload="true"
      @closed="residentialPermitOpened = false"
    ></UploadPopup>
  </f7-page>
</template>
<script>
  import API from '../api';
  import UploadPopup from './upload-popup.vue';

  export default {
    components: {
      UploadPopup,
    },
    data() {
      return {
        fragment: null,
        items: null,
        actorId: this.$f7route.query.actor_id,

        profilePhotoOpened: false,
        healthCertOpened: false,
        residentialPermitOpened: false,
        nationalIdOpened: false,
      };
    },
    computed: {
      isPendingApproval() {
        const self = this;
        const isPending = self.itemsProgressCount === 6 && (
          self.items.training.checked
          && self.items.national_id.checked
          && self.items.profile_photo.checked
          && self.items.health_cert.checked
          && self.items.address.checked
          && self.items.residential_permit.checked
        );
        return isPending;
      },
      itemsProgress() {
        return this.itemsProgressCount / 10 * 100;
      },
      itemsProgressCount() {
        return Object.keys(this.items).filter((key) => {
          return this.items[key].checked === true;
        }).length;
      },
      isNurse() {
        const self = this;
        if (self.$root.user && self.$root.user.onboarding === 'job') return true;
        if (self.$root.account && (self.$root.account.kind === 'Nurse' || self.$root.account.roles.indexOf('Nurse') >= 0)) return true;
        return false;
      },
    },
    mounted() {
      this.getData();
    },
    methods: {
      toggleItem(item) {
        const self = this;
        self.items[item].checked = !self.items[item].checked;
        self.saveData();
      },
      saveData() {
        const self = this;
        const f = self.fragment;
        f.data.items = self.items;
        API.saveData(self.actorId || self.$root.user.id, f).then((res) => {
          if (res && res.id) {
            self.fragment = res;
          }
        });
      },
      getData() {
        const self = this;
        API.getData(self.actorId || self.$root.user.id).then((data) => {
          if (!data.length) {
            self.items = {
              training: {
                checked: false,
              },
              national_id: {
                checked: false,
              },
              profile_photo: {
                checked: false,
              },
              health_cert: {
                checked: false,
              },
              address: {
                checked: false,
              },
              residential_permit: {
                checked: false,
              },
              approval: {
                checked: false,
              },
              sign_contract: {
                checked: false,
              },
              receive_tuome_bag: {
                checked: false,
              },
              the_first_job: {
                checked: false,
              },
            };
            self.fragment = {
              data: {
                items: self.items,
              },
            };
          } else {
            self.fragment = data[0];
            self.items = self.fragment.data.items;
          }
        });
      },
    },
  };
</script>

