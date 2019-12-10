import Index from "./pages/index.vue";
import ItemDetails from "./pages/details/item.vue";
import LocationDetails from "./pages/details/location.vue";
import TagDetails from "./pages/details/tag.vue";
import TeamDetails from "./pages/details/team.vue";
import RoleDetails from "./pages/details/role.vue";
import ItemAdd from "./pages/add/item.vue";
import TagAdd from "./pages/add/tag.vue";
import LocationAdd from "./pages/add/location.vue";
import ActivityAdd from "./pages/add/activity.vue";
import Settings from "./pages/settings/index.vue";
import SettingsItems from "./pages/settings/items.vue";
import SettingsEditFields from "./pages/settings/edit-fields.vue";
import SettingsItemsFieldDetails from "./pages/settings/items-field-details.vue";
import SettingsLocations from "./pages/settings/locations.vue";
import SettingsTags from "./pages/settings/tags.vue";
import SettingsActivities from "./pages/settings/activities.vue";
import SelectPicker from "./pages/select-picker.vue";

const routes = [
  {
    path: "/whs/",
    component: Index,
    on:{
      pageInit(e,page){
        page.view.router.params.stackPages=true;
      },
      pageBeforeRemove(e,page){
        page.view.router.params.stackPages=false;
      }
    } 			
  },
  {
    path: "/whs/item/",
    component: ItemDetails
  },
  {
    path: "/whs/location/",
    component: LocationDetails
  },
  {
    path: "/whs/tag/",
    component: TagDetails
  },
  {
    path: "/whs/team/",
    component: TeamDetails
  },
  {
    path: "/whs/role/",
    component: RoleDetails
  },
  {
    path: "/whs/item-add/",
    component: ItemAdd
  },
  {
    path: "/whs/tag-add/",
    component: TagAdd
  },
  {
    path: "/whs/location-add/",
    component: LocationAdd
  },
  {
    path: "/whs/activity-add/",
    component: ActivityAdd
  },
  {
    path: "/whs/settings/",
    component: Settings
  },
  {
    path: "/whs/settings/items/",
    component: SettingsItems
  },
  {
    path: "/whs/settings/edit-fields/",
    component: SettingsEditFields
  },
  {
    path: "/whs/settings/items/field/",
    component: SettingsItemsFieldDetails
  },
  {
    path: "/whs/settings/locations/",
    component: SettingsLocations
  },
  {
    path: "/whs/settings/tags/",
    component: SettingsTags
  },
  {
    path: "/whs/settings/activities/",
    component: SettingsActivities
  },
  {
    path: "/whs/select-picker/",
    component: SelectPicker
  }
];

export default routes;
