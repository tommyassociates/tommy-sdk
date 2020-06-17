import Index from "./pages/index.vue";
import Settings from "./pages/settings.vue";
import Detail from "./pages/detail.vue";
import ShiftDetail from "./pages/shift-detail.vue";
import SelectPicker from "./pages/select-picker.vue";
import MapPage from "./pages/map.vue";

import ManagerTimeSheets from './pages/manager/time-sheets.vue';
import ManagerDetail from './pages/manager/detail.vue';
import ManagerShiftDetail from './pages/manager/shift-detail.vue';
import ManagerAttendanceDetail from './pages/manager/attendance-detail.vue';


const routes = [
  {
    path: "/time-sheets/",
    component: Index,
  },
  {
    path: "/time-sheets/detail/:id",
    component: Detail,
  },
  {
    path: "/time-sheets/item-detail/create/:timesheetId",
    component: ShiftDetail,
  },
  {
    path: "/time-sheets/item-detail/:id",
    component: ShiftDetail,
  },
  {
    path: "/time-sheets/settings/",
    component: Settings,
  },
  {
    path: "/time-sheets/select-picker/",
    component: SelectPicker,
  },
  {
    path: "/time-sheets/map/",
    component: MapPage,
  },
  {
    path: "/time-sheets/manager/time-sheets/:status/",
    component: ManagerTimeSheets,
  },
  {
    path: "/time-sheets/manager/time-sheets/detail/:id",
    component: ManagerDetail,
  },
  {
    path: "/time-sheets/manager/time-sheets/item-detail/:id",
    component: ManagerShiftDetail,
  },
  {
    path: "/time-sheets/manager/time-sheets/item-detail/create/:managerTimesheetId",
    component: ManagerShiftDetail,
  },
  {
    path: "/time-sheets/manager/time-sheets/attendance-detail/:attendanceId",
    component: ManagerAttendanceDetail,
  },


];

export default routes;
