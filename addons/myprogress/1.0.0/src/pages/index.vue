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
          <div class="myprogress-item-label" @click="nationalIdOpened = true">{{$t('myprogress.points.national_id')}}</div>
          <div class="myprogress-item-uploads" v-if="items.national_id.files">
            <div
              v-for="(file, index) in items.national_id.files"
              :key="index"
              :style="`background-image: url(${file})`"
              class="myprogress-item-upload"
              @click="previewImage(file, $event)"
            >
              <span class="myprogress-item-delete" @click="deleteImage('national_id', file)"></span>
            </div>
          </div>
          <a href="#" v-if="!items.national_id.checked" class="myprogress-button" @click="nationalIdOpened = true">{{$t('myprogress.index.upload')}}</a>
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
          <div class="myprogress-item-label" @click="profilePhotoOpened = true">{{$t('myprogress.points.profile_photo')}}</div>
          <div class="myprogress-item-uploads" v-if="items.profile_photo.files">
            <div
              v-for="(file, index) in items.profile_photo.files"
              :key="index"
              :style="`background-image: url(${file})`"
              class="myprogress-item-upload"
              @click="previewImage(file, $event)"
            >
              <span class="myprogress-item-delete" @click="deleteImage('profile_photo', file)"></span>
            </div>
          </div>
          <a href="#" v-if="!items.profile_photo.checked" class="myprogress-button" @click="profilePhotoOpened = true">{{$t('myprogress.index.upload')}}</a>
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
          <div class="myprogress-item-label" @click="healthCertOpened = true">{{$t('myprogress.points.health_cert')}}</div>
          <div class="myprogress-item-uploads" v-if="items.health_cert.files">
            <div
              v-for="(file, index) in items.health_cert.files"
              :key="index"
              :style="`background-image: url(${file})`"
              class="myprogress-item-upload"
              @click="previewImage(file, $event)"
            >
              <span class="myprogress-item-delete" @click="deleteImage('health_cert', file)"></span>
            </div>
          </div>
          <a href="#" v-if="!items.health_cert.checked" class="myprogress-button" @click="healthCertOpened = true">{{$t('myprogress.index.upload')}}</a>
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
          <div class="myprogress-item-label" @click="addressOpened = true">{{$t('myprogress.points.address')}}</div>
          <div class="myprogress-item-data" v-if="items.address.city && items.address.address">
            <div>{{items.address.city}} {{items.address.address}}</div>
            <div v-if="items.address.size">{{$t(`myprogress.upload.address_size_${items.address.size}`)}}</div>
          </div>
          <a href="#" v-if="!items.address.checked" class="myprogress-button" @click="addressOpened = true">{{$t('myprogress.index.fill_address')}}</a>
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
          <div class="myprogress-item-label" @click="residentialPermitOpened = true">{{$t('myprogress.points.residential_permit')}}</div>
          <div class="myprogress-item-uploads" v-if="items.residential_permit.files">
            <div
              v-for="(file, index) in items.residential_permit.files"
              :key="index"
              :style="`background-image: url(${file})`"
              class="myprogress-item-upload"
              @click="previewImage(file, $event)"
            >
              <span class="myprogress-item-delete" @click="deleteImage('residential_permit', file)"></span>
            </div>
          </div>
          <a href="#" v-if="!items.residential_permit.checked" class="myprogress-button" @click="residentialPermitOpened = true">{{$t('myprogress.index.upload')}}</a>
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
      @uploaded="updateUploaded('profile_photo', $event)"
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
      @uploaded="updateUploaded('health_cert', $event)"
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
      @uploaded="updateUploaded('national_id', $event)"
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
      @uploaded="updateUploaded('residential_permit', $event)"
      @closed="residentialPermitOpened = false"
    ></UploadPopup>

    <AddressPopup
      v-if="addressOpened"
      slot="fixed"
      :cityInitial="items.address.city"
      :addressInitial="items.address.address"
      :sizeInitial="items.address.size"
      @save="saveAddress"
      @closed="addressOpened = false"
    ></AddressPopup>
  </f7-page>
</template>
<script>
  import API from '../api';
  import UploadPopup from './upload-popup.vue';
  import AddressPopup from './address-popup.vue';

  export default {
    components: {
      UploadPopup,
      AddressPopup,
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
        addressOpened: false,
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
      deleteImage(key, file) {
        const self = this;
        const filesLength = self.items[key].files.length;
        self.items[key].files.splice(self.items[key].files.indexOf(file), 1);
        const newFilesLength = self.items[key].files.length;
        if (newFilesLength === 0 || (newFilesLength === 1 && filesLength === 2)) self.items[key].checked = false;
        self.saveData();
      },
      previewImage(url, event) {
        const self = this;
        if (self.$$(event.target).closest('.myprogress-item-delete').length) {
          return;
        }
        let pb = self.$f7.photoBrowser.create({
          photos: [url],
          toolbar: false,
          backLinkText: self.$t('label.back'),
          type: 'standalone',
          renderNavbar() {
            return `
              <div class="navbar">
                <div class="navbar-inner sliding">
                  <div class="left">
                    <a href="#" class="link popup-close" data-popup=".photo-browser-popup">
                      <i class="icon icon-back"></i>
                      <span>${self.$t('label.back')}</span>
                    </a>
                  </div>
                  <div class="right"></div>
                </div>
              </div>
            `;
          },
        });
        pb.once('closed', () => {
          setTimeout(() => {
            pb.destroy();
            pb = null;
          });
        });
        pb.open();
      },
      toggleItem(item) {
        const self = this;
        self.items[item].checked = !self.items[item].checked;
        self.saveData();
      },
      updateUploaded(key, files) {
        const self = this;
        self.items[key].checked = true;
        self.items[key].files = files.map((f) => {
          return `${self.$config.cdnUrl}/${f.signed_id}/${f.filename}`;
        });
        self.saveData();
      },
      saveAddress({ city, address, size }) {
        const self = this;
        self.items.address.checked = true;
        self.items.address.city = city;
        self.items.address.address = address;
        self.items.address.size = size;
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

