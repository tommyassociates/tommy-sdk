import Index from './pages/index.vue';
import ItemDetails from './pages/item-details.vue';
import LocationDetails from './pages/location-details.vue';
import ItemAdd from './pages/item-add.vue';
import TagAdd from './pages/tag-add.vue';
import LocationAdd from './pages/location-add.vue';
import Settings from './pages/settings.vue';
import SettingsItems from './pages/settings-items.vue';
import SettingsItemsFields from './pages/settings-items-fields.vue';
import SettingsItemsFieldDetails from './pages/settings-items-field-details.vue';
import SettingsLocations from './pages/settings-locations.vue';

const routes = [
  {
    path: '/whs/',
    component: Index,
    keepAlive: true,
  },
  {
    path: '/whs/item/',
    component: ItemDetails,
  },
  {
    path: '/whs/location/',
    component: LocationDetails,
  },
  {
    path: '/whs/item-add/',
    component: ItemAdd,
  },
  {
    path: '/whs/tag-add/',
    component: TagAdd,
  },
  {
    path: '/whs/location-add/',
    component: LocationAdd,
  },
  {
    path: '/whs/settings/',
    component: Settings,
  },
  {
    path: '/whs/settings/items/',
    component: SettingsItems,
  },
  {
    path: '/whs/settings/items/fields/',
    component: SettingsItemsFields,
  },
  {
    path: '/whs/settings/items/field/',
    component: SettingsItemsFieldDetails,
  },
  {
    path: '/whs/settings/locations/',
    component: SettingsLocations,
  },
];

export default routes;
