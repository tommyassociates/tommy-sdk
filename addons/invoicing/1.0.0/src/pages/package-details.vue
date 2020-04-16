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
      <!-- Description -->
      <f7-list-item divider :title="$t('invoicing.item.description_label', 'Description')"></f7-list-item>
      <f7-list-input
        :placeholder="$t('invoicing.item.description_placeholder', 'Enter item/service description')"
        type="textarea"
        resizable
        :value="item.description"
        @input="($event) => {item.description = $event.target.value; enableSave()}"
      ></f7-list-input>
      <!-- Duration -->
      <!-- <f7-list-item divider :title="$t('invoicing.item.duration_label', 'Duration')"></f7-list-item>
      <f7-list-input
        :placeholder="$t('invoicing.item.duration_placeholder', 'Item duration in minutes')"
        type="text"
        :value="item.data.duration"
        @input="onDurationChange"
      ></f7-list-input> -->
      <!-- Duration -->
      <f7-list-item divider :title="$t('invoicing.item.duration_label', 'Duration')"></f7-list-item>
      <f7-list-input
        :placeholder="$t('invoicing.item.duration_placeholder', 'Item duration in minutes')"
        type="number"
        :value="item.data.duration"
        @input="onDurationChange"
      ></f7-list-input>
      <!-- Category -->
      <f7-list-item divider :title="$t('invoicing.item.category_label', 'Cagegory')"></f7-list-item>
      <f7-list-input
        :placeholder="$t('invoicing.item.category_placeholder', 'Enter item/service category')"
        type="text"
        :value="item.category"
        @input="($event) => {item.category = $event.target.value; enableSave()}"
      ></f7-list-input>
      <!-- Available in -->
      <f7-list-item divider :title="$t('invoicing.item.available_in_label', 'Available in')"></f7-list-item>
      <f7-list-input
        :placeholder="$t('invoicing.item.available_in_placeholder', 'City where it is available')"
        type="text"
        :value="availabile_in"
        @input="setAvailable($event.target.value)"
      ></f7-list-input>
      <!-- Photo -->
      <f7-list-item divider :title="$t('invoicing.item.photo_label', 'Photo')"></f7-list-item>
      <li>
        <div class="invoicing-product-photo-container">
          <div
            v-if="item.image_url || imagePreview"
            class="invoicing-product-photo"
          >
            <img :src="item.image_url || imagePreview">
            <f7-link icon-f7="close_round_fill" @click="deleteImage"></f7-link>
          </div>
          <label
            v-else
            class="invoicing-product-photo-add"
          >
            <input type="file" @change="onFileChange">
            <f7-icon f7="add"></f7-icon>
          </label>
        </div>
      </li>
      <!-- Tags -->
      <tag-select
        slot="after-list"
        :data="{
          title: $t('invoicing.item.tags_label'),
          placeholder: $t('invoicing.common.search_members_tags', 'Search Members, Tags'),
          pageTitle: $t('invoicing.common.search_members_tags', 'Search Members, Tags'),
          tags: item.filters,
        }"
        @tagAdd="addItemTag"
        @tagRemove="removeItemTag"
      ></tag-select>

      <!-- Items -->
      <f7-list-item divider :title="$t('invoicing.package.items_label')"></f7-list-item>
      <li class="invoicing-order-items" v-if="products">
        <div class="invoicing-order-add-box" @click="productsOpened = true">
          <f7-icon f7="add"></f7-icon>
          <div class="invoicing-order-add-box-placeholder">{{$t('invoicing.package.add_item_label')}}</div>
        </div>
        <div class="invoicing-order-item"
          v-for="(product, index) in item.package_products_attributes"
          :key="index"
          v-if="!product._destroy"
        >
          <div class="invoicing-order-item-name">{{productName(product.vendor_product_id)}}</div>
          <div class="invoicing-order-item-selector">
            <f7-link icon-f7="delete_round" @click="decreaseProduct(index)"></f7-link>
            <div class="invoicing-order-item-qty">{{product.quantity}}</div>
            <f7-link icon-f7="add_round_fill" @click="increaseProduct(index)"></f7-link>
          </div>
        </div>
      </li>
    </f7-list>

    <!-- Price, Sku, Barcode -->
    <f7-list class="list-custom margin-top" v-if="item">
      <f7-list-input
        :label="$t('invoicing.item.price_label', 'Price')"
        :placeholder="$t('invoicing.item.price_placeholder', 'Enter item/service price')"
        type="text"
        :value="item.price"
        @input="setPrice($event.target.value)"
      ></f7-list-input>
      <!-- <f7-list-input
        :label="$t('invoicing.item.sku_label', 'SKU')"
        :placeholder="$t('invoicing.item.sku_placeholder', 'Enter item/service SKU')"
        type="text"
        :value="`${item.sku}`"
        @input="($event) => {item.sku = $event.target.value; enableSave()}"
      ></f7-list-input> -->
      <f7-list-input
        :label="$t('invoicing.item.barcode_label', 'Barcode ID')"
        :placeholder="$t('invoicing.item.barcode_placeholder', 'Enter item/service barcode ID')"
        type="text"
        :value="item.code"
        @input="($event) => {item.code = $event.target.value; enableSave()}"
      ></f7-list-input>
    </f7-list>

    <f7-popup :opened="productsOpened" @popup:closed="productsOpened = false" v-if="products">
      <f7-view :init="false">
        <f7-page class="invoicing-page">
          <f7-navbar>
            <f7-nav-right>
              <f7-link popup-close icon-f7="close"></f7-link>
            </f7-nav-right>
            <f7-nav-title>{{$t('invoicing.package.add_item_label')}}</f7-nav-title>
          </f7-navbar>
          <f7-searchbar search-container=".invoicing-package-details-products" :disable-button="false"></f7-searchbar>
          <f7-list class="list-custom invoicing-order-details-products invoicing-package-details-products">
            <f7-list-item
              v-for="product in products"
              :key="product.id"
              link
              :title="product.name"
              :after="`¥${product.price}`"
              @click="addProduct(product)"
            ></f7-list-item>
          </f7-list>
        </f7-page>
      </f7-view>
    </f7-popup>
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
        item: null,
        showSave: false,
        imagePreview: null,
        products: null,
        productsOpened: false,
        availabile_in: '',
        data: {
          duration: null,
        },
      };
    },
    mounted() {
      const self = this;
      API.loadProducts().then((products) => {
        self.products = products;
      });
      if (!self.id) {
        self.item = {
          active: false,
          category: '',
          code: '',
          filters: [],
          description: '',
          name: '',
          price: 0,
          package_products_attributes: [],
          data: {
            availabile_in: [],
            duration: null,
          },
        };
        return;
      }
      API.loadPackage(self.id).then((item) => {
        if (!item.package_products_attributes) item.package_products_attributes = [];
        if (item.package_products) {
          item.package_products_attributes = item.package_products.map((el) => {
            return {
              id: el.id,
              vendor_product_id: el.vendor_product_id,
              quantity: el.quantity,
              vendor_package_id: el.vendor_package_id,
            };
          });
          delete item.package_products;
        }
        if (!item.data || typeof item.data === 'string') {
          item.data = {
            availabile_in: [],
            duration: null,
          };
        }
        self.availabile_in = (item.data.availabile_in || []).join(',');
        if (typeof item.filters === 'string') item.filters = JSON.parse(decodeURIComponent(item.filters));
        if (!item.filters) item.filters = [];
        self.item = item;
      });
    },
    methods: {
      setAvailable(value) {
        const self = this;
        self.availabile_in = value;
        self.item.data.availabile_in = value.split(',').map(el => el.trim()).filter(el => el);
        self.enableSave();
      },
      productName(id) {
        const self = this;
        return self.products.filter(el => el.id === parseInt(id, 10))[0].name;
      },
      increaseProduct(index) {
        const self = this;
        self.item.package_products_attributes[index].quantity += 1;
        self.enableSave();
      },
      decreaseProduct(index) {
        const self = this;
        self.item.package_products_attributes[index].quantity -= 1;
        if (self.item.package_products_attributes[index].quantity === 0) {
          if (self.item.package_products_attributes[index].id) {
            self.item.package_products_attributes[index]._destroy = true;
          } else {
            self.item.package_products_attributes.splice(index, 1);
          }
        }
        self.enableSave();
      },
      addProduct(product) {
        const self = this;
        self.productsOpened = false;
        let hasProduct;
        self.item.package_products_attributes.forEach((el) => {
          if (el.vendor_product_id === product.id) hasProduct = true;
        })
        if (hasProduct) return;

        self.item.package_products_attributes.push({
          vendor_product_id: product.id,
          quantity: 1,
        });
        self.showSave = true;
      },
      setPrice(value) {
        const self = this;
        self.item.price = value;
        self.item.price_cents = parseFloat(self.item.price) * 100;
        if (Number.isNaN(self.item.price_cents)) self.item.price_cents = 0;
        self.enableSave();
      },
      enableSave() {
        const self = this;
        if (!self.item.name) {
          self.showSave = false;
          return;
        }
        self.showSave = true;
      },
      addItemTag(tag) {
        const self = this;
        self.item.filters.push(tag);
        self.enableSave();
      },
      removeItemTag(tag) {
        const self = this;
        self.item.filters.splice(self.item.filters.indexOf(tag), 1);
        self.enableSave();
      },
      onDurationChange(e) {
        const self = this;
        self.item.data.duration = e.target.value;
        self.enableSave();
      },
      onFileChange(e) {
        const self = this;
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = (ev) => {
          self.imagePreview = ev.target.result;
        };
        reader.readAsDataURL(file);
        self.item.image = file;
        self.enableSave();
      },
      deleteImage() {
        const self = this;
        self.item.image = null;
        self.item.image_url = null;
        self.imagePreview = null;
        self.enableSave();
      },
      save() {
        const self = this;
        self.showSave = false;
        API.saveProduct(self.item, true).then(() => {
          self.$events.$emit('invoicing:reloadPackages');
          self.$f7router.back();
        });
      },
    },
  };
</script>

