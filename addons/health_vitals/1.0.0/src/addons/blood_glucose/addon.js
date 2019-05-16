import Index from '../../addons-common/pages/index.vue';
import Add from '../../addons-common/pages/add.vue';
import Settings from '../../addons-common/pages/settings.vue';
import History from '../../addons-common/pages/history.vue';

const routes = [
  {
    path: '/health_vitals/blood_glucose/',
    component: Index,
  },
  {
    path: '/health_vitals/blood_glucose/add/',
    component: Add,
  },
  {
    path: '/health_vitals/blood_glucose/settings/',
    component: Settings,
  },
  {
    path: '/health_vitals/blood_glucose/history/',
    component: History,
  },
];
routes.forEach((r) => {
  r.options = {
    props: {
      vitalsElement: 'blood_glucose',
      indexCardCustomIconName(item) {
        if (item && item.data && item.data.state) {
          return `card-icon-${item.data.state}`;
        }
        return '';
      },
      manualAddExtraFields: [
        {
          type: 'smartselect',
          propName: 'state',
          defaultValue: 'none',
          label($t) {
            return $t('health_vitals.blood_glucose.manual_enter.vital_variants_label');
          },
          values($t) {
            return [
              {
                value: 'none',
                display: $t('health_vitals.blood_glucose.manual_enter.vital_variants.0'),
              },
              {
                value: 'beforemeal',
                display: $t('health_vitals.blood_glucose.manual_enter.vital_variants.1'),
              },
              {
                value: 'aftermeal',
                display: $t('health_vitals.blood_glucose.manual_enter.vital_variants.2'),
              },
            ];
          },
        },
      ],
      chartColor: '#FEBFB8',
      chartMarkerColor: '#FD7E70',
      chartClickedExtra(item, $t) {
        const state = item.data.state;
        const states = ['none', 'beforemeal', 'aftermeal'];
        return `
          <span class="vitals-blood_glucose-chart-clicked-state-icon-${state}"></span>
          <span class="vitals-blood_glucose-chart-clicked-state-text">${$t(`health_vitals.blood_glucose.history.vital_variants.${states.indexOf(state)}`)}</span>
        `.trim();
      },
    },
  };
});

export default routes;
