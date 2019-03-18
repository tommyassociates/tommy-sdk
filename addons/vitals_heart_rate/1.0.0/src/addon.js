const routes = [
  {
    path: '/vitals_heart_rate/',
    component: 'tommy-vitals-element-index',
  },
  {
    path: '/vitals_heart_rate/add/',
    component: 'tommy-vitals-element-add',
  },
  {
    path: '/vitals_heart_rate/settings/',
    component: 'tommy-vitals-element-settings',
  },
  {
    path: '/vitals_heart_rate/history/',
    component: 'tommy-vitals-element-history',
  },
];
routes.forEach((r) => {
  r.options = {
    props: {
      addon: 'vitals_heart_rate',
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
            return $t('vitals_heart_rate.manual_enter.vital_variants_label');
          },
          values($t) {
            return [
              {
                value: 'rest',
                display: $t('vitals_heart_rate.manual_enter.vital_variants.0'),
              },
              {
                value: 'walk',
                display: $t('vitals_heart_rate.manual_enter.vital_variants.1'),
              },
              {
                value: 'run',
                display: $t('vitals_heart_rate.manual_enter.vital_variants.2'),
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
          <span class="vitals-heart_rate-chart-clicked-state-text">${$t(`vitals_heart_rate.history.vital_variants.${states.indexOf(state)}`)}</span>
        `.trim();
      },
    },
  };
});

export default routes;
