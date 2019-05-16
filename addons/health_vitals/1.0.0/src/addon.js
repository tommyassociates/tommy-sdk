import Index from './pages/index.vue';
import RightPanel from './pages/right-panel.vue';

import BloodGlucose from './addons/blood_glucose/addon';
import BloodPressure from './addons/blood_pressure/addon';
import HeartRate from './addons/heart_rate/addon';
import Height from './addons/height/addon';
import Immunisations from './addons/immunisations/addon';
import MedicationReminder from './addons/medication_reminder/addon';
import Pedometer from './addons/pedometer/addon';
import Temperature from './addons/temperature/addon';
import WaterTracker from './addons/water_tracker/addon';
import Weight from './addons/weight/addon';

const routes = [
  {
    path: '/health_vitals/',
    component: Index,
  },
  {
    path: '/health_vitals/panel/',
    panel: {
      component: RightPanel,
    },
  },
  ...BloodGlucose,
  ...BloodPressure,
  ...HeartRate,
  ...Height,
  ...Immunisations,
  ...MedicationReminder,
  ...Pedometer,
  ...Temperature,
  ...WaterTracker,
  ...Weight,
];
export default routes;
