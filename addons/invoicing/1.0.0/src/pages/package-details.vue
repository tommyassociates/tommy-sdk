<template>
  <f7-page id="invoicing__package-details" data-name="invoicing__package-details" class="invoicing-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{pageTitle}}</f7-nav-title>
      <f7-nav-right>
        <f7-link v-if="showSave" @click="save" icon-f7="check"></f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-list class="list-custom" v-if="pkg">
      <f7-list-input
        :label="$t('invoicing.package.name_label', 'Name')"
        :placeholder="$t('invoicing.package.name_placeholder', 'Enter package/service name')"
        type="text"
        :value="pkg.name"
        @input="($event) => {pkg.name = $event.target.value; enableSave()}"
      ></f7-list-input>
      <f7-list-item
        :title="$t('invoicing.package.enabled_label', 'Enabled')"
      >
        <f7-toggle :checked="pkg.active" @change="($event) => {pkg.active = $event.target.checked; enableSave();}"></f7-toggle>
      </f7-list-item>
      <f7-list-item
        :title="$t('invoicing.package.photos_label', 'Photos')"
        :after="(pkg.photos && pkg.photos.length) || 'Not set'"
        link="#"
      ></f7-list-item>
      <!-- Description -->
      <f7-list-item divider :title="$t('invoicing.package.description_label', 'Description')"></f7-list-item>
      <f7-list-input
        :placeholder="$t('invoicing.package.description_placeholder', 'Enter package/service description')"
        type="textarea"
        resizable
        :value="pkg.description"
        @input="($event) => {pkg.description = $event.target.value; enableSave()}"
      ></f7-list-input>
      <!-- Packages -->
      <!-- <f7-list-item divider :title="$t('invoicing.package.packages_label', 'Packages')"></f7-list-item>
      <f7-list-item
        v-if="!pkg.packages || !pkg.packages.length"
        :title="$t('invoicing.package.packages_no_packages', 'No associated packages found')"
      ></f7-list-item>
      <f7-list-item
        v-if="pkg.packages && pkg.packages.length"
        v-for="pkg in pkg.packages"
        :key="pkg.id"
        :title="pkg.name"
        :link="`/invoicing/package-details/${pkg.id}/?title=${pkg.name}`"
      ></f7-list-item> -->
      <!-- Tags -->
      <tag-select
        slot="after-list"
        :data="{
          title: $t('invoicing.package.tags_label'),
          placeholder: $t('invoicing.common.search_members_tags', 'Search Members, Tags'),
          pageTitle: $t('invoicing.common.search_members_tags', 'Search Members, Tags'),
          filters: pkg.tags,
        }"
        @tagAdd="addPackageTag"
        @tagRemove="removePackageTag"
      ></tag-select>
    </f7-list>

    <!-- Price, Sku, Barcode -->
    <f7-list class="list-custom margin-top" v-if="pkg">
      <f7-list-input
        :label="$t('invoicing.package.price_label', 'Price')"
        :placeholder="$t('invoicing.package.price_placeholder', 'Enter package/service price')"
        type="text"
        :value="`¥${pkg.price}`"
        @input="setPrice($event.target.value)"
      ></f7-list-input>
      <f7-list-input
        :label="$t('invoicing.package.sku_label', 'SKU')"
        :placeholder="$t('invoicing.package.sku_placeholder', 'Enter package/service SKU')"
        type="text"
        :value="`${pkg.sku}`"
        @input="($event) => {pkg.sku = $event.target.value; enableSave()}"
      ></f7-list-input>
      <f7-list-input
        :label="$t('invoicing.package.barcode_label', 'Barcode ID')"
        :placeholder="$t('invoicing.package.barcode_placeholder', 'Enter package/service barcode ID')"
        type="text"
        :value="`${pkg.barcode}`"
        @input="($event) => {pkg.barcode = $event.target.value; enableSave()}"
      ></f7-list-input>
    </f7-list>


  </f7-page>
</template>
<script>
  import tagSelect from '../components/tag-select.vue';
  import API from '../api';

  export default {
    components: {
      tagSelect,
    },
    props: {
      id: [String, Number],
    },
    data() {
      const self = this;
      return {
        pageTitle: self.$f7route.query.title || self.$t('invoicing.package.new_title'),
        pkg: null,
        showSave: false,
      };
    },
    mounted() {
      const self = this;
      if (!self.id) {
        self.pkg = {
          name: '',
          description: '',
          active: false,
          photos: [],
          price: 0,
          sku: '',
          barcode: '',
          tags: [],
        };
        return;
      }
      API.loadPackage(self.id).then((pkg) => {
        self.pkg = pkg;
        self.pkg = {
          name: '',
          description: '',
          active: false,
          photos: [],
          price: 0,
          sku: '',
          barcode: '',
          tags: [],
        };
      });
    },
    methods: {
      setPrice(value) {
        const self = this;
        const newPrice = value.replace(/¥ /g, '').replace(/,/g, '.').trim();
        self.pkg.price = newPrice;
        self.enableSave();
      },
      enableSave() {
        const self = this;
        self.showSave = true;
      },
      addPackageTag(tag) {
        const self = this;
        self.pkg.tags.push(tag);
        self.enableSave();
      },
      removePackageTag(tag) {
        const self = this;
        self.pkg.tags.splice(self.pkg.tags.indexOf(tag), 1);
        self.enableSave();
      },
      save() {},
    },
  };
</script>

