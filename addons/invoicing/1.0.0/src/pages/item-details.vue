<template>
  <f7-page id="invoicing__item-details" data-name="invoicing__item-details" class="invoicing-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{pageTitle}}</f7-nav-title>
      <f7-nav-right>
        <f7-link v-if="showSave" @click="save" icon-f7="check"></f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-list class="list-custom" v-if="item">
      <f7-list-input
        :label="$t('invoicing.item.name_label', 'Name')"
        :placeholder="$t('invoicing.item.name_placeholder', 'Enter item/service name')"
        type="text"
        :value="item.name"
        @input="($event) => {item.name = $event.target.value; enableSave()}"
      ></f7-list-input>
      <f7-list-item
        :title="$t('invoicing.item.enabled_label', 'Enabled')"
      >
        <f7-toggle :checked="item.active" @change="($event) => {item.active = $event.target.checked; enableSave();}"></f7-toggle>
      </f7-list-item>
      <f7-list-item
        :title="$t('invoicing.item.photos_label', 'Photos')"
        :after="(item.photos && item.photos.length) || 'Not set'"
        link="#"
      ></f7-list-item>
      <!-- Description -->
      <f7-list-item divider :title="$t('invoicing.item.description_label', 'Description')"></f7-list-item>
      <f7-list-input
        :placeholder="$t('invoicing.item.description_placeholder', 'Enter item/service description')"
        type="textarea"
        resizable
        :value="item.description"
        @input="($event) => {item.description = $event.target.value; enableSave()}"
      ></f7-list-input>
      <!-- Packages -->
      <f7-list-item divider :title="$t('invoicing.item.packages_label', 'Packages')"></f7-list-item>
      <f7-list-item
        v-if="!item.packages || !item.packages.length"
        :title="$t('invoicing.item.packages_no_packages', 'No associated packages found')"
      ></f7-list-item>
      <f7-list-item
        v-if="item.packages && item.packages.length"
        v-for="pkg in item.packages"
        :key="pkg.id"
        :title="pkg.name"
        :link="`/invoicing/package-details/${pkg.id}/?title=${pkg.name}`"
      ></f7-list-item>
      <!-- Tags -->
      <tag-select
        slot="after-list"
        :data="{
          title: $t('invoicing.item.tags_label'),
          placeholder: $t('invoicing.common.search_members_tags', 'Search Members, Tags'),
          pageTitle: $t('invoicing.common.search_members_tags', 'Search Members, Tags'),
          filters: item.tags,
        }"
        @tagAdd="addItemTag"
        @tagRemove="removeItemTag"
      ></tag-select>
    </f7-list>

    <!-- Price, Sku, Barcode -->
    <f7-list class="list-custom margin-top" v-if="item">
      <f7-list-input
        :label="$t('invoicing.item.price_label', 'Price')"
        :placeholder="$t('invoicing.item.price_placeholder', 'Enter item/service price')"
        type="text"
        :value="`¥${item.price}`"
        @input="setPrice($event.target.value)"
      ></f7-list-input>
      <f7-list-input
        :label="$t('invoicing.item.sku_label', 'SKU')"
        :placeholder="$t('invoicing.item.sku_placeholder', 'Enter item/service SKU')"
        type="text"
        :value="`${item.sku}`"
        @input="($event) => {item.sku = $event.target.value; enableSave()}"
      ></f7-list-input>
      <f7-list-input
        :label="$t('invoicing.item.barcode_label', 'Barcode ID')"
        :placeholder="$t('invoicing.item.barcode_placeholder', 'Enter item/service barcode ID')"
        type="text"
        :value="`${item.barcode}`"
        @input="($event) => {item.barcode = $event.target.value; enableSave()}"
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
        pageTitle: self.$f7route.query.title || self.$t('invoicing.item.new_title'),
        item: null,
        showSave: false,
      };
    },
    mounted() {
      const self = this;
      if (!self.id) {
        self.item = {
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
      API.loadItem(self.id).then((item) => {
        self.item = item;
        self.item = {
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
        self.item.price = newPrice;
        self.enableSave();
      },
      enableSave() {
        const self = this;
        self.showSave = true;
      },
      addItemTag(tag) {
        const self = this;
        self.item.tags.push(tag);
        self.enableSave();
      },
      removeItemTag(tag) {
        const self = this;
        self.item.tags.splice(self.item.tags.indexOf(tag), 1);
        self.enableSave();
      },
      save() {},
    },
  };
</script>

