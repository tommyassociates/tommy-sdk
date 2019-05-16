import Index from '../../addons-common/pages/index.vue';
import Add from '../../addons-common/pages/add.vue';
import Settings from '../../addons-common/pages/settings.vue';
import History from '../../addons-common/pages/history.vue';

const routes = [
  {
    path: '/health_vitals/heart_rate/',
    component: Index,
  },
  {
    path: '/health_vitals/heart_rate/add/',
    component: Add,
  },
  {
    path: '/health_vitals/heart_rate/settings/',
    component: Settings,
  },
  {
    path: '/health_vitals/heart_rate/history/',
    component: History,
  },
];
routes.forEach((r) => {
  r.options = {
    props: {
      vitalsElement: 'heart_rate',
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
          defaultValue: 'rest',
          label($t) {
            return $t('health_vitals.heart_rate.manual_enter.vital_variants_label');
          },
          values($t) {
            return [
              {
                value: 'rest',
                display: $t('health_vitals.heart_rate.manual_enter.vital_variants.0'),
              },
              {
                value: 'walk',
                display: $t('health_vitals.heart_rate.manual_enter.vital_variants.1'),
              },
              {
                value: 'run',
                display: $t('health_vitals.heart_rate.manual_enter.vital_variants.2'),
              },
            ];
          },
        },
      ],
      chartColor: '#FEBFB8',
      chartMarkerColor: '#FD7E70',
      chartClickedExtra(item, $t) {
        const state = item.data.state;
        const states = ['rest', 'walk', 'run'];
        return `
          <span class="vitals-heart_rate-chart-clicked-state-icon-${state}"></span>
          <span class="vitals-heart_rate-chart-clicked-state-text">${$t(`health_vitals.heart_rate.history.vital_variants.${states.indexOf(state)}`)}</span>
        `.trim();
      },
    },
  };
});

export default routes;
