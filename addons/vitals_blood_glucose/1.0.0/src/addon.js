import Index from '../../../../addons_common/vitals_element/pages/index.vue';
import Add from '../../../../addons_common/vitals_element/pages/add.vue';
import Settings from '../../../../addons_common/vitals_element/pages/settings.vue';
import History from '../../../../addons_common/vitals_element/pages/history.vue';

const routes = [
  {
    path: '/vitals_blood_glucose/',
    component: Index,
  },
  {
    path: '/vitals_blood_glucose/add/',
    component: Add,
  },
  {
    path: '/vitals_blood_glucose/settings/',
    component: Settings,
  },
  {
    path: '/vitals_blood_glucose/history/',
    component: History,
  },
];
routes.forEach((r) => {
  r.options = {
    props: {
      addon: 'vitals_blood_glucose',
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
            return $t('vitals_blood_glucose.manual_enter.vital_variants_label');
          },
          values($t) {
            return [
              {
                value: 'none',
                display: $t('vitals_blood_glucose.manual_enter.vital_variants.0'),
              },
              {
                value: 'beforemeal',
                display: $t('vitals_blood_glucose.manual_enter.vital_variants.1'),
              },
              {
                value: 'aftermeal',
                display: $t('vitals_blood_glucose.manual_enter.vital_variants.2'),
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
          <span class="vitals-blood_glucose-chart-clicked-state-text">${$t(`vitals_blood_glucose.history.vital_variants.${states.indexOf(state)}`)}</span>
        `.trim();
      },
    },
  };
});

export default routes;
