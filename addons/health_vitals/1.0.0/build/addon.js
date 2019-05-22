var addon = (function () {
  var Actor = {
    id: undefined,
    user: undefined,
  };

  var api = window.tommy.api;

  var API = {
    getWaterTracker: function getWaterTracker(user) {
      return api.getFragments({
        addon: 'health_vitals',
        kind: 'VitalsWaterTrackerItem',
        with_filters: true,
        with_permission_to: true,
        user_id: Actor.id || user.id,
        actor_id: Actor.id,
        page: 1,
        limit: 1,
        per: 1,
      }, {
        cache: false,
      });
    },
    getTemperature: function getTemperature(user) {
      return api.getFragments({
        addon: 'health_vitals',
        kind: 'VitalsTemperatureItem',
        with_filters: true,
        with_permission_to: true,
        user_id: Actor.id || user.id,
        actor_id: Actor.id,
        page: 1,
        limit: 1,
        per: 1,
      }, {
        cache: false,
      });
    },
    getPedometer: function getPedometer(user) {
      return api.getFragments({
        addon: 'health_vitals',
        kind: 'VitalsPedometerItem',
        with_filters: true,
        with_permission_to: true,
        user_id: Actor.id || user.id,
        actor_id: Actor.id,
        page: 1,
        limit: 1,
        per: 1,
      }, {
        cache: false,
      });
    },
    getHeight: function getHeight(user) {
      return api.getFragments({
        addon: 'health_vitals',
        kind: 'VitalsHeightItem',
        with_filters: true,
        with_permission_to: true,
        user_id: Actor.id || user.id,
        actor_id: Actor.id,
        page: 1,
        limit: 1,
        per: 1,
      }, {
        cache: false,
      });
    },
    getWeight: function getWeight(user) {
      return api.getFragments({
        addon: 'health_vitals',
        kind: 'VitalsWeightItem',
        with_filters: true,
        with_permission_to: true,
        user_id: Actor.id || user.id,
        actor_id: Actor.id,
        page: 1,
        limit: 1,
        per: 1,
      }, {
        cache: false,
      });
    },
    getHeartRate: function getHeartRate(user) {
      return api.getFragments({
        addon: 'health_vitals',
        kind: 'VitalsHeartRateItem',
        with_filters: true,
        with_permission_to: true,
        user_id: Actor.id || user.id,
        actor_id: Actor.id,
        page: 1,
        limit: 1,
        per: 1,
      }, {
        cache: false,
      });
    },
    getBloodPressure: function getBloodPressure(user) {
      return api.getFragments({
        addon: 'health_vitals',
        kind: 'VitalsBloodPressureItem',
        with_filters: true,
        with_permission_to: true,
        user_id: Actor.id || user.id,
        actor_id: Actor.id,
        page: 1,
        limit: 1,
        per: 1,
      }, {
        cache: false,
      });
    },
    getBloodGlucose: function getBloodGlucose(user) {
      return api.getFragments({
        addon: 'health_vitals',
        kind: 'VitalsBloodGlucoseItem',
        with_filters: true,
        with_permission_to: true,
        user_id: Actor.id || user.id,
        actor_id: Actor.id,
        page: 1,
        limit: 1,
        per: 1,
      }, {
        cache: false,
      });
    },
    getMedicationReminder: function getMedicationReminder(user) {
      return new Promise(function (resolve, reject) {
        var medicationsRequest = api.getFragments({
          addon: 'health_vitals',
          kind: 'VitalsMedicationReminderMedication',
          with_filters: true,
          with_permission_to: true,
          user_id: Actor.id || user.id,
          actor_id: Actor.id,
        }, {
          cache: false,
        });
        var takenRequest = api.getFragments({
          addon: 'health_vitals',
          kind: 'VitalsMedicationReminderTaken',
          with_filters: true,
          with_permission_to: true,
          user_id: Actor.id || user.id,
          actor_id: Actor.id,
        }, {
          cache: false,
        });
        Promise.all([medicationsRequest, takenRequest]).then(function (ref) {
          var medications = ref[0];
          var takenData = ref[1];

          var data = {};
          medications.forEach(function (medication) {
            var ref;

            var startDate = new Date(medication.data.startDate);
            if (startDate.getTime() > new Date().getTime()) { return; }
            var endDate = new Date(medication.data.endDate);
            if (endDate.getTime() > new Date().getTime()) {
              endDate = new Date();
              endDate.setHours(0, 0, 0, 0);
            }
            var days = (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000) + 1;
            for (var i = 0; i < days; i += 1) {
              var d = new Date(startDate).getTime() + i * (24 * 60 * 60 * 1000);
              var formatted = new Date(d).toJSON();
              if (!data[formatted]) { data[formatted] = []; }
              (ref = data[formatted]).push.apply(ref, medication.data.dosage.map(function (dose) { return ({
                id: medication.id,
                name: medication.data.name,
                time: dose.time,
              }); }));
            }
          });
          Object.keys(data).forEach(function (key) {
            var dayData = data[key];
            dayData.sort(function (a, b) {
              var aTime = parseInt(a.time.split(':')[0], 10) * 60 + parseInt(a.time.split(':')[1], 10);
              var bTime = parseInt(b.time.split(':')[0], 10) * 60 + parseInt(b.time.split(':')[1], 10);
              if (aTime < bTime) { return -1; }
              return 1;
            });
          });
          var sortedKeys = Object.keys(data).sort(function (a, b) {
            var aDate = new Date(a).getTime();
            var bDate = new Date(b).getTime();
            if (aDate < bDate) { return -1; }
            return 1;
          });

          var lastDate = sortedKeys[sortedKeys.length - 1];
          if (!lastDate) {
            reject();
            return;
          }
          var lastData = data[lastDate];
          var takenItems = lastData.filter(function (item) {
            var taken;
            var todayDate = new Date(lastDate);
            todayDate.setHours(0, 0, 0, 0);
            takenData.forEach(function (takenItem) {
              if (taken) { return; }
              var takenDate = new Date(takenItem.data.date || takenItem.start_at);
              takenDate.setHours(0, 0, 0, 0);
              if (item.id === takenItem.data.medication_id && item.time === takenItem.data.time && todayDate.getTime() === takenDate.getTime() && takenItem.data.taken) {
                taken = true;
              }
            });
            return taken;
          });
          resolve({
            date: new Date(lastDate),
            takenPercentage: Math.round(takenItems.length / lastData.length * 100),
          });
        });
      });
    },
  };

  var cachedVitals = {
    water_tracker: null,
    temperature: null,
    pedometer: null,
    height: null,
    weight: null,
    heart_rate: null,
    blood_pressure: null,
    blood_glucose: null,
    medication_reminder: null,
  };

  var Index = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-page',{attrs:{"id":"health_vitals__index"}},[_c('f7-navbar',[_c('tommy-nav-menu'),_vm._v(" "),_c('f7-nav-title',[_vm._v(_vm._s(_vm.t('title', 'Health Vitals')))]),_vm._v(" "),_c('f7-nav-right',[_c('f7-link',{attrs:{"href":"/health_vitals/panel/","icon-only":""}},[_c('i',{staticClass:"icon health-vitals-icon-settings"})])],1)],1),_vm._v(" "),_c('div',{staticClass:"health-vitals-cards"},[(_vm.user)?_c('div',{staticClass:"health-vitals-card health-vitals-user-card"},[(_vm.user)?_c('tommy-circle-avatar',{attrs:{"data":_vm.user}}):_vm._e(),_vm._v(" "),_c('div',{staticClass:"health-vitals-user-card-content"},[_c('div',{staticClass:"name"},[_vm._v(_vm._s(_vm.user.name || ((_vm.user.first_name || '') + " " + (_vm.user.last_name || ''))))]),_vm._v(" "),_c('div',{staticClass:"props"},[(_vm.userAge)?_c('div',{staticClass:"prop"},[_c('div',{staticClass:"prop-label"},[_vm._v(_vm._s(_vm.t('profile_age_label')))]),_vm._v(" "),_c('div',{staticClass:"prop-value"},[_vm._v(_vm._s(_vm.userAge))])]):_vm._e()])])],1):_vm._e(),_vm._v(" "),(_vm.blood_glucose)?_c('a',{staticClass:"health-vitals-card",attrs:{"href":"/health_vitals/blood_glucose/"}},[_c('div',{staticClass:"health-vitals-card-title"},[_vm._v(_vm._s(_vm.t('vital_types.2')))]),_vm._v(" "),_c('div',{staticClass:"health-vitals-subcard"},[_c('div',{staticClass:"health-vitals-subcard-title"},[_vm._v(_vm._s(_vm.$moment(_vm.blood_glucose.date).format('DD MMM YYYY'))+" "+_vm._s(_vm.blood_glucose.time))]),_vm._v(" "),_c('div',{staticClass:"health-vitals-subcard-content"},[_c('div',{staticClass:"health-vitals-card-icon"},[_c('img',{attrs:{"src":((_vm.$addonAssetsUrl) + "blood-glucose-icon-" + (_vm.blood_glucose.state) + ".svg")}})]),_vm._v(" "),_c('div',{staticClass:"health-vitals-subcard-value"},[_vm._v(_vm._s(_vm.blood_glucose.value)+" "),_c('sub',[_vm._v(_vm._s(_vm.t('blood_glucose_units')))])])])])]):_vm._e(),_vm._v(" "),(_vm.water_tracker || _vm.water_tracker === false)?_c('a',{staticClass:"health-vitals-card",attrs:{"href":"/health_vitals/water_tracker/"}},[_c('div',{staticClass:"health-vitals-card-title"},[_vm._v(_vm._s(_vm.t('vital_types.4')))]),_vm._v(" "),(_vm.water_tracker)?_c('div',{staticClass:"health-vitals-subcard"},[_c('div',{staticClass:"health-vitals-subcard-title"},[_vm._v(_vm._s(_vm.$moment(_vm.water_tracker.date).format('DD MMM YYYY'))+" "+_vm._s(_vm.water_tracker.time))]),_vm._v(" "),_c('div',{staticClass:"health-vitals-subcard-content"},[_c('div',{staticClass:"health-vitals-card-icon"},[(_vm.water_tracker.value < 200)?_c('img',{attrs:{"src":((_vm.$addonAssetsUrl) + "water-tracker-icon-cup.svg")}}):(_vm.water_tracker.value < 350)?_c('img',{attrs:{"src":((_vm.$addonAssetsUrl) + "water-tracker-icon-glass.svg")}}):_c('img',{attrs:{"src":((_vm.$addonAssetsUrl) + "water-tracker-icon-bottle.svg")}})]),_vm._v(" "),_c('div',{staticClass:"health-vitals-subcard-value"},[_vm._v(_vm._s(_vm.water_tracker.value)+" "),_c('sub',[_vm._v(_vm._s(_vm.t('water_units.5')))])])])]):_vm._e(),_vm._v(" "),(_vm.water_tracker === false)?_c('div',{staticClass:"health-vitals-subcard health-vitals-subcard-empty"},[_vm._v(_vm._s(_vm.t('no_data')))]):_vm._e()]):_vm._e(),_vm._v(" "),(_vm.medication_reminder)?_c('a',{staticClass:"health-vitals-card",attrs:{"href":"/health_vitals/medication_reminder/"}},[_c('div',{staticClass:"health-vitals-card-title"},[_vm._v(_vm._s(_vm.t('vital_types.0')))]),_vm._v(" "),_c('div',{staticClass:"health-vitals-subcard"},[_c('div',{staticClass:"health-vitals-subcard-title"},[_vm._v(_vm._s(_vm.$moment(_vm.medication_reminder.date).format('DD MMM YYYY')))]),_vm._v(" "),_c('div',{staticClass:"health-vitals-subcard-content"},[_c('div',{staticClass:"health-vitals-card-icon"},[(_vm.medication_reminder.takenPercentage === 100)?_c('img',{attrs:{"src":((_vm.$addonAssetsUrl) + "icon-check.svg")}}):_c('f7-gauge',{attrs:{"size":46,"value":_vm.medication_reminder.takenPercentage / 100,"border-bg-color":"#FAE1C9","border-color":"#FF4500","border-width":8}})],1),_vm._v(" "),_c('span',{staticClass:"health-vitals-card-icon-text"},[_vm._v(_vm._s(_vm.t('taken', 'Taken')))]),_vm._v(" "),_c('div',{staticClass:"health-vitals-subcard-value"},[_vm._v(_vm._s(_vm.medication_reminder.takenPercentage)+"%")])])])]):_vm._e(),_vm._v(" "),(_vm.temperature || _vm.temperature === false)?_c('a',{staticClass:"health-vitals-card",attrs:{"href":"/health_vitals/temperature/"}},[_c('div',{staticClass:"health-vitals-card-title"},[_vm._v(_vm._s(_vm.t('vital_types.5')))]),_vm._v(" "),(_vm.temperature)?_c('div',{staticClass:"health-vitals-subcard"},[_c('div',{staticClass:"health-vitals-subcard-title"},[_vm._v(_vm._s(_vm.$moment(_vm.temperature.date).format('DD MMM YYYY'))+" "+_vm._s(_vm.temperature.time))]),_vm._v(" "),_c('div',{staticClass:"health-vitals-subcard-content"},[_c('div',{staticClass:"health-vitals-card-icon"},[_c('img',{attrs:{"src":((_vm.$addonAssetsUrl) + "temperature-icon.svg")}})]),_vm._v(" "),_c('div',{staticClass:"health-vitals-subcard-value"},[_vm._v(_vm._s(_vm.temperature.value)+" "),_c('sub',[_vm._v(_vm._s(_vm.t('body_temperature_units.0')))])])])]):_vm._e(),_vm._v(" "),(_vm.temperature === false)?_c('div',{staticClass:"health-vitals-subcard health-vitals-subcard-empty"},[_vm._v(_vm._s(_vm.t('no_data')))]):_vm._e()]):_vm._e(),_vm._v(" "),(_vm.pedometer)?_c('a',{staticClass:"health-vitals-card",attrs:{"href":"/health_vitals/pedometer/"}},[_c('div',{staticClass:"health-vitals-card-title"},[_vm._v(_vm._s(_vm.t('vital_types.6')))]),_vm._v(" "),_c('div',{staticClass:"health-vitals-subcard"},[_c('div',{staticClass:"health-vitals-subcard-title"},[_vm._v(_vm._s(_vm.$moment(_vm.pedometer.date).format('DD MMM YYYY'))+" "+_vm._s(_vm.pedometer.time))]),_vm._v(" "),_c('div',{staticClass:"health-vitals-subcard-content"},[_c('div',{staticClass:"health-vitals-card-icon"},[_c('img',{attrs:{"src":((_vm.$addonAssetsUrl) + "pedometer-icon.svg")}})]),_vm._v(" "),_c('div',{staticClass:"health-vitals-subcard-value"},[_vm._v(_vm._s(_vm.pedometer.value)+" "),_c('sub',[_vm._v(_vm._s(_vm.t('pedometer_units')))])])])])]):_vm._e(),_vm._v(" "),(_vm.height || _vm.height === false)?_c('a',{staticClass:"health-vitals-card",attrs:{"href":"/health_vitals/height/"}},[_c('div',{staticClass:"health-vitals-card-title"},[_vm._v(_vm._s(_vm.t('vital_types.7')))]),_vm._v(" "),(_vm.height)?_c('div',{staticClass:"health-vitals-subcard"},[_c('div',{staticClass:"health-vitals-subcard-title"},[_vm._v(_vm._s(_vm.$moment(_vm.height.date).format('DD MMM YYYY'))+" "+_vm._s(_vm.height.time))]),_vm._v(" "),_c('div',{staticClass:"health-vitals-subcard-content"},[_c('div',{staticClass:"health-vitals-card-icon"},[_c('img',{attrs:{"src":((_vm.$addonAssetsUrl) + "height-icon.svg")}})]),_vm._v(" "),_c('div',{staticClass:"health-vitals-subcard-value"},[_vm._v(_vm._s(_vm.height.value)+" "),_c('sub',[_vm._v(_vm._s(_vm.t('height_units.0')))])])])]):_vm._e(),_vm._v(" "),(_vm.height === false)?_c('div',{staticClass:"health-vitals-subcard health-vitals-subcard-empty"},[_vm._v(_vm._s(_vm.t('no_data')))]):_vm._e()]):_vm._e(),_vm._v(" "),(_vm.heart_rate)?_c('a',{staticClass:"health-vitals-card",attrs:{"href":"/health_vitals/heart_rate/"}},[_c('div',{staticClass:"health-vitals-card-title"},[_vm._v(_vm._s(_vm.t('vital_types.3')))]),_vm._v(" "),_c('div',{staticClass:"health-vitals-subcard"},[_c('div',{staticClass:"health-vitals-subcard-title"},[_vm._v(_vm._s(_vm.$moment(_vm.heart_rate.date).format('DD MMM YYYY'))+" "+_vm._s(_vm.heart_rate.time))]),_vm._v(" "),_c('div',{staticClass:"health-vitals-subcard-content"},[_c('div',{staticClass:"health-vitals-card-icon"},[_c('img',{attrs:{"src":((_vm.$addonAssetsUrl) + "heart-rate-icon-" + (_vm.heart_rate.state) + ".svg")}})]),_vm._v(" "),_c('div',{staticClass:"health-vitals-subcard-value"},[_vm._v(_vm._s(_vm.heart_rate.value)+" "),_c('sub',[_vm._v(_vm._s(_vm.t('heart_rate_units')))])])])])]):_vm._e(),_vm._v(" "),(_vm.blood_pressure || _vm.blood_pressure === false)?_c('a',{staticClass:"health-vitals-card",attrs:{"href":"/health_vitals/blood_pressure/"}},[_c('div',{staticClass:"health-vitals-card-title"},[_vm._v(_vm._s(_vm.t('vital_types.1')))]),_vm._v(" "),(_vm.blood_pressure)?_c('div',{staticClass:"health-vitals-subcard"},[_c('div',{staticClass:"health-vitals-subcard-title"},[_vm._v(_vm._s(_vm.$moment(_vm.blood_pressure.date).format('DD MMM YYYY'))+" "+_vm._s(_vm.blood_pressure.time))]),_vm._v(" "),_c('div',{staticClass:"health-vitals-subcard-content"},[_c('div',{staticClass:"health-vitals-subcard-value"},[_vm._v(_vm._s(_vm.blood_pressure.value[0])+"/"+_vm._s(_vm.blood_pressure.value[1]))]),_vm._v(" "),_c('div',{staticClass:"health-vitals-subcard-value"},[_c('sub',[_vm._v(_vm._s(_vm.t('blood_pressure_units')))])])])]):_vm._e(),_vm._v(" "),(_vm.blood_pressure === false)?_c('div',{staticClass:"health-vitals-subcard health-vitals-subcard-empty"},[_vm._v(_vm._s(_vm.t('no_data')))]):_vm._e()]):_vm._e(),_vm._v(" "),(_vm.weight || _vm.weight === false)?_c('a',{staticClass:"health-vitals-card",attrs:{"href":"/health_vitals/weight/"}},[_c('div',{staticClass:"health-vitals-card-title"},[_vm._v(_vm._s(_vm.t('vital_types.8')))]),_vm._v(" "),(_vm.weight)?_c('div',{staticClass:"health-vitals-subcard"},[_c('div',{staticClass:"health-vitals-subcard-title"},[_vm._v(_vm._s(_vm.$moment(_vm.weight.date).format('DD MMM YYYY'))+" "+_vm._s(_vm.weight.time))]),_vm._v(" "),_c('div',{staticClass:"health-vitals-subcard-content"},[_c('div',{staticClass:"health-vitals-card-icon"},[_c('img',{attrs:{"src":((_vm.$addonAssetsUrl) + "weight-icon.svg")}})]),_vm._v(" "),_c('div',{staticClass:"health-vitals-subcard-value"},[_vm._v(_vm._s(_vm.weight.value)+" "),_c('sub',[_vm._v(_vm._s(_vm.t('weight_units.0')))])])])]):_vm._e(),_vm._v(" "),(_vm.weight === false)?_c('div',{staticClass:"health-vitals-subcard health-vitals-subcard-empty"},[_vm._v(_vm._s(_vm.t('no_data')))]):_vm._e()]):_vm._e()])],1)},staticRenderFns: [],
    data: function data() {
      var self = this;
      return {
        actorId: self.$f7route.query.actor_id,
        user: null,

        water_tracker: cachedVitals.water_tracker,
        temperature: cachedVitals.temperature,
        pedometer: cachedVitals.pedometer,
        height: cachedVitals.height,
        weight: cachedVitals.weight,
        heart_rate: cachedVitals.heart_rate,
        blood_pressure: cachedVitals.blood_pressure,
        blood_glucose: cachedVitals.blood_glucose,
        medication_reminder: cachedVitals.medication_reminder,
      };
    },
    mounted: function mounted() {
      var self = this;
      if (self.actorId) {
        Actor.id = parseInt(self.actorId, 10);
        self.$api.getContact(self.actorId).then(function (response) {
          self.user = response;
          Actor.user = response;
          self.getData();
        }).catch(function () {
          self.getData();
        });
      } else {
        self.user = self.$root.user;
        delete Actor.id;
        delete Actor.user;
        self.getData();
      }
    },
    computed: {
      userAge: function userAge() {
        var self = this;
        if (!self.user) { return; }
        var dob = self.user.dob;
        if (!dob) { return; }
        var dobDate = self.$moment(new Date(dob));
        var nowDate = self.$moment(new Date());
        return nowDate.diff(dobDate, 'years');
      },
    },
    methods: {
      t: function t(v, d) {
        return this.$t(("health_vitals.index." + v), d);
      },
      getData: function getData() {
        var self = this;
        API.getWaterTracker(self.$root.user).then(function (res) {
          if (!res || !res.length || !res[0].data) {
            self.water_tracker = false;
            cachedVitals.water_tracker = false;
            return;
          }
          self.water_tracker = res[0].data;
          cachedVitals.water_tracker = self.water_tracker;
        });
        API.getTemperature(self.$root.user).then(function (res) {
          if (!res || !res.length || !res[0].data) {
            self.temperature = false;
            cachedVitals.temperature = false;
            return;
          }
          self.temperature = res[0].data;
          cachedVitals.temperature = self.temperature;
        });
        API.getPedometer(self.$root.user).then(function (res) {
          if (!res || !res.length || !res[0].data) {
            self.pedometer = false;
            cachedVitals.pedometer = false;
            return;
          }
          self.pedometer = res[0].data;
          cachedVitals.pedometer = self.pedometer;
        });
        API.getHeight(self.$root.user).then(function (res) {
          if (!res || !res.length || !res[0].data) {
            self.height = false;
            cachedVitals.height = false;
            return;
          }
          self.height = res[0].data;
          cachedVitals.height = self.height;
        });
        API.getWeight(self.$root.user).then(function (res) {
          if (!res || !res.length || !res[0].data) {
            self.weight = false;
            cachedVitals.weight = false;
            return;
          }
          self.weight = res[0].data;
          cachedVitals.weight = self.weight;
        });
        API.getHeartRate(self.$root.user).then(function (res) {
          if (!res || !res.length || !res[0].data) {
            self.heart_rate = false;
            cachedVitals.heart_rate = false;
            return;
          }
          self.heart_rate = res[0].data;
          cachedVitals.heart_rate = self.heart_rate;
        });
        API.getBloodPressure(self.$root.user).then(function (res) {
          if (!res || !res.length || !res[0].data) {
            self.blood_pressure = false;
            cachedVitals.blood_pressure = false;
            return;
          }
          self.blood_pressure = res[0].data;
          cachedVitals.blood_pressure = self.blood_pressure;
        });
        API.getBloodGlucose(self.$root.user).then(function (res) {
          if (!res || !res.length || !res[0].data) {
            self.blood_glucose = false;
            cachedVitals.blood_glucose = false;
            return;
          }
          self.blood_glucose = res[0].data;
          cachedVitals.blood_glucose = self.blood_glucose;
        });
        API.getMedicationReminder(self.$root.user).then(function (res) {
          if (!res) {
            self.medication_reminder = false;
            cachedVitals.medication_reminder = false;
            return;
          }
          self.medication_reminder = res;
          cachedVitals.medication_reminder = self.medication_reminder;
        }).catch(function () {});
      },
    },
  };

  var RightPanel = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-panel',{staticClass:"health-vitals-panel",attrs:{"right":"","cover":""}},[_c('f7-view',{attrs:{"init":false}},[_c('f7-page',[_c('f7-navbar',[_c('f7-nav-left',[_c('f7-link',{attrs:{"panel-close":""}},[_c('i',{staticClass:"material-icons md-36"},[_vm._v("keyboard_arrow_left")])])],1)],1),_vm._v(" "),_c('f7-list',{staticClass:"health-vitals-panel-list",attrs:{"no-hairlines":""}},[_c('f7-list-item',{attrs:{"title":_vm.$t('health_vitals.blood_glucose.title'),"link":"/health_vitals/blood_glucose/","panel-close":""}},[_c('img',{attrs:{"slot":"media","src":((_vm.$addonAssetsUrl) + "blood_glucose/icon.png")},slot:"media"})]),_vm._v(" "),_c('f7-list-item',{attrs:{"title":_vm.$t('health_vitals.blood_pressure.title'),"link":"/health_vitals/blood_pressure/","panel-close":""}},[_c('img',{attrs:{"slot":"media","src":((_vm.$addonAssetsUrl) + "blood_pressure/icon.png")},slot:"media"})]),_vm._v(" "),_c('f7-list-item',{attrs:{"title":_vm.$t('health_vitals.heart_rate.title'),"link":"/health_vitals/heart_rate/","panel-close":""}},[_c('img',{attrs:{"slot":"media","src":((_vm.$addonAssetsUrl) + "heart_rate/icon.png")},slot:"media"})]),_vm._v(" "),_c('f7-list-item',{attrs:{"title":_vm.$t('health_vitals.height.title'),"link":"/health_vitals/height/","panel-close":""}},[_c('img',{attrs:{"slot":"media","src":((_vm.$addonAssetsUrl) + "height/icon.png")},slot:"media"})]),_vm._v(" "),_c('f7-list-item',{attrs:{"title":_vm.$t('health_vitals.temperature.title'),"link":"/health_vitals/temperature/","panel-close":""}},[_c('img',{attrs:{"slot":"media","src":((_vm.$addonAssetsUrl) + "temperature/icon.png")},slot:"media"})]),_vm._v(" "),_c('f7-list-item',{attrs:{"title":_vm.$t('health_vitals.water_tracker.title'),"link":"/health_vitals/water_tracker/","panel-close":""}},[_c('img',{attrs:{"slot":"media","src":((_vm.$addonAssetsUrl) + "water_tracker/icon.png")},slot:"media"})]),_vm._v(" "),_c('f7-list-item',{attrs:{"title":_vm.$t('health_vitals.weight.title'),"link":"/health_vitals/weight/","panel-close":""}},[_c('img',{attrs:{"slot":"media","src":((_vm.$addonAssetsUrl) + "weight/icon.png")},slot:"media"})])],1)],1)],1)],1)},staticRenderFns: [],};

  var api$1 = window.tommy.api;

  var API$1 = {
    getRecords: function getRecords(vitalsElement, user, ref) {
      if ( ref === void 0 ) ref = {};
      var page = ref.page;
      var limit = ref.limit;
      var dateFrom = ref.dateFrom;
      var dateTo = ref.dateTo;

      // eslint-disable-next-line
      vitalsElement = vitalsElement.split(/[-_]/g).map(function (w) { return w[0].toUpperCase() + w.substr(1); }).join('');
      var date_range;
      if (dateFrom && dateTo) {
        date_range = [new Date(dateFrom).toJSON(), new Date(dateTo).toJSON()];
      }
      return api$1.getFragments({
        addon: 'health_vitals',
        kind: ("Vitals" + vitalsElement + "Item"),
        with_filters: true,
        with_permission_to: true,
        user_id: Actor.id || user.id,
        actor_id: Actor.id,
        page: page || 1,
        limit: limit || 50,
        date_range: date_range,
      }, {
        cache: false,
      });
    },
    addRecord: function addRecord(vitalsElement, user, data) {
      // eslint-disable-next-line
      vitalsElement = vitalsElement.split(/[-_]/g).map(function (w) { return w[0].toUpperCase() + w.substr(1); }).join('');
      var startAt = new Date(data.date);
      startAt.setHours(parseInt(data.time.split(':')[0], 10), parseInt(data.time.split(':')[1], 10));
      var tagUser = Actor.user || user;
      var obj = {
        addon: 'health_vitals',
        kind: ("Vitals" + vitalsElement + "Item"),
        with_filters: true,
        start_at: startAt.toJSON(),
        tags: [{
          context: 'members',
          name: tagUser.name || ((tagUser.first_name || '') + " " + (tagUser.last_name || '')),
          user_id: Actor.id || user.id,
        }],
        filters: [{
          context: 'members',
          name: tagUser.name || ((tagUser.first_name || '') + " " + (tagUser.last_name || '')),
          user_id: Actor.id || user.id,
        }],
        data: JSON.stringify(data),
      };
      if (Actor.id) {
        obj.actor_id = Actor.id;
        obj.actor_type = 'User';
      }
      return api$1.createFragment(obj);
    },
    getSettings: function getSettings(vitalsElement) {
      return api$1.call({
        endpoint: ("addons/health_vitals/install/settings/" + vitalsElement),
        method: 'GET',
        cache: false,
      }).then(function (res) {
        if (!res) { return res; }
        if (!res.data) { return null; }
        return res.data;
      });
    },
    saveSettings: function saveSettings(vitalsElement, settings) {
      if ( settings === void 0 ) settings = {};

      return api$1.call({
        endpoint: ("addons/health_vitals/install/settings/" + vitalsElement),
        method: 'PUT',
        data: { data: JSON.stringify(settings) },
      });
    },
  };

  var Index$1 = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-page',{class:("vitals-elment-index-page vitals-" + (_vm.vitalsElement) + "-index-page"),attrs:{"id":"vitals_element__index"},on:{"page:beforein":_vm.onPageBeforeIn,"page:beforeout":_vm.onPageBeforeOut},nativeOn:{"!scroll":function($event){return _vm.onPageScroll($event)}}},[_c('f7-navbar',[_c('tommy-nav-back'),_vm._v(" "),_c('f7-nav-title',[_vm._v(_vm._s(_vm.t('title')))]),_vm._v(" "),_c('f7-nav-right',[_c('f7-link',{attrs:{"href":("/health_vitals/" + (_vm.vitalsElement) + "/settings/"),"icon-only":""}},[_c('i',{class:("icon vitals-element-icon-settings vitals-" + (_vm.vitalsElement) + "-icon-settings")})]),_vm._v(" "),_c('f7-link',{attrs:{"href":("/health_vitals/" + (_vm.vitalsElement) + "/history/"),"icon-only":""}},[_c('i',{class:("icon vitals-element-icon-chart vitals-" + (_vm.vitalsElement) + "-icon-chart")})])],1)],1),_vm._v(" "),_c('f7-fab',{class:("vitals-element-fab vitals-" + (_vm.vitalsElement) + "-fab"),attrs:{"href":("/health_vitals/" + (_vm.vitalsElement) + "/add/")}},[_c('f7-icon',{attrs:{"f7":"add"}})],1),_vm._v(" "),_c('div',{class:("vitals-element-index-header vitals-" + (_vm.vitalsElement) + "-index-header")},[_c('div',{class:("vitals-element-index-header-icon vitals-" + (_vm.vitalsElement) + "-index-header-icon")}),_vm._v(" "),(_vm.data && _vm.data.length)?_c('div',{class:("vitals-element-index-header-content vitals-" + (_vm.vitalsElement) + "-index-header-content")},[_c('div',{class:("vitals-element-index-header-data vitals-" + (_vm.vitalsElement) + "-index-header-data")},[_vm._v(_vm._s(_vm.data[0].data.value)),_c('span',[_vm._v(_vm._s(_vm.t(("vital_unit." + (_vm.data[0].data.unit || 0)))))])]),_vm._v(" "),_c('div',{class:("vitals-element-index-header-date vitals-" + (_vm.vitalsElement) + "-index-header-date")},[_vm._v(_vm._s(_vm.$moment(_vm.data[0].data.date).format('DD MMM YYYY'))+" "+_vm._s(_vm.data[0].data.time))])]):_vm._e(),_vm._v(" "),(_vm.data && !_vm.data.length)?_c('div',{class:("vitals-element-index-header-content vitals-" + (_vm.vitalsElement) + "-index-header-content")},[_c('div',{class:("vitals-element-index-header-data vitals-" + (_vm.vitalsElement) + "-index-header-data")},[_vm._v(_vm._s(_vm.t('vital_label')))])]):_vm._e()]),_vm._v(" "),(_vm.data && !_vm.data.length)?_c('div',{class:("vitals-element-index-no-data vitals-" + (_vm.vitalsElement) + "-index-no-data")},[_c('i',{class:("vitals-element-index-no-data-img vitals-" + (_vm.vitalsElement) + "-index-no-data-img")}),_vm._v(" "),_c('span',[_vm._v(_vm._s(_vm.t('not_available')))])]):_vm._e(),_vm._v(" "),(_vm.data && _vm.data.length)?_c('div',{class:("vitals-element-index-cards vitals-" + (_vm.vitalsElement) + "-index-cards")},_vm._l((_vm.data),function(item,index){return _c('div',{key:index,class:("vitals-element-card vitals-" + (_vm.vitalsElement) + "-card " + (_vm.cardExtraClass(item)))},[_c('div',{class:("vitals-element-card-title vitals-" + (_vm.vitalsElement) + "-card-title")},[_vm._v(_vm._s(_vm.$moment(item.data.date).format('DD MMM YYYY'))+" "+_vm._s(item.data.time))]),_vm._v(" "),_c('div',{class:("vitals-element-card-content vitals-" + (_vm.vitalsElement) + "-card-content")},[_c('div',{class:("vitals-element-card-icon vitals-" + (_vm.vitalsElement) + "-card-icon")},[(_vm.cardCustomIconName(item))?_c('img',{attrs:{"src":((_vm.$addonAssetsUrl) + "/" + (_vm.vitalsElement) + "/" + (_vm.cardCustomIconName(item)) + ".svg")}}):_c('img',{attrs:{"src":((_vm.$addonAssetsUrl) + "/" + (_vm.vitalsElement) + "/card-icon.svg")}})]),_vm._v(" "),_c('div',{class:("vitals-element-card-value vitals-" + (_vm.vitalsElement) + "-card-value")},[_vm._v(_vm._s(item.data.value)+" "),_c('sub',[_vm._v(_vm._s(_vm.t(("vital_unit." + (item.data.unit || 0)))))])])])])})):_vm._e()],1)},staticRenderFns: [],
    props: {
      vitalsElement: String,
      indexCardExtraClass: [String, Function],
      indexCardCustomIconName: [String, Function],
    },
    data: function data() {
      return {
        data: null,
      };
    },
    mounted: function mounted() {
      var self = this;
      self.getData();
      self.$events.$on(((self.vitalsElement) + ":updateRecords"), self.getData);
    },
    beforeDestroy: function beforeDestroy() {
      var self = this;
      self.$events.$off(((self.vitalsElement) + ":updateRecords"), self.getData);
    },
    methods: {
      cardCustomIconName: function cardCustomIconName(item) {
        var self = this;
        if (self.indexCardCustomIconName) {
          if (typeof self.indexCardCustomIconName === 'function') { return self.indexCardCustomIconName(item); }
          return self.indexCardCustomIconName;
        }
        return '';
      },
      cardExtraClass: function cardExtraClass(item) {
        var self = this;
        if (self.indexCardExtraClass) {
          if (typeof self.indexCardExtraClass === 'function') { return self.indexCardExtraClass(item); }
          return self.indexCardExtraClass;
        }
        return '';
      },
      t: function t(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".index." + v), d);
      },
      getData: function getData() {
        var self = this;
        API$1.getRecords(self.vitalsElement, self.$root.user).then(function (data) {
          self.data = data.filter(function (el) { return el.data && el.data.value; }).sort(function (a, b) {
            var aDate = new Date(a.data.date);
            var ref = a.data.time.split(':');
            var aH = ref[0];
            var aM = ref[1];
            aDate.setHours(parseInt(aH, 10), parseInt(aM, 10));

            var bDate = new Date(b.data.date);
            var ref$1 = b.data.time.split(':');
            var bH = ref$1[0];
            var bM = ref$1[1];
            bDate.setHours(parseInt(bH, 10), parseInt(bM, 10));

            return bDate - aDate;
          });
        });
      },
      onPageScroll: function onPageScroll(e) {
        var self = this;
        var $pageContentEl = self.$$(e.target).closest('.page-content');
        if (!$pageContentEl.length) { return; }
        var scrollTop = $pageContentEl[0].scrollTop;
        if (scrollTop > 100) {
          self.$f7router.view.$navbarEl.removeClass(("vitals-element-index-navbar vitals-" + (self.vitalsElement) + "-index-navbar"));
        } else {
          self.$f7router.view.$navbarEl.addClass(("vitals-element-index-navbar vitals-" + (self.vitalsElement) + "-index-navbar"));
        }
      },
      onPageBeforeIn: function onPageBeforeIn() {
        var self = this;
        self.$f7router.view.$navbarEl.addClass(("vitals-element-index-navbar vitals-" + (self.vitalsElement) + "-index-navbar"));
      },
      onPageBeforeOut: function onPageBeforeOut() {
        var self = this;
        self.$f7router.view.$navbarEl.removeClass(("vitals-element-index-navbar vitals-" + (self.vitalsElement) + "-index-navbar"));
      },
    },
  };

  var Add = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-page',{class:("vitals-element-manual-add-page vitals-" + (_vm.vitalsElement) + "-manual-add-page"),attrs:{"id":"vitals_element__add"}},[_c('f7-navbar',[_c('tommy-nav-back'),_vm._v(" "),_c('f7-nav-title',[_vm._v(_vm._s(_vm.t('title')))]),_vm._v(" "),_c('f7-nav-right',[(_vm.allowSave)?_c('f7-link',{attrs:{"href":"#","icon-only":""},on:{"click":_vm.save}},[_c('i',{staticClass:"icon f7-icons"},[_vm._v("check")])]):_vm._e()],1)],1),_vm._v(" "),_c('f7-list',[_c('f7-list-input',{attrs:{"type":"number","inline-label":"","value":_vm.value,"min":"1","label":_vm.t('vital_label')},on:{"input":function($event){_vm.value = $event.target.value;}}},[_c('span',{staticClass:"vitals-element-input-unit",attrs:{"slot":"inner"},slot:"inner"},[_vm._v(_vm._s(_vm.t('vital_unit.0')))])]),_vm._v(" "),_c('f7-list-input',{attrs:{"type":"text","inline-label":"","input-id":"date-input","label":_vm.t('date_label')}}),_vm._v(" "),_c('f7-list-input',{attrs:{"type":"text","inline-label":"","input-id":"time-input","label":_vm.t('time_label')}}),_vm._v(" "),_vm._l((_vm.manualAddExtraFields),function(field,index){return [(field.type === 'smartselect')?_c('f7-list-item',{key:index,attrs:{"title":field.label(_vm.$t),"smart-select":"","smart-select-params":{openIn: 'popover', closeOnSelect: true}}},[_c('select',{on:{"change":function($event){_vm.onExtraFieldChange($event, field);}}},_vm._l((field.values(_vm.$t)),function(value,valueIndex){return _c('option',{key:valueIndex,domProps:{"value":value.value}},[_vm._v(_vm._s(value.display))])}))]):_vm._e(),_vm._v(" "),(field.type === 'select')?_c('f7-list-input',{key:index,attrs:{"type":field.type,"value":this[field.propName],"label":field.label(_vm.$t),"input-style":field.inputStyle,"inline-label":""},on:{"change":function($event){_vm.onExtraFieldChange($event, field);}}},_vm._l((field.values(_vm.$t)),function(value,valueIndex){return _c('option',{key:valueIndex,domProps:{"value":value.value}},[_vm._v(_vm._s(value.display))])})):_vm._e()]})],2)],1)},staticRenderFns: [],
    props: {
      vitalsElement: String,
      manualAddExtraFields: Array,
    },
    data: function data() {
      var self = this;
      var extraFields = {};
      if (self.manualAddExtraFields) {
        self.manualAddExtraFields.forEach(function (field) {
          extraFields[field.propName] = field.defaultValue;
        });
      }
      return Object.assign({}, {value: '',
        date: '',
        time: ''},
        extraFields);
    },
    computed: {
      allowSave: function allowSave() {
        var self = this;
        return self.value && self.value > 0;
      },
    },
    mounted: function mounted() {
      var self = this;
      self.$f7.calendar.create({
        inputEl: self.$el.querySelector('#date-input'),
        value: [new Date()],
        on: {
          change: function change(c, v) {
            self.date = new Date(v[0]);
            self.date.setHours(0, 0, 0, 0);
          },
        },
      });

      var hours = new Date().getHours();
      if (hours < 10) { hours = "0" + hours; }
      var minutes = new Date().getMinutes();
      if (minutes < 10) { minutes = "0" + minutes; }

      self.$f7.picker.create({
        inputEl: self.$el.querySelector('#time-input'),
        value: [hours.toString(), minutes.toString()],
        formatValue: function formatValue(v) {
          return ((v[0]) + ":" + (v[1]));
        },
        cols: [
          {
            values: (function () {
              var v = [];
              for (var i = 0; i < 24; i += 1) {
                if (i < 10) { v.push(("0" + i)); }
                else { v.push(i.toString()); }
              }
              return v;
            })(),
          },
          {
            divider: true,
            content: ':',
          },
          {
            values: (function () {
              var v = [];
              for (var i = 0; i < 60; i += 1) {
                if (i < 10) { v.push(("0" + i)); }
                else { v.push(i.toString()); }
              }
              return v;
            })(),
          } ],
        on: {
          change: function change(p, v) {
            self.time = v.join(':');
          },
        },
      });
    },
    methods: {
      onExtraFieldChange: function onExtraFieldChange(event, field) {
        this[field.propName] = event.target.value;
      },
      t: function t(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".manual_enter." + v), d);
      },
      save: function save() {
        var self = this;
        var value = self.value;
        var date = self.date;
        var time = self.time;
        var extraFields = {};
        if (self.manualAddExtraFields) {
          self.manualAddExtraFields.forEach(function (field) {
            extraFields[field.propName] = self[field.propName];
          });
        }
        API$1.addRecord(
          self.vitalsElement,
          self.$root.user,
          Object.assign({}, {value: value,
            date: new Date(date).toJSON(),
            time: time,
            unit: 0},
            extraFields)
        ).then(function () {
          self.$events.$emit(((self.vitalsElement) + ":updateRecords"));
          self.$f7router.back();
        });
      },
    },
  };

  var settings = {
    receiveMessage: false,
  };

  var Settings = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-page',{class:("vitals-element-settings-page vitals-" + (_vm.vitalsElement) + "-settings-page"),attrs:{"id":"vitals_element__settings"}},[_c('f7-navbar',[_c('tommy-nav-back'),_vm._v(" "),_c('f7-nav-title',[_vm._v(_vm._s(_vm.t('title')))])],1),_vm._v(" "),_c('div',{class:("vitals-element-settings-header vitals-" + (_vm.vitalsElement) + "-settings-header")},[_c('div',{class:("vitals-element-settings-icon vitals-" + (_vm.vitalsElement) + "-settings-icon")}),_vm._v(" "),_c('div',{class:("vitals-element-settings-center-icon vitals-" + (_vm.vitalsElement) + "-settings-center-icon")})]),_vm._v(" "),_c('div',{class:("vitals-element-settings-text vitals-" + (_vm.vitalsElement) + "-settings-text")},[_c('p',[_vm._v(_vm._s(_vm.t('vital_text')))])]),_vm._v(" "),_c('f7-list',{staticClass:"no-hairlines"},[_c('f7-list-item',{attrs:{"title":_vm.t('chat_label')}},[_c('f7-toggle',{attrs:{"slot":"after","checked":_vm.settings.receiveMessage},on:{"toggle:change":_vm.onMessagesChanges},slot:"after"})],1)],1)],1)},staticRenderFns: [],
    props: {
      vitalsElement: String,
    },
    data: function data() {
      return {
        settings: settings,
      };
    },
    mounted: function mounted() {
      var self = this;
      API$1.getSettings(self.vitalsElement).then(function (res) {
        if (!res) { return; }
        self.settings = res;
        settings = self.settings;
      });
    },
    methods: {
      t: function t(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".settings." + v), d);
      },
      onMessagesChanges: function onMessagesChanges(checked) {
        var self = this;
        self.settings.receiveMessage = checked;
        settings = self.settings;
        API$1.saveSettings(self.vitalsElement, self.settings);
      },
    },
  };

  var History = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-page',{class:("vitals-element-history-page vitals-" + (_vm.vitalsElement) + "-history-page"),attrs:{"id":"vitals_element__history"}},[_c('f7-navbar',[_c('tommy-nav-back'),_vm._v(" "),_c('f7-nav-title',[_vm._v(_vm._s(_vm.t('title')))])],1),_vm._v(" "),_c('f7-block',[_c('f7-segmented',[_c('f7-button',{attrs:{"active":_vm.range === 'day'},on:{"click":function($event){_vm.range = 'day';}}},[_vm._v(_vm._s(_vm.t('date_options.0')))]),_vm._v(" "),_c('f7-button',{attrs:{"active":_vm.range === 'week'},on:{"click":function($event){_vm.range = 'week';}}},[_vm._v(_vm._s(_vm.t('date_options.1')))]),_vm._v(" "),_c('f7-button',{attrs:{"active":_vm.range === 'month'},on:{"click":function($event){_vm.range = 'month';}}},[_vm._v(_vm._s(_vm.t('date_options.2')))])],1)],1),_vm._v(" "),_c('div',{class:("vitals-element-chart-clicked vitals-" + (_vm.vitalsElement) + "-chart-clicked")},[_c('span',[_vm._v(_vm._s(_vm.clickedDate))]),_vm._v(" "),_c('span',[_vm._v(_vm._s(_vm.clickedValue))]),_vm._v(" "),(_vm.clickedExtra)?_c('span',{domProps:{"innerHTML":_vm._s(_vm.clickedExtra)}}):_vm._e()]),_vm._v(" "),(_vm.data && _vm.data.length)?[(_vm.range === 'day')?_c('div',{key:"chart-day",class:("vitals-element-chart vitals-" + (_vm.vitalsElement) + "-chart")},[_c('div',{ref:"chartDay"})]):_vm._e(),_vm._v(" "),(_vm.range === 'week')?_c('div',{key:"chart-week",class:("vitals-element-chart vitals-" + (_vm.vitalsElement) + "-chart")},[_c('div',{ref:"chartWeek"})]):_vm._e(),_vm._v(" "),(_vm.range === 'month')?_c('div',{key:"chart-month",class:("vitals-element-chart vitals-" + (_vm.vitalsElement) + "-chart")},[_c('div',{ref:"chartMonth"})]):_vm._e()]:_vm._e()],2)},staticRenderFns: [],
    props: {
      vitalsElement: String,
      chartType: {
        type: String,
        default: 'line',
      },
      chartColor: {
        type: String,
        default: '#5FA81A',
      },
      chartMarkerColor: String,
      chartClickedExtra: Function,
      chartWeekSumsDays: Boolean,
      chartMonthSumsDays: Boolean,
    },
    data: function data() {
      return {
        data: null,
        clicked: null,
        range: 'day',
      };
    },
    mounted: function mounted() {
      var self = this;
      var dateFrom = new Date().setMonth(new Date().getMonth() - 1);
      var dateTo = new Date();
      API$1.getRecords(self.vitalsElement, self.$root.user, { dateFrom: dateFrom, dateTo: dateTo }).then(function (data) {
        self.data = (data || []).sort(function (a, b) {
          var aDate = self.itemDate(a);
          var bDate = self.itemDate(b);

          return aDate.getTime() - bDate.getTime();
        });
        self.$nextTick(function () {
          self.initChart();
        });
      });
    },
    watch: {
      range: function range() {
        var self = this;
        self.clicked = null;
        self.$nextTick(function () {
          self.initChart();
        });
      },
    },
    computed: {
      clickedDate: function clickedDate() {
        var self = this;
        if (!self.clicked) { return ''; }
        if (self.chartWeekSumsDays && self.range === 'week') {
          return self.$moment(self.clicked.x).format('DD MMM YYYY');
        }
        if (self.chartMonthSumsDays && self.range === 'month') {
          return self.$moment(self.clicked.x).format('DD MMM YYYY');
        }
        return self.$moment(self.clicked.x).format('DD MMM YYYY HH:mm');
      },
      clickedValue: function clickedValue() {
        var self = this;
        if (!self.clicked) { return ''; }
        var originalItem = self.data[self.clicked.id];
        return ((self.clicked.y) + " " + (self.t(("vital_unit." + (originalItem.data.unit)))));
      },
      clickedExtra: function clickedExtra() {
        var self = this;
        if (!self.clicked) { return ''; }
        if (self.chartClickedExtra) {
          var originalItem = self.data[self.clicked.id];
          return self.chartClickedExtra(originalItem, self.$t);
        }
        return '';
      },

      todayValues: function todayValues() {
        var self = this;
        if (!self.data) { return null; }
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        return self.data
          .filter(function (el) {
            var d = self.itemDate(el);
            if (d.getTime() > today.getTime()) { return true; }
            return false;
          })
          .map(function (el) {
            var elDate = self.itemDate(el);
            return {
              y: parseInt(el.data.value, 10),
              x: elDate,
              id: self.data.indexOf(el),
            };
          });
      },
      weekValues: function weekValues() {
        var self = this;
        if (!self.data) { return null; }
        var weekStart = new Date();
        weekStart.setHours(0, 0, 0, 0);
        weekStart.setMonth(weekStart.getMonth(), weekStart.getDate() - 7);

        var values = self.data
          .filter(function (el) {
            var d = self.itemDate(el);
            if (d.getTime() > weekStart.getTime()) { return true; }
            return false;
          });
        if (self.chartWeekSumsDays) {
          return self.sumValuesByDay(values);
        }
        return values
          .map(function (el) {
            var elDate = self.itemDate(el);
            return {
              y: parseInt(el.data.value, 10),
              x: elDate,
              id: self.data.indexOf(el),
            };
          });
      },
      monthValues: function monthValues() {
        var self = this;
        if (!self.data) { return null; }
        var monthStart = new Date();
        monthStart.setHours(0, 0, 0, 0);
        monthStart.setMonth(monthStart.getMonth() - 1, monthStart.getDate());
        var values = self.data
          .filter(function (el) {
            var d = self.itemDate(el);
            if (d.getTime() > monthStart.getTime()) { return true; }
            return false;
          });
        if (self.chartWeekSumsDays) {
          return self.sumValuesByDay(values);
        }
        return  values.map(function (el) {
          var elDate = self.itemDate(el);
          return {
            y: parseInt(el.data.value, 10),
            x: elDate,
            id: self.data.indexOf(el),
          };
        });
      },
    },
    methods: {
      sumValuesByDay: function sumValuesByDay(values) {
        var self = this;
        var newValues = [];
        var currentDate = self.itemDate(values[0]);
        currentDate.setHours(0, 0, 0, 0);
        var newIndex = 0;
        values.forEach(function (el) {
          var elDate = self.itemDate(el);
          elDate.setHours(0, 0, 0, 0);
          if (elDate.getTime() !== currentDate.getTime()) {
            newIndex += 1;
            currentDate = elDate;
          }
          if (!newValues[newIndex]) {
            newValues[newIndex] = {
              x: currentDate,
              y: 0,
              id: self.data.indexOf(el),
            };
          }
          newValues[newIndex].y += parseInt(el.data.value, 10);
        });
        return newValues;
      },
      itemDate: function itemDate(item) {
        var d = new Date(item.data.date);
        var hours = parseInt(item.data.time.split(':')[0], 10);
        var mins = parseInt(item.data.time.split(':')[1], 10);
        d.setHours(hours, mins);
        return d;
      },
      t: function t(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".history." + v), d);
      },
      initChart: function initChart() {
        var self = this;
        var range = self.range;
        if (!self.data || !self.data.length) { return; }
        var common = {
          chart: {
            type: self.chartType || 'line',
          },
          credits: {
            enabled: false,
          },
          legend: {
            enabled: false,
          },
          title: null,
          tooltip: {
            enabled: false,
          },
          xAxis: {
            type: 'datetime',
          },
          yAxis: {
            title: null,
          },
          time: {
            timezoneOffset: new Date().getTimezoneOffset(),
          },
          plotOptions: {
            line: {
              marker: {
                enabled: true,
                fillColor: self.chartMarkerColor || self.chartColor,
              },
            },
          },
        };
        var seriesCommon = {
          color: self.chartColor,
          cursor: 'pointer',
          point: {
            events: {
              click: function click() {
                self.clicked = this;
              },
              select: function select() {
                self.clicked = this;
              },
            },
          },
        };
        if (range === 'day') {
          self.$highcharts.chart(self.$refs.chartDay, Object.assign({}, common,
            {series: [Object.assign({}, seriesCommon,
              {data: self.todayValues})]}));
        }
        if (range === 'week') {
          self.$highcharts.chart(self.$refs.chartWeek, Object.assign({}, common,
            {series: [Object.assign({}, seriesCommon,
              {data: self.weekValues})]}));
        }
        if (range === 'month') {
          self.$highcharts.chart(self.$refs.chartMonth, Object.assign({}, common,
            {series: [Object.assign({}, seriesCommon,
              {data: self.monthValues})]}));
        }
      },
    },
  };

  var routes = [
    {
      path: '/health_vitals/blood_glucose/',
      component: Index$1,
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
    } ];
  routes.forEach(function (r) {
    r.options = {
      props: {
        vitalsElement: 'blood_glucose',
        indexCardCustomIconName: function indexCardCustomIconName(item) {
          if (item && item.data && item.data.state) {
            return ("card-icon-" + (item.data.state));
          }
          return '';
        },
        manualAddExtraFields: [
          {
            type: 'smartselect',
            propName: 'state',
            defaultValue: 'none',
            label: function label($t) {
              return $t('health_vitals.blood_glucose.manual_enter.vital_variants_label');
            },
            values: function values($t) {
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
                } ];
            },
          } ],
        chartColor: '#FEBFB8',
        chartMarkerColor: '#FD7E70',
        chartClickedExtra: function chartClickedExtra(item, $t) {
          var state = item.data.state;
          var states = ['none', 'beforemeal', 'aftermeal'];
          return ("\n          <span class=\"vitals-blood_glucose-chart-clicked-state-icon-" + state + "\"></span>\n          <span class=\"vitals-blood_glucose-chart-clicked-state-text\">" + ($t(("health_vitals.blood_glucose.history.vital_variants." + (states.indexOf(state))))) + "</span>\n        ").trim();
        },
      },
    };
  });

  var api$2 = window.tommy.api;

  var API$2 = {
    getRecords: function getRecords(vitalsElement, user, ref) {
      if ( ref === void 0 ) ref = {};
      var page = ref.page;
      var limit = ref.limit;
      var dateFrom = ref.dateFrom;
      var dateTo = ref.dateTo;

      // eslint-disable-next-line
      vitalsElement = vitalsElement.split(/[-_]/g).map(function (w) { return w[0].toUpperCase() + w.substr(1); }).join('');
      var date_range;
      if (dateFrom && dateTo) {
        date_range = [new Date(dateFrom).toJSON(), new Date(dateTo).toJSON()];
      }
      return api$2.getFragments({
        addon: 'health_vitals',
        kind: ("Vitals" + vitalsElement + "Item"),
        with_filters: true,
        with_permission_to: true,
        user_id: Actor.id || user.id,
        actor_id: Actor.id,
        page: page || 1,
        limit: limit || 50,
        date_range: date_range,
      }, {
        cache: false,
      });
    },
    addRecord: function addRecord(vitalsElement, user, data) {
      // eslint-disable-next-line
      vitalsElement = vitalsElement.split(/[-_]/g).map(function (w) { return w[0].toUpperCase() + w.substr(1); }).join('');
      var startAt = new Date(data.date);
      startAt.setHours(parseInt(data.time.split(':')[0], 10), parseInt(data.time.split(':')[1], 10));
      var tagUser = Actor.user || user;
      var obj = {
        addon: 'health_vitals',
        kind: ("Vitals" + vitalsElement + "Item"),
        with_filters: true,
        start_at: startAt.toJSON(),
        tags: [{
          context: 'members',
          name: tagUser.name || ((tagUser.first_name || '') + " " + (tagUser.last_name || '')),
          user_id: Actor.id || user.id,
        }],
        filters: [{
          context: 'members',
          name: tagUser.name || ((tagUser.first_name || '') + " " + (tagUser.last_name || '')),
          user_id: Actor.id || user.id,
        }],
        data: JSON.stringify(data),
      };
      if (Actor.id) {
        obj.actor_id = Actor.id;
        obj.actor_type = 'User';
      }
      return api$2.createFragment(obj);
    },
    getSettings: function getSettings(vitalsElement) {
      return api$2.call({
        endpoint: ("addons/health_vitals/install/settings/" + vitalsElement),
        method: 'GET',
        cache: false,
      }).then(function (res) {
        if (!res) { return res; }
        if (!res.data) { return null; }
        return res.data;
      });
    },
    saveSettings: function saveSettings(vitalsElement, settings) {
      if ( settings === void 0 ) settings = {};

      return api$2.call({
        endpoint: ("addons/health_vitals/install/settings/" + vitalsElement),
        method: 'PUT',
        data: { data: JSON.stringify(settings) },
      });
    },
  };

  var Index$2 = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-page',{class:("vitals-elment-index-page vitals-" + (_vm.vitalsElement) + "-index-page"),attrs:{"id":"vitals_element__index"},on:{"page:beforein":_vm.onPageBeforeIn,"page:beforeout":_vm.onPageBeforeOut},nativeOn:{"!scroll":function($event){return _vm.onPageScroll($event)}}},[_c('f7-navbar',[_c('tommy-nav-back'),_vm._v(" "),_c('f7-nav-title',[_vm._v(_vm._s(_vm.t('title')))]),_vm._v(" "),_c('f7-nav-right',[_c('f7-link',{attrs:{"href":("/health_vitals/" + (_vm.vitalsElement) + "/settings/"),"icon-only":""}},[_c('i',{class:("icon vitals-element-icon-settings vitals-" + (_vm.vitalsElement) + "-icon-settings")})]),_vm._v(" "),_c('f7-link',{attrs:{"href":("/health_vitals/" + (_vm.vitalsElement) + "/history/"),"icon-only":""}},[_c('i',{class:("icon vitals-element-icon-chart vitals-" + (_vm.vitalsElement) + "-icon-chart")})])],1)],1),_vm._v(" "),_c('f7-fab',{class:("vitals-element-fab vitals-" + (_vm.vitalsElement) + "-fab"),attrs:{"href":("/health_vitals/" + (_vm.vitalsElement) + "/add/")}},[_c('f7-icon',{attrs:{"f7":"add"}})],1),_vm._v(" "),_c('div',{class:("vitals-element-index-header vitals-" + (_vm.vitalsElement) + "-index-header")},[_c('div',{class:("vitals-element-index-header-icon vitals-" + (_vm.vitalsElement) + "-index-header-icon")}),_vm._v(" "),(_vm.data && _vm.data.length)?_c('div',{class:("vitals-element-index-header-content vitals-" + (_vm.vitalsElement) + "-index-header-content")},[_c('div',{class:("vitals-element-index-header-data vitals-" + (_vm.vitalsElement) + "-index-header-data")},[_vm._v(_vm._s(_vm.data[0].data.value[0])+"/"+_vm._s(_vm.data[0].data.value[1])),_c('span',[_vm._v(_vm._s(_vm.t(("vital_unit." + (_vm.data[0].data.unit[0] || 0)))))])]),_vm._v(" "),_c('div',{class:("vitals-element-index-header-date vitals-" + (_vm.vitalsElement) + "-index-header-date")},[_vm._v(_vm._s(_vm.$moment(_vm.data[0].data.date).format('DD MMM YYYY'))+" "+_vm._s(_vm.data[0].data.time))])]):_vm._e(),_vm._v(" "),(_vm.data && !_vm.data.length)?_c('div',{class:("vitals-element-index-header-content vitals-" + (_vm.vitalsElement) + "-index-header-content")},[_c('div',{class:("vitals-element-index-header-data vitals-" + (_vm.vitalsElement) + "-index-header-data")},[_vm._v(_vm._s(_vm.t('vital_label')))])]):_vm._e()]),_vm._v(" "),(_vm.data && !_vm.data.length)?_c('div',{class:("vitals-element-index-no-data vitals-" + (_vm.vitalsElement) + "-index-no-data")},[_c('i',{class:("vitals-element-index-no-data-img vitals-" + (_vm.vitalsElement) + "-index-no-data-img")}),_vm._v(" "),_c('span',[_vm._v(_vm._s(_vm.t('not_available')))])]):_vm._e(),_vm._v(" "),(_vm.data && _vm.data.length)?_c('div',{class:("vitals-element-index-cards vitals-" + (_vm.vitalsElement) + "-index-cards")},_vm._l((_vm.data),function(item,index){return _c('div',{key:index,class:("vitals-element-card vitals-" + (_vm.vitalsElement) + "-card")},[_c('div',{class:("vitals-element-card-title vitals-" + (_vm.vitalsElement) + "-card-title")},[_vm._v(_vm._s(_vm.$moment(item.data.date).format('DD MMM YYYY'))+" "+_vm._s(item.data.time))]),_vm._v(" "),_c('div',{class:("vitals-element-card-content vitals-" + (_vm.vitalsElement) + "-card-content")},[_c('div',{class:("vitals-element-card-value vitals-" + (_vm.vitalsElement) + "-card-value")},[_vm._v(_vm._s(item.data.value[0])+"/"+_vm._s(item.data.value[1])+" "),_c('sub',[_vm._v(_vm._s(_vm.t(("vital_unit." + (item.data.unit[0] || 0)))))])]),_vm._v(" "),_c('div',{class:("vitals-element-card-value vitals-" + (_vm.vitalsElement) + "-card-value")},[_vm._v(_vm._s(item.data.value[2])+" "),_c('sub',[_vm._v(_vm._s(_vm.t(("bpm_unit." + (item.data.unit[2] || 0)))))])])])])})):_vm._e()],1)},staticRenderFns: [],
    props: {
      vitalsElement: String,
      indexCardCustomIconName: [String, Function],
    },
    data: function data() {
      return {
        data: null,
      };
    },
    mounted: function mounted() {
      var self = this;
      self.getData();
      self.$events.$on(((self.vitalsElement) + ":updateRecords"), self.getData);
    },
    beforeDestroy: function beforeDestroy() {
      var self = this;
      self.$events.$off(((self.vitalsElement) + ":updateRecords"), self.getData);
    },
    methods: {
      t: function t(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".index." + v), d);
      },
      getData: function getData() {
        var self = this;
        API$2.getRecords(self.vitalsElement, self.$root.user).then(function (data) {
          self.data = data.filter(function (el) { return el.data && el.data.value; }).sort(function (a, b) {
            var aDate = new Date(a.data.date);
            var ref = a.data.time.split(':');
            var aH = ref[0];
            var aM = ref[1];
            aDate.setHours(parseInt(aH, 10), parseInt(aM, 10));

            var bDate = new Date(b.data.date);
            var ref$1 = b.data.time.split(':');
            var bH = ref$1[0];
            var bM = ref$1[1];
            bDate.setHours(parseInt(bH, 10), parseInt(bM, 10));

            return bDate - aDate;
          });
        });
      },
      onPageScroll: function onPageScroll(e) {
        var self = this;
        var $pageContentEl = self.$$(e.target).closest('.page-content');
        if (!$pageContentEl.length) { return; }
        var scrollTop = $pageContentEl[0].scrollTop;
        if (scrollTop > 100) {
          self.$f7router.view.$navbarEl.removeClass(("vitals-element-index-navbar vitals-" + (self.vitalsElement) + "-index-navbar"));
        } else {
          self.$f7router.view.$navbarEl.addClass(("vitals-element-index-navbar vitals-" + (self.vitalsElement) + "-index-navbar"));
        }
      },
      onPageBeforeIn: function onPageBeforeIn() {
        var self = this;
        self.$f7router.view.$navbarEl.addClass(("vitals-element-index-navbar vitals-" + (self.vitalsElement) + "-index-navbar"));
      },
      onPageBeforeOut: function onPageBeforeOut() {
        var self = this;
        self.$f7router.view.$navbarEl.removeClass(("vitals-element-index-navbar vitals-" + (self.vitalsElement) + "-index-navbar"));
      },
    },
  };

  var Add$1 = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-page',{class:("vitals-element-manual-add-page vitals-" + (_vm.vitalsElement) + "-manual-add-page"),attrs:{"id":"vitals_element__add"}},[_c('f7-navbar',[_c('tommy-nav-back'),_vm._v(" "),_c('f7-nav-title',[_vm._v(_vm._s(_vm.t('title')))]),_vm._v(" "),_c('f7-nav-right',[(_vm.allowSave)?_c('f7-link',{attrs:{"href":"#","icon-only":""},on:{"click":_vm.save}},[_c('i',{staticClass:"icon f7-icons"},[_vm._v("check")])]):_vm._e()],1)],1),_vm._v(" "),_c('f7-list',[_c('f7-list-input',{attrs:{"type":"number","inline-label":"","value":_vm.sys,"min":"1","label":_vm.t('sys_label')},on:{"input":function($event){_vm.sys = $event.target.value;}}},[_c('span',{staticClass:"vitals-element-input-unit",attrs:{"slot":"inner"},slot:"inner"},[_vm._v(_vm._s(_vm.t('sys_unit.0')))])]),_vm._v(" "),_c('f7-list-input',{attrs:{"type":"number","inline-label":"","value":_vm.dia,"min":"1","label":_vm.t('dia_label')},on:{"input":function($event){_vm.dia = $event.target.value;}}},[_c('span',{staticClass:"vitals-element-input-unit",attrs:{"slot":"inner"},slot:"inner"},[_vm._v(_vm._s(_vm.t('dia_unit.0')))])]),_vm._v(" "),_c('f7-list-input',{attrs:{"type":"number","inline-label":"","value":_vm.bpm,"min":"1","label":_vm.t('bpm_label')},on:{"input":function($event){_vm.bpm = $event.target.value;}}},[_c('span',{staticClass:"vitals-element-input-unit",attrs:{"slot":"inner"},slot:"inner"},[_vm._v(_vm._s(_vm.t('bpm_unit.0')))])]),_vm._v(" "),_c('f7-list-input',{attrs:{"type":"text","inline-label":"","input-id":"date-input","label":_vm.t('date_label')}}),_vm._v(" "),_c('f7-list-input',{attrs:{"type":"text","inline-label":"","input-id":"time-input","label":_vm.t('time_label')}})],1)],1)},staticRenderFns: [],
    props: {
      vitalsElement: String,
    },
    data: function data() {
      return {
        sys: '',
        dia: '',
        bpm: '',
        date: '',
        time: '',
      };
    },
    computed: {
      allowSave: function allowSave() {
        var self = this;
        return self.sys && self.sys > 0 && self.dia && self.dia > 0 && self.bpm && self.bpm > 0;
      },
    },
    mounted: function mounted() {
      var self = this;
      self.$f7.calendar.create({
        inputEl: self.$el.querySelector('#date-input'),
        value: [new Date()],
        on: {
          change: function change(c, v) {
            self.date = new Date(v[0]);
            self.date.setHours(0, 0, 0, 0);
          },
        },
      });

      var hours = new Date().getHours();
      if (hours < 10) { hours = "0" + hours; }
      var minutes = new Date().getMinutes();
      if (minutes < 10) { minutes = "0" + minutes; }

      self.$f7.picker.create({
        inputEl: self.$el.querySelector('#time-input'),
        value: [hours.toString(), minutes.toString()],
        formatValue: function formatValue(v) {
          return ((v[0]) + ":" + (v[1]));
        },
        cols: [
          {
            values: (function () {
              var v = [];
              for (var i = 0; i < 24; i += 1) {
                if (i < 10) { v.push(("0" + i)); }
                else { v.push(i.toString()); }
              }
              return v;
            })(),
          },
          {
            divider: true,
            content: ':',
          },
          {
            values: (function () {
              var v = [];
              for (var i = 0; i < 60; i += 1) {
                if (i < 10) { v.push(("0" + i)); }
                else { v.push(i.toString()); }
              }
              return v;
            })(),
          } ],
        on: {
          change: function change(p, v) {
            self.time = v.join(':');
          },
        },
      });
    },
    methods: {
      t: function t(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".manual_enter." + v), d);
      },
      save: function save() {
        var self = this;
        var sys = self.sys;
        var dia = self.dia;
        var bpm = self.bpm;
        var date = self.date;
        var time = self.time;
        API$2.addRecord(
          self.vitalsElement,
          self.$root.user,
          {
            value: [sys, dia, bpm],
            date: new Date(date).toJSON(),
            time: time,
            unit: [0, 0, 0],
          }
        ).then(function () {
          self.$events.$emit(((self.vitalsElement) + ":updateRecords"));
          self.$f7router.back();
        });
      },
    },
  };

  var settings$1 = {
    receiveMessage: false,
  };

  var Settings$1 = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-page',{class:("vitals-element-settings-page vitals-" + (_vm.vitalsElement) + "-settings-page"),attrs:{"id":"vitals_element__settings"}},[_c('f7-navbar',[_c('tommy-nav-back'),_vm._v(" "),_c('f7-nav-title',[_vm._v(_vm._s(_vm.t('title')))])],1),_vm._v(" "),_c('div',{class:("vitals-element-settings-header vitals-" + (_vm.vitalsElement) + "-settings-header")},[_c('div',{class:("vitals-element-settings-icon vitals-" + (_vm.vitalsElement) + "-settings-icon")}),_vm._v(" "),_c('div',{class:("vitals-element-settings-center-icon vitals-" + (_vm.vitalsElement) + "-settings-center-icon")})]),_vm._v(" "),_c('div',{class:("vitals-element-settings-text vitals-" + (_vm.vitalsElement) + "-settings-text")},[_c('p',[_vm._v(_vm._s(_vm.t('vital_text')))])]),_vm._v(" "),_c('f7-list',{staticClass:"no-hairlines"},[_c('f7-list-item',{attrs:{"title":_vm.t('chat_label')}},[_c('f7-toggle',{attrs:{"slot":"after","checked":_vm.settings.receiveMessage},on:{"toggle:change":_vm.onMessagesChanges},slot:"after"})],1)],1)],1)},staticRenderFns: [],
    props: {
      vitalsElement: String,
    },
    data: function data() {
      return {
        settings: settings$1,
      };
    },
    mounted: function mounted() {
      var self = this;
      API$2.getSettings(self.vitalsElement).then(function (res) {
        if (!res) { return; }
        self.settings = res;
        settings$1 = self.settings;
      });
    },
    methods: {
      t: function t(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".settings." + v), d);
      },
      onMessagesChanges: function onMessagesChanges(checked) {
        var self = this;
        self.settings.receiveMessage = checked;
        settings$1 = self.settings;
        API$2.saveSettings(self.vitalsElement, self.settings);
      },
    },
  };

  var History$1 = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-page',{class:("vitals-element-history-page vitals-" + (_vm.vitalsElement) + "-history-page"),attrs:{"id":"vitals_element__history"}},[_c('f7-navbar',[_c('tommy-nav-back'),_vm._v(" "),_c('f7-nav-title',[_vm._v(_vm._s(_vm.t('title')))])],1),_vm._v(" "),_c('f7-block',[_c('f7-segmented',[_c('f7-button',{attrs:{"active":_vm.range === 'day'},on:{"click":function($event){_vm.range = 'day';}}},[_vm._v(_vm._s(_vm.t('date_options.0')))]),_vm._v(" "),_c('f7-button',{attrs:{"active":_vm.range === 'week'},on:{"click":function($event){_vm.range = 'week';}}},[_vm._v(_vm._s(_vm.t('date_options.1')))]),_vm._v(" "),_c('f7-button',{attrs:{"active":_vm.range === 'month'},on:{"click":function($event){_vm.range = 'month';}}},[_vm._v(_vm._s(_vm.t('date_options.2')))])],1)],1),_vm._v(" "),_c('div',{class:("vitals-element-chart-clicked vitals-" + (_vm.vitalsElement) + "-chart-clicked")},[_c('span',[_vm._v(_vm._s(_vm.clickedDate))]),_vm._v(" "),_c('span',[_vm._v(_vm._s(_vm.clickedValue))])]),_vm._v(" "),(_vm.data && _vm.data.length)?[(_vm.range === 'day')?_c('div',{key:"chart-day",class:("vitals-element-chart vitals-" + (_vm.vitalsElement) + "-chart")},[_c('div',{ref:"chartDay"})]):_vm._e(),_vm._v(" "),(_vm.range === 'week')?_c('div',{key:"chart-week",class:("vitals-element-chart vitals-" + (_vm.vitalsElement) + "-chart")},[_c('div',{ref:"chartWeek"})]):_vm._e(),_vm._v(" "),(_vm.range === 'month')?_c('div',{key:"chart-month",class:("vitals-element-chart vitals-" + (_vm.vitalsElement) + "-chart")},[_c('div',{ref:"chartMonth"})]):_vm._e()]:_vm._e()],2)},staticRenderFns: [],
    props: {
      vitalsElement: String,
    },
    data: function data() {
      return {
        data: null,
        clicked: null,
        range: 'day',
        chartColors: ['#5FA81A', '#F5A623', '#FF4500'],
      };
    },
    mounted: function mounted() {
      var self = this;
      var dateFrom = new Date().setMonth(new Date().getMonth() - 1);
      var dateTo = new Date();
      API$2.getRecords(self.vitalsElement, self.$root.user, { dateFrom: dateFrom, dateTo: dateTo }).then(function (data) {
        self.data = (data || []).sort(function (a, b) {
          var aDate = self.itemDate(a);
          var bDate = self.itemDate(b);

          return aDate.getTime() - bDate.getTime();
        });
        self.$nextTick(function () {
          self.initChart();
        });
      });
    },
    watch: {
      range: function range() {
        var self = this;
        self.clicked = null;
        self.$nextTick(function () {
          self.initChart();
        });
      },
    },
    computed: {
      clickedDate: function clickedDate() {
        var self = this;
        if (!self.clicked) { return ''; }
        if (self.chartWeekSumsDays && self.range === 'week') {
          return self.$moment(self.clicked.x).format('DD MMM YYYY');
        }
        if (self.chartMonthSumsDays && self.range === 'month') {
          return self.$moment(self.clicked.x).format('DD MMM YYYY');
        }
        return self.$moment(self.clicked.x).format('DD MMM YYYY HH:mm');
      },
      clickedValue: function clickedValue() {
        var self = this;
        if (!self.clicked) { return ''; }
        var originalItem = self.data[self.clicked.id];
        var value = originalItem.data.value;
        return ((value[0]) + "/" + (value[1]) + " " + (self.t('vital_units.0')) + " " + (value[2]) + " " + (self.t('vital_units.2')));
      },
    },
    methods: {
      todayValues: function todayValues(index) {
        var self = this;
        if (!self.data) { return null; }
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        return self.data
          .filter(function (el) {
            var d = self.itemDate(el);
            if (d.getTime() > today.getTime()) { return true; }
            return false;
          })
          .map(function (el) {
            var elDate = self.itemDate(el);
            return {
              y: parseInt(el.data.value[index], 10),
              x: elDate,
              id: self.data.indexOf(el),
            };
          });
      },
      weekValues: function weekValues(index) {
        var self = this;
        if (!self.data) { return null; }
        var weekStart = new Date();
        weekStart.setHours(0, 0, 0, 0);
        weekStart.setMonth(weekStart.getMonth(), weekStart.getDate() - 7);

        var values = self.data
          .filter(function (el) {
            var d = self.itemDate(el);
            if (d.getTime() > weekStart.getTime()) { return true; }
            return false;
          });
        return values
          .map(function (el) {
            var elDate = self.itemDate(el);
            return {
              y: parseInt(el.data.value[index], 10),
              x: elDate,
              id: self.data.indexOf(el),
            };
          });
      },
      monthValues: function monthValues(index) {
        var self = this;
        if (!self.data) { return null; }
        var monthStart = new Date();
        monthStart.setHours(0, 0, 0, 0);
        monthStart.setMonth(monthStart.getMonth() - 1, monthStart.getDate());
        var values = self.data
          .filter(function (el) {
            var d = self.itemDate(el);
            if (d.getTime() > monthStart.getTime()) { return true; }
            return false;
          });
        return values.map(function (el) {
          var elDate = self.itemDate(el);
          return {
            y: parseInt(el.data.value[index], 10),
            x: elDate,
            id: self.data.indexOf(el),
          };
        });
      },
      itemDate: function itemDate(item) {
        var d = new Date(item.data.date);
        var hours = parseInt(item.data.time.split(':')[0], 10);
        var mins = parseInt(item.data.time.split(':')[1], 10);
        d.setHours(hours, mins);
        return d;
      },
      t: function t(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".history." + v), d);
      },
      initChart: function initChart() {
        var self = this;
        var range = self.range;
        if (!self.data || !self.data.length) { return; }
        var chartType = 'line';

        var common = {
          chart: {
            type: chartType,
          },
          credits: {
            enabled: false,
          },
          legend: {
            enabled: false,
          },
          title: null,
          tooltip: {
            enabled: false,
          },
          xAxis: {
            type: 'datetime',
          },
          yAxis: {
            title: null,
          },
          time: {
            timezoneOffset: new Date().getTimezoneOffset(),
          },
          plotOptions: {
            line: {
              marker: {
                enabled: true,
              },
            },
          },
        };
        var seriesCommon = {
          cursor: 'pointer',
          marker: {
            symbol: 'circle',
          },
          point: {
            events: {
              click: function click() {
                self.clicked = this;
              },
              select: function select() {
                self.clicked = this;
              },
            },
          },
        };
        if (range === 'day') {
          self.$highcharts.chart(self.$refs.chartDay, Object.assign({}, common,
            {series: [
              Object.assign({}, seriesCommon,
                {color: self.chartColors[0],
                data: self.todayValues(0)}),
              Object.assign({}, seriesCommon,
                {color: self.chartColors[1],
                data: self.todayValues(1)}),
              Object.assign({}, seriesCommon,
                {color: self.chartColors[2],
                data: self.todayValues(2)}) ]}));
        }
        if (range === 'week') {
          self.$highcharts.chart(self.$refs.chartWeek, Object.assign({}, common,
            {series: [
              Object.assign({}, seriesCommon,
                {color: self.chartColors[0],
                data: self.weekValues(0)}),
              Object.assign({}, seriesCommon,
                {color: self.chartColors[1],
                data: self.weekValues(1)}),
              Object.assign({}, seriesCommon,
                {color: self.chartColors[2],
                data: self.weekValues(2)}) ]}));
        }
        if (range === 'month') {
          self.$highcharts.chart(self.$refs.chartMonth, Object.assign({}, common,
            {series: [
              Object.assign({}, seriesCommon,
                {color: self.chartColors[0],
                data: self.monthValues(0)}),
              Object.assign({}, seriesCommon,
                {color: self.chartColors[1],
                data: self.monthValues(1)}),
              Object.assign({}, seriesCommon,
                {color: self.chartColors[2],
                data: self.monthValues(2)}) ]}));
        }
      },
    },
  };

  var routes$1 = [
    {
      path: '/health_vitals/blood_pressure/',
      component: Index$2,
    },
    {
      path: '/health_vitals/blood_pressure/add/',
      component: Add$1,
    },
    {
      path: '/health_vitals/blood_pressure/settings/',
      component: Settings$1,
    },
    {
      path: '/health_vitals/blood_pressure/history/',
      component: History$1,
    } ];
  routes$1.forEach(function (r) {
    r.options = {
      props: {
        vitalsElement: 'blood_pressure',
      },
    };
  });

  var routes$2 = [
    {
      path: '/health_vitals/heart_rate/',
      component: Index$1,
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
    } ];
  routes$2.forEach(function (r) {
    r.options = {
      props: {
        vitalsElement: 'heart_rate',
        indexCardCustomIconName: function indexCardCustomIconName(item) {
          if (item && item.data && item.data.state) {
            return ("card-icon-" + (item.data.state));
          }
          return '';
        },
        manualAddExtraFields: [
          {
            type: 'smartselect',
            propName: 'state',
            defaultValue: 'rest',
            label: function label($t) {
              return $t('health_vitals.heart_rate.manual_enter.vital_variants_label');
            },
            values: function values($t) {
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
                } ];
            },
          } ],
        chartColor: '#FEBFB8',
        chartMarkerColor: '#FD7E70',
        chartClickedExtra: function chartClickedExtra(item, $t) {
          var state = item.data.state;
          var states = ['rest', 'walk', 'run'];
          return ("\n          <span class=\"vitals-heart_rate-chart-clicked-state-icon-" + state + "\"></span>\n          <span class=\"vitals-heart_rate-chart-clicked-state-text\">" + ($t(("health_vitals.heart_rate.history.vital_variants." + (states.indexOf(state))))) + "</span>\n        ").trim();
        },
      },
    };
  });

  var routes$3 = [
    {
      path: '/health_vitals/height/',
      component: Index$1,
    },
    {
      path: '/health_vitals/height/add/',
      component: Add,
    },
    {
      path: '/health_vitals/height/settings/',
      component: Settings,
    },
    {
      path: '/health_vitals/height/history/',
      component: History,
    } ];
  routes$3.forEach(function (r) {
    r.options = {
      props: {
        vitalsElement: 'height',
      },
    };
  });

  var api$3 = window.tommy.api;

  var API$3 = {
    getVaccine: function getVaccine(user, id) {
      return api$3.getFragment(id, {
        addon: 'health_vitals',
        kind: 'VitalsImmunisationsVaccine',
        with_filters: true,
        with_permission_to: true,
        user_id: Actor.id || user.id,
        actor_id: Actor.id,
      }, {
        cache: false,
      });
    },
    getVaccines: function getVaccines(user) {
      return api$3.getFragments({
        addon: 'health_vitals',
        kind: 'VitalsImmunisationsVaccine',
        with_filters: true,
        with_permission_to: true,
        user_id: Actor.id || user.id,
        actor_id: Actor.id,
      }, {
        cache: false,
      });
    },
    addVaccine: function addVaccine(user, data) {
      var tagUser = Actor.user || user;
      var obj = {
        addon: 'health_vitals',
        kind: 'VitalsImmunisationsVaccine',
        with_filters: true,
        start_at: new Date(data.scheduledDate).toJSON(),
        tags: [{
          context: 'members',
          name: tagUser.name || ((tagUser.first_name || '') + " " + (tagUser.last_name || '')),
          user_id: Actor.id || user.id,
        }],
        filters: [{
          context: 'members',
          name: tagUser.name || ((tagUser.first_name || '') + " " + (tagUser.last_name || '')),
          user_id: Actor.id || user.id,
        }],
        data: JSON.stringify(data),
      };
      if (Actor.id) {
        obj.actor_id = Actor.id;
        obj.actor_type = 'User';
      }
      return api$3.createFragment(obj);
    },
    updateVaccine: function updateVaccine(user, id, data) {
      var tagUser = Actor.user || user;
      var startAt = new Date(data.scheduledDate);
      var obj = {
        addon: 'health_vitals',
        kind: 'VitalsImmunisationsVaccine',
        with_filters: true,
        start_at: startAt.toJSON(),
        tags: [{
          context: 'members',
          name: tagUser.name || ((tagUser.first_name || '') + " " + (tagUser.last_name || '')),
          user_id: Actor.id || user.id,
        }],
        filters: [{
          context: 'members',
          name: tagUser.name || ((tagUser.first_name || '') + " " + (tagUser.last_name || '')),
          user_id: Actor.id || user.id,
        }],
        data: JSON.stringify(data),
      };
      if (Actor.id) {
        obj.actor_id = Actor.id;
        obj.actor_type = 'User';
      }
      return api$3.updateFragment(id, obj);
    },
    deleteVaccine: function deleteVaccine(user, id) {
      return api$3.deleteFragment(id);
    },
    getSettings: function getSettings(vitalsElement) {
      return api$3.call({
        endpoint: ("addons/health_vitals/install/settings/" + vitalsElement),
        method: 'GET',
        cache: false,
      }).then(function (res) {
        if (!res) { return res; }
        if (!res.data) { return null; }
        return res.data;
      });
    },
    saveSettings: function saveSettings(vitalsElement, settings) {
      if ( settings === void 0 ) settings = {};

      return api$3.call({
        endpoint: ("addons/health_vitals/install/settings/" + vitalsElement),
        method: 'PUT',
        data: { data: JSON.stringify(settings) },
      });
    },
  };

  var Index$3 = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-page',{class:("vitals-elment-index-page vitals-" + (_vm.vitalsElement) + "-index-page"),attrs:{"id":"vitals_element__index"},on:{"page:beforein":_vm.onPageBeforeIn,"page:beforeout":_vm.onPageBeforeOut},nativeOn:{"!scroll":function($event){return _vm.onPageScroll($event)}}},[_c('f7-navbar',[_c('tommy-nav-back'),_vm._v(" "),_c('f7-nav-title',[_vm._v(_vm._s(_vm.t('title')))]),_vm._v(" "),_c('f7-nav-right',[_c('f7-link',{attrs:{"href":("/health_vitals/" + (_vm.vitalsElement) + "/settings/"),"icon-only":""}},[_c('i',{class:("icon vitals-element-icon-settings vitals-" + (_vm.vitalsElement) + "-icon-settings")})]),_vm._v(" "),_c('f7-link',{attrs:{"href":("/health_vitals/" + (_vm.vitalsElement) + "/history/"),"icon-only":""}},[_c('i',{class:("icon vitals-element-icon-chart vitals-" + (_vm.vitalsElement) + "-icon-chart")})])],1)],1),_vm._v(" "),_c('f7-fab',{class:("vitals-element-fab vitals-" + (_vm.vitalsElement) + "-fab"),attrs:{"href":("/health_vitals/" + (_vm.vitalsElement) + "/add/")}},[_c('f7-icon',{attrs:{"f7":"add"}})],1),_vm._v(" "),_c('div',{class:("vitals-element-index-header vitals-" + (_vm.vitalsElement) + "-index-header")},[_c('div',{class:("vitals-element-index-header-icon vitals-" + (_vm.vitalsElement) + "-index-header-icon")}),_vm._v(" "),(_vm.data && _vm.closestVaccine)?_c('div',{class:("vitals-element-index-header-content vitals-" + (_vm.vitalsElement) + "-index-header-content")},[_c('div',{class:("vitals-element-index-header-date vitals-" + (_vm.vitalsElement) + "-index-header-date")},[_vm._v(_vm._s(_vm.t('next_label')))]),_vm._v(" "),_c('div',{class:("vitals-element-index-header-data vitals-" + (_vm.vitalsElement) + "-index-header-data")},[_vm._v(_vm._s(_vm.daysDiff(_vm.closestVaccine))),_c('span',[_vm._v(_vm._s(_vm.t('days_label')))])]),_vm._v(" "),_c('div',{class:("vitals-element-index-header-date vitals-" + (_vm.vitalsElement) + "-index-header-date")},[_vm._v(_vm._s(_vm.$moment(_vm.closestVaccine.data.scheduledDate || _vm.closestVaccine.data.sheduledDate).format('DD MMM YYYY'))+", "+_vm._s(_vm.closestVaccine.data.name))])]):_vm._e(),_vm._v(" "),(_vm.data && !_vm.closestVaccine)?_c('div',{class:("vitals-element-index-header-content vitals-" + (_vm.vitalsElement) + "-index-header-content")},[_c('div',{class:("vitals-element-index-header-data vitals-" + (_vm.vitalsElement) + "-index-header-data")},[_vm._v(_vm._s(_vm.t('vital_label')))])]):_vm._e()]),_vm._v(" "),(_vm.data && !_vm.data.length)?_c('div',{class:("vitals-element-index-no-data vitals-" + (_vm.vitalsElement) + "-index-no-data")},[_c('i',{class:("vitals-element-index-no-data-img vitals-" + (_vm.vitalsElement) + "-index-no-data-img")}),_vm._v(" "),_c('span',[_vm._v(_vm._s(_vm.t('not_available')))])]):_vm._e(),_vm._v(" "),(_vm.data && _vm.data.length)?_c('div',{class:("vitals-element-index-cards vitals-" + (_vm.vitalsElement) + "-index-cards")},_vm._l((_vm.orderedData),function(vaccine){return _c('a',{key:vaccine.id,staticClass:"immunisations-card",attrs:{"href":"#"},on:{"click":function($event){_vm.$f7router.navigate('/health_vitals/immunisations/details/', {
          props: {
            vaccine: vaccine,
          },
        });}}},[_c('div',{staticClass:"immunisations-card-icon",class:{ injected: _vm.isInjected(vaccine), overdue: _vm.isOverDue(vaccine), }}),_vm._v(" "),_c('div',{staticClass:"immunisations-card-content"},[_c('div',{staticClass:"immunisations-card-name"},[_vm._v(_vm._s(vaccine.data.name))]),_vm._v(" "),_c('div',{staticClass:"immunisations-card-date"},[_vm._v(_vm._s(_vm.$moment(vaccine.data.scheduledDate || vaccine.data.sheduledDate).format('DD MMM, YYYY')))])]),_vm._v(" "),_c('f7-icon',{attrs:{"f7":"chevron_right"}})],1)})):_vm._e()],1)},staticRenderFns: [],
    props: {
      vitalsElement: String,
    },
    data: function data() {
      return {
        data: null,
      };
    },
    mounted: function mounted() {
      var self = this;
      self.getData();
      self.$events.$on(((self.vitalsElement) + ":updateRecords"), self.getData);
    },
    beforeDestroy: function beforeDestroy() {
      var self = this;
      self.$events.$off(((self.vitalsElement) + ":updateRecords"), self.getData);
    },
    computed: {
      closestVaccine: function closestVaccine() {
        var self = this;
        if (!self.data) { return null; }
        var vaccines = [].concat( self.data );
        vaccines.sort(function (a, b) {
          var aDate = new Date(a.data.scheduledDate || a.data.sheduledDate).getTime();
          var bDate = new Date(b.data.scheduledDate || b.data.sheduledDate).getTime();
          if (aDate < bDate) { return -1; }
          return 1;
        });
        var closest;
        var today = new Date().getTime();
        vaccines.forEach(function (v) {
          if (closest) { return; }
          var vDate = new Date(v.data.scheduledDate || v.data.sheduledDate).getTime();
          if (vDate > today) { closest = v; }
        });
        return closest;
      },
      orderedData: function orderedData() {
        if (!this.data) { return null; }
        return this.data.sort(function (a, b) {
          var aDate = new Date(a.data.scheduledDate || a.data.sheduledDate).getTime();
          var bDate = new Date(b.data.scheduledDate || b.data.sheduledDate).getTime();
          if (aDate > bDate) { return -1; }
          return 1;
        });
      },
    },
    methods: {
      t: function t(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".index." + v), d);
      },
      daysDiff: function daysDiff(vaccine) {
        var today = new Date().getTime();
        var target = new Date(vaccine.data.scheduledDate || vaccine.data.sheduledDate).getTime();
        return Math.ceil((target - today) / 1000 / 60 / 60 / 25);
      },
      isOverDue: function isOverDue(item) {
        var self = this;
        if (self.isInjected(item)) { return false; }
        var d = new Date();
        var needDate = new Date(item.data.scheduledDate || item.data.sheduledDate);
        return d.getTime() >= needDate.getTime();
      },
      isInjected: function isInjected(item) {
        return item.data.injected;
      },
      checkReminders: function checkReminders() {
        var self = this;
        self.data.forEach(function (el) {
          if (!self.isOverDue(el)) { return; }
          self.$f7.dialog.create({
            text: ("\n            <div class=\"text-align-center\">\n              <img src=\"" + (self.$addonAssetsUrl) + (self.vitalsElement) + "/remind.svg\" height=\"85\"/>\n            </div>\n            <p class=\"text-align-center\">" + (self.$t('health_vitals.immunisations.due_alert.text')) + "<br><b>" + (el.data.name) + "</b></p>\n          "),
            buttons: [
              {
                text: self.$t('health_vitals.immunisations.due_alert.confirm_button'),
              } ],
          }).open();
        });
      },
      getData: function getData() {
        var self = this;
        API$3.getVaccines(self.$root.user).then(function (data) {
          self.data = data.filter(function (v) { return !v.data.archived; });
          self.checkReminders();
        });
      },
      onPageScroll: function onPageScroll(e) {
        var self = this;
        var $pageContentEl = self.$$(e.target).closest('.page-content');
        if (!$pageContentEl.length) { return; }
        var scrollTop = $pageContentEl[0].scrollTop;
        if (scrollTop > 100) {
          self.$f7router.view.$navbarEl.removeClass(("vitals-element-index-navbar vitals-" + (self.vitalsElement) + "-index-navbar"));
        } else {
          self.$f7router.view.$navbarEl.addClass(("vitals-element-index-navbar vitals-" + (self.vitalsElement) + "-index-navbar"));
        }
      },
      onPageBeforeIn: function onPageBeforeIn() {
        var self = this;
        self.$f7router.view.$navbarEl.addClass(("vitals-element-index-navbar vitals-" + (self.vitalsElement) + "-index-navbar"));
      },
      onPageBeforeOut: function onPageBeforeOut() {
        var self = this;
        self.$f7router.view.$navbarEl.removeClass(("vitals-element-index-navbar vitals-" + (self.vitalsElement) + "-index-navbar"));
      },
    },
  };

  var Add$2 = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-page',{class:("vitals-element-manual-add-page vitals-" + (_vm.vitalsElement) + "-manual-add-page"),attrs:{"id":"vitals_element__add"}},[_c('f7-navbar',[_c('tommy-nav-back'),_vm._v(" "),_c('f7-nav-title',[_vm._v(_vm._s(_vm.tAdd('title')))]),_vm._v(" "),_c('f7-nav-right',[(_vm.allowSave)?_c('f7-link',{attrs:{"href":"#","icon-only":""},on:{"click":_vm.save}},[_c('i',{staticClass:"icon f7-icons"},[_vm._v("check")])]):_vm._e()],1)],1),_vm._v(" "),_c('f7-list',{staticClass:"no-margin",attrs:{"no-hairlines":""}},[_c('f7-list-input',{attrs:{"type":"text","inline-label":"","value":_vm.name,"label":_vm.tAdd('vaccine_label')},on:{"input":function($event){_vm.name = $event.target.value;}}}),_vm._v(" "),_c('f7-list-input',{attrs:{"type":"text","inline-label":"","input-id":"date-input","label":_vm.tAdd('date_label')}}),_vm._v(" "),_c('f7-list-item',{attrs:{"divider":"","title":_vm.tDetails('prevent_disease_title')}}),_vm._v(" "),_c('f7-list-input',{attrs:{"type":"text","inputStyle":"text-align: left","value":_vm.prevent,"placeholder":_vm.tDetails('prevent_disease_title')},on:{"input":function($event){_vm.prevent = $event.target.value;}}}),_vm._v(" "),_c('f7-list-item',{attrs:{"divider":"","title":_vm.tDetails('precautions_title')}}),_vm._v(" "),_c('f7-list-input',{attrs:{"type":"textarea","resizable":"","inputStyle":"text-align: left","value":_vm.precautions,"placeholder":_vm.tDetails('precautions_title')},on:{"input":function($event){_vm.precautions = $event.target.value;}}})],1)],1)},staticRenderFns: [],
    props: {
      vitalsElement: String,
    },
    data: function data() {
      return {
        name: '',
        prevent: '',
        precautions: '',
        scheduledDate: new Date(),
      };
    },
    computed: {
      allowSave: function allowSave() {
        var self = this;
        return self.name && self.name.length > 0;
      },
    },
    mounted: function mounted() {
      var self = this;
      self.$f7.calendar.create({
        inputEl: self.$el.querySelector('#date-input'),
        value: [self.scheduledDate],
        closeOnSelect: true,
        on: {
          change: function change(c, v) {
            self.scheduledDate = new Date(v[0]);
            self.scheduledDate.setHours(0, 0, 0, 0);
          },
        },
      });
    },
    methods: {
      tAdd: function tAdd(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".add_vaccine." + v), d);
      },
      tDetails: function tDetails(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".immunisation_details." + v), d);
      },
      save: function save() {
        var self = this;
        var name = self.name;
        var scheduledDate = self.scheduledDate;
        var prevent = self.prevent;
        var precautions = self.precautions;
        API$3.addVaccine(
          self.$root.user,
          {
            name: name,
            scheduledDate: new Date(scheduledDate).toJSON(),
            prevent: prevent,
            precautions: precautions,
          }
        ).then(function () {
          self.$events.$emit(((self.vitalsElement) + ":updateRecords"));
          self.$f7router.back();
        });
      },
    },
  };

  var Details = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-page',{class:("vitals-element-manual-add-page vitals-" + (_vm.vitalsElement) + "-manual-add-page vitals-" + (_vm.vitalsElement) + "-details-page"),attrs:{"id":"vitals_element__add"}},[_c('f7-navbar',[_c('tommy-nav-back'),_vm._v(" "),_c('f7-nav-title',[_vm._v(_vm._s(_vm.tDetails('title')))])],1),_vm._v(" "),_c('f7-list',{staticClass:"no-margin",attrs:{"no-hairlines":""}},[_c('f7-list-item',{attrs:{"title":_vm.tDetails('vaccine_label'),"after":_vm.name}}),_vm._v(" "),_c('f7-list-item',{attrs:{"title":_vm.tDetails('date_label'),"after":_vm.$moment(_vm.scheduledDate).format('DD MMM, YYYY')}}),_vm._v(" "),_c('f7-list-item',{attrs:{"title":_vm.tDetails('status_label'),"after":_vm.statusText()}}),_vm._v(" "),(_vm.injected && _vm.injectedDate)?_c('f7-list-item',{attrs:{"title":_vm.tDetails('injection_date_label'),"after":_vm.$moment(_vm.injectedDate).format('DD MMM, YYYY')}}):_vm._e(),_vm._v(" "),_c('f7-list-item',{attrs:{"divider":"","title":_vm.tDetails('prevent_disease_title')}}),_vm._v(" "),_c('f7-list-item',[_vm._v(_vm._s(_vm.prevent))]),_vm._v(" "),_c('f7-list-item',{attrs:{"divider":"","title":_vm.tDetails('precautions_title')}}),_vm._v(" "),_c('f7-list-item',[_vm._v(_vm._s(_vm.precautions))])],1),_vm._v(" "),(!_vm.archived)?_c('div',{staticClass:"immunisations-details-buttons"},[(!_vm.injected && _vm.isOverDue())?_c('a',{staticClass:"immunisations-details-button-red",attrs:{"href":"#"},on:{"click":_vm.injectVaccine}},[_vm._v(_vm._s(_vm.tDetails('confirm_injection_button')))]):_vm._e(),_vm._v(" "),_c('a',{attrs:{"href":"#"},on:{"click":_vm.archiveVaccine}},[_vm._v(_vm._s(_vm.tDetails('archive_button')))])]):_vm._e(),_vm._v(" "),(_vm.archived)?_c('div',{staticClass:"immunisations-details-buttons"},[_c('a',{staticClass:"immunisations-details-button-red",attrs:{"href":"#"},on:{"click":_vm.deleteVaccine}},[_vm._v(_vm._s(_vm.$t('health_vitals.immunisations.archive.delete_button')))])]):_vm._e()],1)},staticRenderFns: [],
    props: {
      vitalsElement: String,
      vaccine: Object,
    },
    data: function data() {
      var ref = this.vaccine.data;
      var name = ref.name;
      var prevent = ref.prevent;
      var precautions = ref.precautions;
      var scheduledDate = ref.scheduledDate;
      var sheduledDate = ref.sheduledDate;
      var injected = ref.injected;
      var injectedDate = ref.injectedDate;
      var archived = ref.archived;
      return {
        id: this.vaccine.id,
        name: name,
        prevent: prevent,
        precautions: precautions,
        scheduledDate: scheduledDate || sheduledDate,
        injected: injected,
        injectedDate: injectedDate,
        archived: archived,
      };
    },
    mounted: function mounted() {
      var self = this;
      self.$f7.calendar.create({
        inputEl: self.$el.querySelector('#date-input'),
        value: [self.scheduledDate],
        closeOnSelect: true,
        on: {
          change: function change(c, v) {
            self.scheduledDate = new Date(v[0]);
            self.scheduledDate.setHours(0, 0, 0, 0);
          },
        },
      });
    },
    methods: {
      tAdd: function tAdd(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".add_vaccine." + v), d);
      },
      tDetails: function tDetails(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".immunisation_details." + v), d);
      },
      statusText: function statusText() {
        var self = this;
        if (self.injected) { return self.tDetails('status_options.1'); }
        if (self.isOverDue()) { return self.tDetails('status_options.0'); }
        return self.tDetails('status_options.2');
      },
      isOverDue: function isOverDue() {
        var self = this;
        if (self.injected) { return false; }
        var d = new Date();
        var needDate = new Date(self.scheduledDate || self.sheduledDate);
        return d.getTime() >= needDate.getTime();
      },
      archiveVaccine: function archiveVaccine() {
        var self = this;
        var name = self.name;
        var prevent = self.prevent;
        var precautions = self.precautions;
        var scheduledDate = self.scheduledDate;
        var injected = self.injected;
        var injectedDate = self.injectedDate;
        self.$f7.dialog.confirm(self.$t('health_vitals.immunisations.archive_delete_confirm_prompt.text'), function () {
          API$3.updateVaccine(self.$root.user, self.id, {
            name: name,
            prevent: prevent,
            precautions: precautions,
            scheduledDate: scheduledDate,
            injected: injected,
            injectedDate: injectedDate,
            archived: true,
          }).then(function () {
            self.$events.$emit(((self.vitalsElement) + ":updateRecords"));
            self.$f7router.back();
          });
        });
      },
      deleteVaccine: function deleteVaccine() {
        var self = this;
        self.$f7.dialog.confirm(self.$t('health_vitals.immunisations.archive_delete_confirm_prompt.text'), function () {
          API$3.deleteVaccine(self.$root.user, self.id).then(function () {
            self.$events.$emit(((self.vitalsElement) + ":updateRecords"));
            self.$f7router.back();
          });
        });
      },
      injectVaccine: function injectVaccine() {
        var self = this;
        var calendar;
        function inject() {
          self.injected = true;
          self.injectedDate = calendar.value[0];
          var name = self.name;
          var prevent = self.prevent;
          var precautions = self.precautions;
          var scheduledDate = self.scheduledDate;
          var injected = self.injected;
          var injectedDate = self.injectedDate;
          var archived = self.archived;
          API$3.updateVaccine(self.$root.user, self.id, {
            name: name,
            prevent: prevent,
            precautions: precautions,
            scheduledDate: scheduledDate,
            injected: injected,
            injectedDate: injectedDate.toJSON(),
            archived: archived,
          }).then(function () {
            self.$events.$emit(((self.vitalsElement) + ":updateRecords"));
            self.$f7router.back();
          });
        }
        var dialog = self.$f7.dialog.create({
          title: self.$t('health_vitals.immunisations.injection_confirm.date_label'),
          text: '<div class="immunisations-dialog-calendar"></div>',
          buttons: [
            {
              text: self.$t('health_vitals.immunisations.injection_confirm.cancel_button'),
            },
            {
              text: self.$t('health_vitals.immunisations.injection_confirm.confirm_button'),
              bold: true,
              onClick: function onClick() {
                inject();
              },
            } ],
        });
        dialog.open();
        calendar = self.$f7.calendar.create({
          containerEl: dialog.$el.find('.immunisations-dialog-calendar'),
          value: [new Date()],
        });
      },
      save: function save() {
        var self = this;
        var name = self.name;
        var scheduledDate = self.scheduledDate;
        var prevent = self.prevent;
        var precautions = self.precautions;
        API$3.addVaccine(
          self.$root.user,
          {
            name: name,
            scheduledDate: new Date(scheduledDate).toJSON(),
            prevent: prevent,
            precautions: precautions,
          }
        ).then(function () {
          self.$events.$emit(((self.vitalsElement) + ":updateRecords"));
          self.$f7router.back();
        });
      },
    },
  };

  var settings$2 = {
    receiveMessage: false,
  };

  var Settings$2 = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-page',{class:("vitals-element-settings-page vitals-" + (_vm.vitalsElement) + "-settings-page"),attrs:{"id":"vitals_element__settings"}},[_c('f7-navbar',[_c('tommy-nav-back'),_vm._v(" "),_c('f7-nav-title',[_vm._v(_vm._s(_vm.t('title')))])],1),_vm._v(" "),_c('div',{class:("vitals-element-settings-header vitals-" + (_vm.vitalsElement) + "-settings-header")},[_c('div',{class:("vitals-element-settings-icon vitals-" + (_vm.vitalsElement) + "-settings-icon")}),_vm._v(" "),_c('div',{class:("vitals-element-settings-center-icon vitals-" + (_vm.vitalsElement) + "-settings-center-icon")})]),_vm._v(" "),_c('div',{class:("vitals-element-settings-text vitals-" + (_vm.vitalsElement) + "-settings-text")},[_c('p',[_vm._v(_vm._s(_vm.t('vital_text')))])]),_vm._v(" "),_c('f7-list',{staticClass:"no-hairlines"},[_c('f7-list-item',{attrs:{"title":_vm.t('chat_label')}},[_c('f7-toggle',{attrs:{"slot":"after","checked":_vm.settings.receiveMessage},on:{"toggle:change":_vm.onMessagesChanges},slot:"after"})],1),_vm._v(" "),_c('f7-list-item',{attrs:{"link":"/vitals_immunisations/archive/","title":_vm.t('archive_label')}})],1)],1)},staticRenderFns: [],
    props: {
      vitalsElement: String,
    },
    data: function data() {
      return {
        settings: settings$2,
      };
    },
    mounted: function mounted() {
      var self = this;
      API$3.getSettings(self.vitalsElement).then(function (res) {
        if (!res) { return; }
        self.settings = res;
        settings$2 = self.settings;
      });
    },
    methods: {
      t: function t(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".settings." + v), d);
      },
      onMessagesChanges: function onMessagesChanges(checked) {
        var self = this;
        self.settings.receiveMessage = checked;
        settings$2 = self.settings;
        API$3.saveSettings(self.vitalsElement, self.settings);
      },
    },
  };

  var History$2 = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-page',{class:("vitals-element-history-page vitals-" + (_vm.vitalsElement) + "-history-page")},[_c('f7-navbar',[_c('tommy-nav-back'),_vm._v(" "),_c('f7-nav-title',[_vm._v(_vm._s(_vm.t('title', 'History')))])],1),_vm._v(" "),(_vm.data && !_vm.data.length)?_c('div',{class:("vitals-element-index-no-data vitals-" + (_vm.vitalsElement) + "-index-no-data")},[_c('i',{class:("vitals-element-index-no-data-img vitals-" + (_vm.vitalsElement) + "-index-no-data-img")}),_vm._v(" "),_c('span',[_vm._v(_vm._s(_vm.t('not_available', 'When you have previous records, they will show here.')))])]):_vm._e(),_vm._v(" "),(_vm.data && _vm.data.length)?_c('div',{class:("vitals-element-index-cards vitals-" + (_vm.vitalsElement) + "-index-cards")},_vm._l((_vm.orderedData),function(vaccine){return _c('a',{key:vaccine.id,staticClass:"immunisations-card",attrs:{"href":"#"},on:{"click":function($event){_vm.$f7router.navigate('/health_vitals/immunisations/details/', {
          props: {
            vaccine: vaccine,
          },
        });}}},[_c('div',{staticClass:"immunisations-card-icon",class:{ injected: _vm.isInjected(vaccine), overdue: _vm.isOverDue(vaccine), }}),_vm._v(" "),_c('div',{staticClass:"immunisations-card-content"},[_c('div',{staticClass:"immunisations-card-name"},[_vm._v(_vm._s(vaccine.data.name))]),_vm._v(" "),_c('div',{staticClass:"immunisations-card-date"},[_vm._v(_vm._s(_vm.$moment(vaccine.data.scheduledDate || vaccine.data.sheduledDate).format('DD MMM, YYYY')))])]),_vm._v(" "),_c('f7-icon',{attrs:{"f7":"chevron_right"}})],1)})):_vm._e()],1)},staticRenderFns: [],
    props: {
      vitalsElement: String,
    },
    data: function data() {
      return {
        data: null,
      };
    },
    mounted: function mounted() {
      var self = this;
      self.getData();
      self.$events.$on(((self.vitalsElement) + ":updateRecords"), self.getData);
    },
    beforeDestroy: function beforeDestroy() {
      var self = this;
      self.$events.$off(((self.vitalsElement) + ":updateRecords"), self.getData);
    },
    computed: {
      orderedData: function orderedData() {
        if (!this.data) { return null; }
        return this.data.sort(function (a, b) {
          var aDate = new Date(a.data.scheduledDate || a.data.sheduledDate).getTime();
          var bDate = new Date(b.data.scheduledDate || b.data.sheduledDate).getTime();
          if (aDate > bDate) { return -1; }
          return 1;
        });
      },
    },
    methods: {
      t: function t(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".history." + v), d);
      },
      isOverDue: function isOverDue(item) {
        var self = this;
        if (self.isInjected(item)) { return false; }
        var d = new Date();
        var needDate = new Date(item.data.scheduledDate || item.data.sheduledDate);
        return d.getTime() >= needDate.getTime();
      },
      isInjected: function isInjected(item) {
        return item.data.injected;
      },

      getData: function getData() {
        var self = this;
        API$3.getVaccines(self.$root.user).then(function (data) {
          self.data = [];
          self.data = data.filter(function (v) {
            var vDate = new Date(v.data.scheduledDate || v.data.sheduledDate).getTime();
            var now = new Date().getTime();
            return !v.data.archived && now > vDate;
          });
        });
      },
    },
  };

  var Archive = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-page',{class:("vitals-" + (_vm.vitalsElement) + "-archive-page")},[_c('f7-navbar',[_c('tommy-nav-back'),_vm._v(" "),_c('f7-nav-title',[_vm._v(_vm._s(_vm.t('title')))])],1),_vm._v(" "),(_vm.data && !_vm.data.length)?_c('div',{class:("vitals-element-index-no-data vitals-" + (_vm.vitalsElement) + "-index-no-data")},[_c('i',{class:("vitals-element-index-no-data-img vitals-" + (_vm.vitalsElement) + "-index-no-data-img")})]):_vm._e(),_vm._v(" "),(_vm.data && _vm.data.length)?_c('div',{class:("vitals-element-index-cards vitals-" + (_vm.vitalsElement) + "-index-cards")},_vm._l((_vm.orderedData),function(vaccine){return _c('a',{key:vaccine.id,staticClass:"immunisations-card",attrs:{"href":"#"},on:{"click":function($event){_vm.$f7router.navigate('/health_vitals/immunisations/details/', {
          props: {
            vaccine: vaccine,
          },
        });}}},[_c('div',{staticClass:"immunisations-card-icon",class:{ injected: _vm.isInjected(vaccine), overdue: _vm.isOverDue(vaccine), }}),_vm._v(" "),_c('div',{staticClass:"immunisations-card-content"},[_c('div',{staticClass:"immunisations-card-name"},[_vm._v(_vm._s(vaccine.data.name))]),_vm._v(" "),_c('div',{staticClass:"immunisations-card-date"},[_vm._v(_vm._s(_vm.$moment(vaccine.data.scheduledDate || vaccine.data.sheduledDate).format('DD MMM, YYYY')))])]),_vm._v(" "),_c('f7-icon',{attrs:{"f7":"chevron_right"}})],1)})):_vm._e()],1)},staticRenderFns: [],
    props: {
      vitalsElement: String,
    },
    data: function data() {
      return {
        data: null,
      };
    },
    mounted: function mounted() {
      var self = this;
      self.getData();
      self.$events.$on(((self.vitalsElement) + ":updateRecords"), self.getData);
    },
    beforeDestroy: function beforeDestroy() {
      var self = this;
      self.$events.$off(((self.vitalsElement) + ":updateRecords"), self.getData);
    },
    computed: {
      orderedData: function orderedData() {
        if (!this.data) { return null; }
        return this.data.sort(function (a, b) {
          var aDate = new Date(a.data.scheduledDate || a.data.sheduledDate).getTime();
          var bDate = new Date(b.data.scheduledDate || b.data.sheduledDate).getTime();
          if (aDate > bDate) { return -1; }
          return 1;
        });
      },
    },
    methods: {
      t: function t(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".archive." + v), d);
      },
      isOverDue: function isOverDue(item) {
        var self = this;
        if (self.isInjected(item)) { return false; }
        var d = new Date();
        var needDate = new Date(item.data.scheduledDate || item.data.sheduledDate);
        return d.getTime() >= needDate.getTime();
      },
      isInjected: function isInjected(item) {
        return item.data.injected;
      },

      getData: function getData() {
        var self = this;
        API$3.getVaccines(self.$root.user).then(function (data) {
          self.data = data.filter(function (v) { return v.data.archived; });
        });
      },
    },
  };

  var routes$4 = [
    {
      path: '/health_vitals/immunisations/',
      component: Index$3,
    },
    {
      path: '/health_vitals/immunisations/add/',
      component: Add$2,
    },
    {
      path: '/health_vitals/immunisations/details/',
      component: Details,
    },
    {
      path: '/health_vitals/immunisations/settings/',
      component: Settings$2,
    },
    {
      path: '/health_vitals/immunisations/history/',
      component: History$2,
    },
    {
      path: '/health_vitals/immunisations/archive/',
      component: Archive,
    } ];
  routes$4.forEach(function (r) {
    r.options = {
      props: {
        vitalsElement: 'immunisations',
      },
    };
  });

  var api$4 = window.tommy.api;

  var API$4 = {
    takeMedication: function takeMedication(user, id, time, taken) {
      var startAt = new Date().toJSON();
      var tagUser = Actor.user || user;
      var obj = {
        addon: 'health_vitals',
        kind: 'VitalsMedicationReminderTaken',
        with_filters: true,
        start_at: startAt,
        tags: [{
          context: 'members',
          name: tagUser.name || ((tagUser.first_name || '') + " " + (tagUser.last_name || '')),
          user_id: user.id,
        }],
        filters: [{
          context: 'members',
          name: tagUser.name || ((tagUser.first_name || '') + " " + (tagUser.last_name || '')),
          user_id: Actor.id || user.id,
        }],
        data: JSON.stringify({ medication_id: id, taken: taken, time: time, date: startAt }),
      };
      if (Actor.id) {
        obj.actor_id = Actor.id;
        obj.actor_type = 'User';
      }
      return api$4.createFragment(obj);
    },
    getTaken: function getTaken(user, ref) {
      if ( ref === void 0 ) ref = {};
      var dateFrom = ref.dateFrom;
      var dateTo = ref.dateTo;

      // eslint-disable-next-line
      var date_range;
      if (dateFrom && dateTo) {
        date_range = [new Date(dateFrom).toJSON(), new Date(dateTo).toJSON()];
      }
      return api$4.getFragments({
        addon: 'health_vitals',
        kind: 'VitalsMedicationReminderTaken',
        with_filters: true,
        with_permission_to: true,
        user_id: Actor.id || user.id,
        actor_id: Actor.id,
        date_range: date_range,
      }, {
        cache: false,
      });
    },
    getMedication: function getMedication(user, id) {
      return api$4.getFragment(id, {
        addon: 'health_vitals',
        kind: 'VitalsMedicationReminderMedication',
        with_filters: true,
        with_permission_to: true,
        user_id: Actor.id || user.id,
        actor_id: Actor.id,
      }, {
        cache: false,
      });
    },
    getMedications: function getMedications(user) {
      return api$4.getFragments({
        addon: 'health_vitals',
        kind: 'VitalsMedicationReminderMedication',
        with_filters: true,
        with_permission_to: true,
        user_id: Actor.id || user.id,
        actor_id: Actor.id,
      }, {
        cache: false,
      });
    },
    addMedication: function addMedication(user, data) {
      var tagUser = Actor.user || user;
      var obj = {
        addon: 'health_vitals',
        kind: 'VitalsMedicationReminderMedication',
        with_filters: true,
        start_at: new Date(data.startDate).toJSON(),
        end_at: new Date(data.endDate).toJSON(),
        tags: [{
          context: 'members',
          name: tagUser.name || ((tagUser.first_name || '') + " " + (tagUser.last_name || '')),
          user_id: Actor.id || user.id,
        }],
        filters: [{
          context: 'members',
          name: tagUser.name || ((tagUser.first_name || '') + " " + (tagUser.last_name || '')),
          user_id: Actor.id || user.id,
        }],
        data: JSON.stringify(data),
      };
      if (Actor.id) {
        obj.actor_id = Actor.id;
        obj.actor_type = 'User';
      }
      return api$4.createFragment(obj);
    },
    updateMedication: function updateMedication(user, id, data) {
      var tagUser = Actor.user || user;
      var startAt = new Date(data.startDate);
      var obj = {
        addon: 'health_vitals',
        kind: 'VitalsMedicationReminderMedication',
        with_filters: true,
        start_at: startAt.toJSON(),
        tags: [{
          context: 'members',
          name: tagUser.name || ((tagUser.first_name || '') + " " + (tagUser.last_name || '')),
          user_id: Actor.id || user.id,
        }],
        filters: [{
          context: 'members',
          name: tagUser.name || ((tagUser.first_name || '') + " " + (tagUser.last_name || '')),
          user_id: Actor.id || user.id,
        }],
        data: JSON.stringify(data),
      };
      if (Actor.id) {
        obj.actor_id = Actor.id;
        obj.actor_type = 'User';
      }
      return api$4.updateFragment(id, obj);
    },
    deleteMedication: function deleteMedication(user, id) {
      return api$4.deleteFragment(id);
    },
    getSettings: function getSettings(vitalsElement) {
      return api$4.call({
        endpoint: ("addons/health_vitals/install/settings/" + vitalsElement),
        method: 'GET',
        cache: false,
      }).then(function (res) {
        if (!res) { return res; }
        if (!res.data) { return null; }
        return res.data;
      });
    },
    saveSettings: function saveSettings(vitalsElement, settings) {
      if ( settings === void 0 ) settings = {};

      return api$4.call({
        endpoint: ("addons/health_vitals/install/settings/" + vitalsElement),
        method: 'PUT',
        data: { data: JSON.stringify(settings) },
      });
    },
  };

  var Index$4 = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-page',{class:("vitals-elment-index-page vitals-" + (_vm.vitalsElement) + "-index-page"),attrs:{"id":"vitals_element__index"},on:{"page:beforein":_vm.onPageBeforeIn,"page:beforeout":_vm.onPageBeforeOut},nativeOn:{"!scroll":function($event){return _vm.onPageScroll($event)}}},[_c('f7-navbar',[_c('tommy-nav-back'),_vm._v(" "),_c('f7-nav-title',[_vm._v(_vm._s(_vm.t('title')))]),_vm._v(" "),_c('f7-nav-right',[_c('f7-link',{attrs:{"href":("/health_vitals/" + (_vm.vitalsElement) + "/settings/"),"icon-only":""}},[_c('i',{class:("icon vitals-element-icon-settings vitals-" + (_vm.vitalsElement) + "-icon-settings")})]),_vm._v(" "),_c('f7-link',{attrs:{"href":("/health_vitals/" + (_vm.vitalsElement) + "/history/"),"icon-only":"","route-props":{ goalValue: _vm.settings ? _vm.settings.goal_value : 0 }}},[_c('i',{class:("icon vitals-element-icon-chart vitals-" + (_vm.vitalsElement) + "-icon-chart")})])],1)],1),_vm._v(" "),_c('f7-fab',{class:("vitals-element-fab vitals-" + (_vm.vitalsElement) + "-fab"),attrs:{"href":("/health_vitals/" + (_vm.vitalsElement) + "/plan/")}},[_c('f7-icon',{attrs:{"f7":"add"}})],1),_vm._v(" "),_c('div',{class:("vitals-element-index-header vitals-" + (_vm.vitalsElement) + "-index-header")},[_c('div',{staticClass:"vitals-medicaton_reminder-header-date"},[_c('span',{staticClass:"month"},[_vm._v(_vm._s(_vm.$moment().format('MMMM')))]),_vm._v(" "),_c('span',{staticClass:"day"},[_vm._v(_vm._s(_vm.$moment().format('D')))])])]),_vm._v(" "),(_vm.data && !_vm.todayData)?_c('div',{class:("vitals-element-index-no-data vitals-" + (_vm.vitalsElement) + "-index-no-data")},[_c('i',{class:("vitals-element-index-no-data-img vitals-" + (_vm.vitalsElement) + "-index-no-data-img")}),_vm._v(" "),_c('span',[_vm._v(_vm._s(_vm.t('not_available')))])]):_vm._e(),_vm._v(" "),(_vm.data && _vm.todayData)?_c('div',{staticClass:"medication-index-cards"},_vm._l((_vm.todayData),function(item,index){return _c('div',{key:index,staticClass:"medication-index-card"},[_c('div',{staticClass:"medication-index-card-icon",class:{ taken: _vm.isTaken(item), 'not-taken': _vm.isNotTaken(item), 'need-to-take': _vm.isNeedToTake(item), }}),_vm._v(" "),_c('div',{staticClass:"medication-index-card-content"},[_c('div',{staticClass:"medication-index-card-name"},[_vm._v(_vm._s(item.name))]),_vm._v(" "),_c('div',{staticClass:"medication-index-card-dosage"},[_vm._v(_vm._s(item.value)+" "+_vm._s(_vm.t(("dosage_unit." + (item.unit)))))])]),_vm._v(" "),_c('div',{staticClass:"medication-index-card-time"},[_vm._v(_vm._s(item.time))])])})):_vm._e()],1)},staticRenderFns: [],
    props: {
      vitalsElement: String,
    },
    data: function data() {
      return {
        data: null,
        takenData: null,
      };
    },
    mounted: function mounted() {
      var self = this;
      self.getData();
      self.$events.$on(((self.vitalsElement) + ":updateRecords"), self.getData);
    },
    beforeDestroy: function beforeDestroy() {
      var self = this;
      self.$events.$off(((self.vitalsElement) + ":updateRecords"), self.getData);
    },
    computed: {
      todayData: function todayData() {
        var self = this;
        if (!self.data) { return null; }
        var today = new Date();
        var todayTime = today.getTime();
        var todayData = [];
        self.data.forEach(function (el) {
          if (!el.data.reminder) { return; }
          var startDate = new Date(el.data.startDate).getTime();
          var endDate = new Date(el.data.endDate).getTime();
          if (todayTime >= startDate && todayTime <= endDate) {
            el.data.dosage.forEach(function (d) {
              todayData.push({
                id: el.id,
                name: el.data.name,
                time: d.time,
                unit: d.unit,
                value: d.value,
              });
            });
          }
        });
        todayData.sort(function (a, b) {
          var aTime = parseInt(a.time.split(':')[0], 10) * 60 + parseInt(a.time.split(':')[1], 10);
          var bTime = parseInt(b.time.split(':')[0], 10) * 60 + parseInt(b.time.split(':')[1], 10);
          if (aTime < bTime) { return -1; }
          return 1;
        });
        return todayData.length ? todayData : null;
      },
    },
    methods: {
      t: function t(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".index." + v), d);
      },
      getData: function getData() {
        var self = this;
        var today = new Date();
        today.setHours(0, 0, 0, 0);

        function getTaken() {
          return new Promise(function (resolve, reject) {
            API$4.getTaken(self.$root.user, {
              dateFrom: today,
              dateTo: new Date(today.getTime() + 24 * 60 * 60 * 1000),
            }).then(function (data) {
              resolve(data);
            }).catch(function (err) {
              reject(err);
            });
          });
        }
        function getData() {
          return new Promise(function (resolve, reject) {
            API$4.getMedications(self.$root.user).then(function (data) {
              resolve(data);
            }).catch(function (err) {
              reject(err);
            });
          });
        }
        Promise
          .all([getData(), getTaken()])
          .then(function (ref) {
            var data = ref[0];
            var takenData = ref[1];

            self.takenData = takenData;
            self.data = data;
            self.checkReminders();
          })
          .catch(function (err) {
            console.log(err);
          });
      },
      isNeedToTake: function isNeedToTake(item) {
        var self = this;
        var todayData = self.todayData;
        if (!todayData) { return false; }

        if (self.isTaken(item) || self.isNotTaken(item)) { return false; }
        var time = item.time.split(':').map(function (e) { return parseInt(e, 10); });
        var d = new Date();
        var h = d.getHours();
        var m = d.getMinutes();
        var needToTake;
        if (h > time[0]) { needToTake = true; }
        else if (h === time[0] && m >= time[1]) { needToTake = true; }
        return needToTake;
      },
      isTaken: function isTaken(item) {
        var self = this;
        if (!self.takenData) { return false; }
        var taken;
        var todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        self.takenData.forEach(function (takenItem) {
          if (taken) { return; }
          var takenDate = new Date(takenItem.data.date || takenItem.start_at);
          takenDate.setHours(0, 0, 0, 0);
          if (item.id === takenItem.data.medication_id && item.time === takenItem.data.time && todayDate.getTime() === takenDate.getTime() && takenItem.data.taken) {
            taken = true;
          }
        });
        return taken;
      },
      isNotTaken: function isNotTaken(item) {
        var self = this;
        if (!self.takenData) { return false; }
        var notTaken;
        var todayDate = new Date();
        todayDate.setHours(0, 0, 0, 0);
        self.takenData.forEach(function (takenItem) {
          if (notTaken) { return; }
          var takenDate = new Date(takenItem.data.date || takenItem.start_at);
          takenDate.setHours(0, 0, 0, 0);
          if (item.id === takenItem.data.medication_id && item.time === takenItem.data.time && todayDate.getTime() === takenDate.getTime() && !takenItem.data.taken) {
            notTaken = true;
          }
        });
        return notTaken;
      },
      checkReminders: function checkReminders() {
        var self = this;
        var todayData = self.todayData;
        if (!todayData) { return; }
        self.todayData.forEach(function (el) {
          if (!self.isNeedToTake(el)) { return; }
          self.$f7.dialog.create({
            text: ("\n            <div class=\"text-align-center\">\n              <img src=\"" + (self.$addonAssetsUrl) + (self.vitalsElement) + "/remind.svg\" height=\"80\"/>\n            </div>\n            <p class=\"text-align-center\">" + (self.$t('health_vitals.medication_reminder.medication_time.text')) + " " + (el.name) + "</p>\n          "),
            buttons: [
              {
                text: self.$t('health_vitals.medication_reminder.medication_time.snooze_button'),
                onClick: function onClick() {
                  API$4.takeMedication(self.$root.user, el.id, el.time, false).then(function () {
                    self.getData();
                  });
                },
              },
              {
                text: self.$t('health_vitals.medication_reminder.medication_time.confirm_button'),
                bold: true,
                onClick: function onClick() {
                  API$4.takeMedication(self.$root.user, el.id, el.time, true).then(function () {
                    self.getData();
                  });
                },
              } ],
          }).open();
        });
      },
      onPageScroll: function onPageScroll(e) {
        var self = this;
        var $pageContentEl = self.$$(e.target).closest('.page-content');
        if (!$pageContentEl.length) { return; }
        var scrollTop = $pageContentEl[0].scrollTop;
        if (scrollTop > 100) {
          self.$f7router.view.$navbarEl.removeClass(("vitals-element-index-navbar vitals-" + (self.vitalsElement) + "-index-navbar"));
        } else {
          self.$f7router.view.$navbarEl.addClass(("vitals-element-index-navbar vitals-" + (self.vitalsElement) + "-index-navbar"));
        }
      },
      onPageBeforeIn: function onPageBeforeIn() {
        var self = this;
        self.$f7router.view.$navbarEl.addClass(("vitals-element-index-navbar vitals-" + (self.vitalsElement) + "-index-navbar"));
      },
      onPageBeforeOut: function onPageBeforeOut() {
        var self = this;
        self.$f7router.view.$navbarEl.removeClass(("vitals-element-index-navbar vitals-" + (self.vitalsElement) + "-index-navbar"));
      },
    },
  };

  var Add$3 = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-page',{class:("vitals-element-manual-add-page vitals-" + (_vm.vitalsElement) + "-manual-add-page"),attrs:{"id":"vitals_element__add"}},[_c('f7-navbar',[_c('tommy-nav-back'),_vm._v(" "),_c('f7-nav-title',[_vm._v(_vm._s(_vm.t('title')))]),_vm._v(" "),_c('f7-nav-right',[(_vm.allowSave)?_c('f7-link',{attrs:{"href":"#","icon-only":""},on:{"click":_vm.save}},[_c('i',{staticClass:"icon f7-icons"},[_vm._v("check")])]):_vm._e()],1)],1),_vm._v(" "),_c('f7-list',{attrs:{"no-hairlines":""}},[_c('f7-list-input',{attrs:{"type":"text","inline-label":"","value":_vm.name,"label":_vm.t('vital_label')},on:{"input":function($event){_vm.name = $event.target.value;}}}),_vm._v(" "),_c('f7-list-input',{attrs:{"type":"text","inline-label":"","input-id":"date-input-start","label":_vm.t('startdate_label')}}),_vm._v(" "),_c('f7-list-input',{attrs:{"type":"text","inline-label":"","input-id":"date-input-end","label":_vm.t('enddate_label')}}),_vm._v(" "),_c('f7-list-item',{attrs:{"smart-select":"","smart-select-params":{ openIn: 'popover', closeOnSelect: true },"title":_vm.t('frequency_label'),"after":_vm.t("frequency_units.0")}},[_c('select',{domProps:{"value":_vm.frequency},on:{"change":function($event){_vm.frequency = parseInt($event.target.value, 10);}}},_vm._l((8),function(n){return _c('option',{key:n,domProps:{"value":n}},[_vm._v(_vm._s(_vm.t(("frequency_units." + (n - 1)))))])}))]),_vm._v(" "),_vm._l((_vm.frequency),function(n){return _c('f7-list-item',{key:n,staticClass:"vitals-medication_reminder-dosage-input"},[_c('div',{staticClass:"input"},[_c('input',{staticClass:"time-input",attrs:{"type":"text"},domProps:{"value":_vm.dosage[n - 1].time}})]),_vm._v(" "),_c('div',{staticClass:"input",staticStyle:{"width":"100px"}},[_c('input',{attrs:{"type":"number","placeholder":_vm.t('dosage_label')},domProps:{"value":_vm.dosage[n - 1].value},on:{"input":function($event){_vm.dosage[n - 1].value = $event.target.value;}}})]),_vm._v(" "),_c('div',{staticClass:"input input-dropdown"},[_c('select',{domProps:{"value":_vm.dosage[n - 1].unit || 'bag'},on:{"change":function($event){_vm.dosage[n - 1].unit = $event.target.value;}}},[_c('option',{attrs:{"value":"bag"}},[_vm._v(_vm._s(_vm.t('dosage_unit.bag')))]),_vm._v(" "),_c('option',{attrs:{"value":"ml"}},[_vm._v(_vm._s(_vm.t('dosage_unit.ml')))]),_vm._v(" "),_c('option',{attrs:{"value":"pill"}},[_vm._v(_vm._s(_vm.t('dosage_unit.pill')))]),_vm._v(" "),_c('option',{attrs:{"value":"mg"}},[_vm._v(_vm._s(_vm.t('dosage_unit.mg')))]),_vm._v(" "),_c('option',{attrs:{"value":"drop"}},[_vm._v(_vm._s(_vm.t('dosage_unit.drop')))])])])])})],2)],1)},staticRenderFns: [],
    props: {
      vitalsElement: String,
    },
    data: function data() {
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      return {
        name: '',
        frequency: 1,
        startDate: today,
        endDate: new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000),
        dosage: [{
          value: '',
          unit: 'bag',
          time: '10:00',
        }],
      };
    },
    computed: {
      allowSave: function allowSave() {
        var self = this;
        if (self.name && self.name.trim().length) {
          var allow = true;
          self.dosage.forEach(function (d) {
            if (!d.value || d.value < 1) { allow = false; }
          });
          if (allow) { return true; }
        }
        return false;
      },
    },
    watch: {
      frequency: function frequency() {
        var self = this;
        var lastValue = self.dosage[self.dosage.length - 1].value;
        var lastUnit = self.dosage[self.dosage.length - 1].unit;
        var lastTime = self.dosage[self.dosage.length - 1].time;
        for (var i = 0; i < self.frequency; i += 1) {
          if (!self.dosage[i]) {
            self.dosage[i] = {
              value: lastValue,
              unit: lastUnit,
              time: lastTime,
            };
          }
        }
        self.$nextTick(function () {
          self.createPickers();
        });
      },
    },
    mounted: function mounted() {
      var self = this;
      var end;
      self.$f7.calendar.create({
        inputEl: self.$el.querySelector('#date-input-start'),
        value: [self.startDate],
        minDate: new Date(),
        on: {
          change: function change(c, v) {
            self.startDate = new Date(v[0]);
            self.startDate.setHours(0, 0, 0, 0);
            if (end) {
              end.params.minDate = self.startDate;
              var endv = new Date(end.value[0]).getTime();
              var startv = new Date(self.startDate).getTime();
              if (endv < startv) { end.setValue([self.startDate]); }
            }
          },
        },
      });
      end = self.$f7.calendar.create({
        inputEl: self.$el.querySelector('#date-input-end'),
        value: [self.endDate],
        on: {
          change: function change(c, v) {
            self.endDate = new Date(v[0]);
            self.endDate.setHours(0, 0, 0, 0);
          },
        },
      });
      self.createPickers();
    },
    methods: {
      t: function t(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".medication_add." + v), d);
      },
      createPickers: function createPickers() {
        var self = this;
        self.$$(self.$el).find('.vitals-medication_reminder-dosage-input .time-input').each(function (index, el) {
          if (el.f7PickerCreated) { return; }
          el.f7PickerCreated = true;

          self.$f7.picker.create({
            inputEl: el,
            value: [self.dosage[index].time.split(':')[0], self.dosage[index].time.split(':')[1]],
            formatValue: function formatValue(v) {
              return ((v[0]) + ":" + (v[1]));
            },
            cols: [
              {
                values: (function () {
                  var v = [];
                  for (var i = 0; i < 24; i += 1) {
                    if (i < 10) { v.push(("0" + i)); }
                    else { v.push(i.toString()); }
                  }
                  return v;
                })(),
              },
              {
                divider: true,
                content: ':',
              },
              {
                values: (function () {
                  var v = [];
                  for (var i = 0; i < 60; i += 1) {
                    if (i < 10) { v.push(("0" + i)); }
                    else { v.push(i.toString()); }
                  }
                  return v;
                })(),
              } ],
            on: {
              change: function change(p, v) {
                self.dosage[index].time = v.join(':');
              },
            },
          });
        });
      },
      save: function save() {
        var self = this;
        var name = self.name;
        var startDate = self.startDate;
        var endDate = self.endDate;
        var dosage = self.dosage;
        var frequency = self.frequency;
        API$4.addMedication(
          self.$root.user,
          {
            name: name,
            startDate: new Date(startDate).toJSON(),
            endDate: new Date(endDate).toJSON(),
            dosage: dosage.filter(function (el, index) {
              return index < frequency;
            }),
            frequency: frequency,
            reminder: true,
          }
        ).then(function () {
          self.$events.$emit(((self.vitalsElement) + ":updateRecords"));
          self.$f7router.back();
        });
      },
    },
  };

  var Edit = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-page',{class:("vitals-element-manual-add-page vitals-" + (_vm.vitalsElement) + "-manual-add-page"),attrs:{"id":"vitals_element__add"}},[_c('f7-navbar',[_c('tommy-nav-back'),_vm._v(" "),_c('f7-nav-title',[_vm._v(_vm._s(_vm.t('title')))]),_vm._v(" "),_c('f7-nav-right',[(_vm.allowSave)?_c('f7-link',{attrs:{"href":"#","icon-only":""},on:{"click":_vm.save}},[_c('i',{staticClass:"icon f7-icons"},[_vm._v("check")])]):_vm._e()],1)],1),_vm._v(" "),(_vm.loaded)?_c('div',{staticClass:"medication-toolbar",attrs:{"slot":"fixed"},slot:"fixed"},[_c('a',{attrs:{"href":"#"},on:{"click":_vm.deleteMedication}},[_vm._v(_vm._s(_vm.t('delete_button')))]),_vm._v(" "),_c('a',{attrs:{"href":"#"},on:{"click":function () { return _vm.reminder ? _vm.stopReminder() : _vm.startReminder(); }}},[_vm._v(_vm._s(_vm.t(_vm.reminder ? 'pause_button' : 'start_button')))])]):_vm._e(),_vm._v(" "),(_vm.loaded)?_c('f7-list',{attrs:{"no-hairlines":""}},[_c('f7-list-input',{attrs:{"type":"text","inline-label":"","value":_vm.name,"label":_vm.t('vital_label')},on:{"input":function($event){_vm.name = $event.target.value;}}}),_vm._v(" "),_c('f7-list-input',{attrs:{"type":"text","inline-label":"","input-id":"date-input-start","label":_vm.t('startdate_label')}}),_vm._v(" "),_c('f7-list-input',{attrs:{"type":"text","inline-label":"","input-id":"date-input-end","label":_vm.t('enddate_label')}}),_vm._v(" "),_c('f7-list-item',{attrs:{"smart-select":"","smart-select-params":{ openIn: 'popover', closeOnSelect: true },"title":_vm.t('frequency_label'),"after":_vm.t("frequency_units.0")}},[_c('select',{domProps:{"value":_vm.frequency},on:{"change":function($event){_vm.frequency = parseInt($event.target.value, 10);}}},_vm._l((8),function(n){return _c('option',{key:n,domProps:{"value":n}},[_vm._v(_vm._s(_vm.t(("frequency_units." + (n - 1)))))])}))]),_vm._v(" "),_vm._l((_vm.frequency),function(n){return _c('f7-list-item',{key:n,staticClass:"vitals-medication_reminder-dosage-input"},[_c('div',{staticClass:"input"},[_c('input',{staticClass:"time-input",attrs:{"type":"text"},domProps:{"value":_vm.dosage[n - 1].time}})]),_vm._v(" "),_c('div',{staticClass:"input",staticStyle:{"width":"100px"}},[_c('input',{attrs:{"type":"number","placeholder":_vm.t('dosage_label')},domProps:{"value":_vm.dosage[n - 1].value},on:{"input":function($event){_vm.dosage[n - 1].value = $event.target.value;}}})]),_vm._v(" "),_c('div',{staticClass:"input input-dropdown"},[_c('select',{domProps:{"value":_vm.dosage[n - 1].unit || 'bag'},on:{"change":function($event){_vm.dosage[n - 1].unit = $event.target.value;}}},[_c('option',{attrs:{"value":"bag"}},[_vm._v(_vm._s(_vm.t('dosage_unit.bag')))]),_vm._v(" "),_c('option',{attrs:{"value":"ml"}},[_vm._v(_vm._s(_vm.t('dosage_unit.ml')))]),_vm._v(" "),_c('option',{attrs:{"value":"pill"}},[_vm._v(_vm._s(_vm.t('dosage_unit.pill')))]),_vm._v(" "),_c('option',{attrs:{"value":"mg"}},[_vm._v(_vm._s(_vm.t('dosage_unit.mg')))]),_vm._v(" "),_c('option',{attrs:{"value":"drop"}},[_vm._v(_vm._s(_vm.t('dosage_unit.drop')))])])])])})],2):_vm._e()],1)},staticRenderFns: [],
    props: {
      id: String,
      vitalsElement: String,
    },
    data: function data() {
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      return {
        loaded: false,
        name: '',
        frequency: 1,
        startDate: today,
        endDate: new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000),
        reminder: true,
        dosage: [{
          value: '',
          unit: 'bag',
          time: '10:00',
        }],
      };
    },
    computed: {
      allowSave: function allowSave() {
        var self = this;
        if (self.name && self.name.trim().length) {
          var allow = true;
          self.dosage.forEach(function (d) {
            if (!d.value || d.value < 1) { allow = false; }
          });
          if (allow) { return true; }
        }
        return false;
      },
    },
    watch: {
      frequency: function frequency() {
        var self = this;
        var lastValue = self.dosage[self.dosage.length - 1].value;
        var lastUnit = self.dosage[self.dosage.length - 1].unit;
        var lastTime = self.dosage[self.dosage.length - 1].time;
        for (var i = 0; i < self.frequency; i += 1) {
          if (!self.dosage[i]) {
            self.dosage[i] = {
              value: lastValue,
              unit: lastUnit,
              time: lastTime,
            };
          }
        }
        self.$nextTick(function () {
          self.createPickers();
        });
      },
    },
    mounted: function mounted() {
      var self = this;
      var end;
      API$4.getMedication(self.$root.user, self.id).then(function (med) {
        self.name = med.data.name;
        self.frequency = med.data.frequency;
        self.startDate = med.data.startDate;
        self.endDate = med.data.endDate;
        self.dosage = med.data.dosage;
        self.reminder = med.data.reminder;
        self.loaded = true;
        self.$nextTick(function () {
          self.$f7.calendar.create({
            inputEl: self.$el.querySelector('#date-input-start'),
            value: [self.startDate],
            minDate: new Date(),
            on: {
              change: function change(c, v) {
                self.startDate = new Date(v[0]);
                self.startDate.setHours(0, 0, 0, 0);
                if (end) {
                  end.params.minDate = self.startDate;
                  var endv = new Date(end.value[0]).getTime();
                  var startv = new Date(self.startDate).getTime();
                  if (endv < startv) { end.setValue([self.startDate]); }
                }
              },
            },
          });
          end = self.$f7.calendar.create({
            inputEl: self.$el.querySelector('#date-input-end'),
            value: [self.endDate],
            on: {
              change: function change(c, v) {
                self.endDate = new Date(v[0]);
                self.endDate.setHours(0, 0, 0, 0);
              },
            },
          });
          self.createPickers();
        });
      });
    },
    methods: {
      t: function t(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".medication_edit." + v), d);
      },
      createPickers: function createPickers() {
        var self = this;
        self.$$(self.$el).find('.vitals-medication_reminder-dosage-input .time-input').each(function (index, el) {
          if (el.f7PickerCreated) { return; }
          el.f7PickerCreated = true;

          self.$f7.picker.create({
            inputEl: el,
            value: [self.dosage[index].time.split(':')[0], self.dosage[index].time.split(':')[1]],
            formatValue: function formatValue(v) {
              return ((v[0]) + ":" + (v[1]));
            },
            cols: [
              {
                values: (function () {
                  var v = [];
                  for (var i = 0; i < 24; i += 1) {
                    if (i < 10) { v.push(("0" + i)); }
                    else { v.push(i.toString()); }
                  }
                  return v;
                })(),
              },
              {
                divider: true,
                content: ':',
              },
              {
                values: (function () {
                  var v = [];
                  for (var i = 0; i < 60; i += 1) {
                    if (i < 10) { v.push(("0" + i)); }
                    else { v.push(i.toString()); }
                  }
                  return v;
                })(),
              } ],
            on: {
              change: function change(p, v) {
                self.dosage[index].time = v.join(':');
              },
            },
          });
        });
      },
      deleteMedication: function deleteMedication() {
        var self = this;
        API$4.deleteMedication(self.$root.user, self.id).then(function () {
          self.$events.$emit(((self.vitalsElement) + ":updateRecords"));
          self.$f7router.back();
        });
      },
      stopReminder: function stopReminder() {
        var self = this;
        var name = self.name;
        var startDate = self.startDate;
        var endDate = self.endDate;
        var dosage = self.dosage;
        var frequency = self.frequency;
        API$4.updateMedication(
          self.$root.user,
          self.id,
          {
            name: name,
            startDate: new Date(startDate).toJSON(),
            endDate: new Date(endDate).toJSON(),
            dosage: dosage,
            frequency: frequency,
            reminder: false,
          }
        ).then(function () {
          self.$events.$emit(((self.vitalsElement) + ":updateRecords"));
          self.$f7router.back();
        });
      },
      startReminder: function startReminder() {
        var self = this;
        var name = self.name;
        var startDate = self.startDate;
        var endDate = self.endDate;
        var dosage = self.dosage;
        var frequency = self.frequency;
        API$4.updateMedication(
          self.$root.user,
          self.id,
          {
            name: name,
            startDate: new Date(startDate).toJSON(),
            endDate: new Date(endDate).toJSON(),
            dosage: dosage,
            frequency: frequency,
            reminder: true,
          }
        ).then(function () {
          self.$events.$emit(((self.vitalsElement) + ":updateRecords"));
          self.$f7router.back();
        });
      },
      save: function save() {
        var self = this;
        var name = self.name;
        var startDate = self.startDate;
        var endDate = self.endDate;
        var dosage = self.dosage;
        var frequency = self.frequency;
        var reminder = self.reminder;
        if (typeof reminder === 'undefined') { reminder = true; }
        API$4.updateMedication(
          self.$root.user,
          self.id,
          {
            name: name,
            startDate: new Date(startDate).toJSON(),
            endDate: new Date(endDate).toJSON(),
            dosage: dosage,
            frequency: frequency,
            reminder: reminder,
          }
        ).then(function () {
          self.$events.$emit(((self.vitalsElement) + ":updateRecords"));
          self.$f7router.back();
        });
      },
    },
  };

  var settings$3 = {
    receiveMessage: false,
  };

  var Settings$3 = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-page',{class:("vitals-element-settings-page vitals-" + (_vm.vitalsElement) + "-settings-page"),attrs:{"id":"vitals_element__settings"}},[_c('f7-navbar',[_c('tommy-nav-back'),_vm._v(" "),_c('f7-nav-title',[_vm._v(_vm._s(_vm.t('title')))])],1),_vm._v(" "),_c('div',{class:("vitals-element-settings-header vitals-" + (_vm.vitalsElement) + "-settings-header")},[_c('div',{class:("vitals-element-settings-center-icon vitals-" + (_vm.vitalsElement) + "-settings-center-icon")})]),_vm._v(" "),_c('div',{class:("vitals-element-settings-text vitals-" + (_vm.vitalsElement) + "-settings-text")},[_c('p',[_vm._v(_vm._s(_vm.t('vital_text')))])]),_vm._v(" "),_c('f7-list',{staticClass:"no-hairlines"},[_c('f7-list-item',{attrs:{"title":_vm.t('chat_label')}},[_c('f7-toggle',{attrs:{"slot":"after","checked":_vm.settings.receiveMessage},on:{"toggle:change":_vm.onMessagesChanges},slot:"after"})],1)],1)],1)},staticRenderFns: [],
    props: {
      vitalsElement: String,
    },
    data: function data() {
      return {
        settings: settings$3,
      };
    },
    mounted: function mounted() {
      var self = this;
      API$4.getSettings(self.vitalsElement).then(function (res) {
        if (!res) { return; }
        self.settings = res;
        settings$3 = self.settings;
      });
    },
    methods: {
      t: function t(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".settings." + v), d);
      },
      onMessagesChanges: function onMessagesChanges(checked) {
        var self = this;
        self.settings.receiveMessage = checked;
        settings$3 = self.settings;
        API$4.saveSettings(self.vitalsElement, self.settings);
      },
    },
  };

  var History$3 = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-page',{class:("vitals-" + (_vm.vitalsElement) + "-history-page"),attrs:{"id":"vitals_element__history"}},[_c('f7-navbar',[_c('tommy-nav-back'),_vm._v(" "),_c('f7-nav-title',[_vm._v(_vm._s(_vm.t('title')))])],1),_vm._v(" "),_c('div',{staticClass:"medication-history-header"},[(_vm.data && _vm.takenData)?[_c('div',{staticClass:"medication-history-header-icon",class:{'not-taken': !_vm.isLastDayTaken}}),_vm._v(" "),_c('div',{staticClass:"medication-history-header-text"},[_vm._v(_vm._s(_vm.isLastDayTaken ? _vm.t('notice_text.0') : _vm.t('notice_text.1')))])]:_vm._e()],2),_vm._v(" "),_vm._l((_vm.orderedData),function(dateItems,key){return _c('div',{key:key,staticClass:"medication-history-card",on:{"click":function($event){_vm.toggleCard(key);}}},[_c('div',{staticClass:"medication-history-card-date"},[_c('span',[_vm._v(_vm._s(_vm.$moment(key).format('DD MMM YYYY')))]),_vm._v(" "),(_vm.isOpenedCard(key))?_c('span',[_vm._v(_vm._s(_vm.percentageTaken(dateItems, key))+"%")]):_vm._e(),_vm._v(" "),_c('f7-icon',{attrs:{"f7":_vm.isOpenedCard(key) ? 'chevron_up' : 'chevron_right',"size":"16"}})],1),_vm._v(" "),(!_vm.isOpenedCard(key))?_c('div',{staticClass:"medication-history-card-content"},[(_vm.percentageTaken(dateItems, key) === 100)?_c('div',{staticClass:"medication-history-card-icon taken"}):_c('f7-gauge',{attrs:{"size":46,"value":_vm.percentageTaken(dateItems, key) / 100,"border-bg-color":"#FAE1C9","border-color":"#FF4500","border-width":8}}),_vm._v(" "),_c('div',{staticClass:"medication-history-card-title"},[_vm._v(_vm._s(_vm.t('dosage_status')))]),_vm._v(" "),_c('div',{staticClass:"medication-history-card-value"},[_vm._v(_vm._s(_vm.percentageTaken(dateItems, key))+"%")])],1):_vm._l((dateItems),function(item,index){return _c('div',{key:index,staticClass:"medication-history-card-content"},[_c('div',{staticClass:"medication-history-card-icon",class:{ taken: _vm.isTaken(item, key), 'not-taken': _vm.isNotTaken(item, key), }}),_vm._v(" "),_c('div',{staticClass:"medication-history-card-title"},[_vm._v(_vm._s(item.name))]),_vm._v(" "),_c('div',{staticClass:"medication-history-card-value"},[_vm._v(_vm._s(item.time))])])})],2)})],2)},staticRenderFns: [],
    props: {
      vitalsElement: String,
    },
    data: function data() {
      return {
        data: null,
        takenData: null,
        openedCards: [],
      };
    },
    mounted: function mounted() {
      var self = this;
      self.getData();
    },
    computed: {
      isLastDateTaken: function isLastDateTaken() {
        var self = this;
        var today = self.$moment().format('YYYY-MM-DD');
        if (!self.orderedData) { return true; }
        if (!self.orderedData[today]) { return true; }
        return self.percentageTaken(self.orderedData[today]) === 100;
      },
      orderedData: function orderedData() {
        var self = this;
        if (!self.data) { return undefined; }
        var data = {};
        self.data.forEach(function (medication) {
          var ref;

          var startDate = new Date(medication.data.startDate);
          if (startDate.getTime() > new Date().getTime()) { return; }
          var endDate = new Date(medication.data.endDate);
          if (endDate.getTime() > new Date().getTime()) {
            endDate = new Date();
            endDate.setHours(0, 0, 0, 0);
          }
          var days = (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000) + 1;
          for (var i = 0; i < days; i += 1) {
            var d = new Date(startDate).getTime() + i * (24 * 60 * 60 * 1000);
            var formatted = self.$moment(d).format('YYYY-MM-DD');
            if (!data[formatted]) { data[formatted] = []; }
            (ref = data[formatted]).push.apply(ref, medication.data.dosage.map(function (dose) { return ({
              id: medication.id,
              name: medication.data.name,
              time: dose.time,
            }); }));
          }
        });
        Object.keys(data).forEach(function (key) {
          var dayData = data[key];
          dayData.sort(function (a, b) {
            var aTime = parseInt(a.time.split(':')[0], 10) * 60 + parseInt(a.time.split(':')[1], 10);
            var bTime = parseInt(b.time.split(':')[0], 10) * 60 + parseInt(b.time.split(':')[1], 10);
            if (aTime < bTime) { return -1; }
            return 1;
          });
        });
        var sortedKeys = Object.keys(data).sort(function (a, b) {
          var aDate = new Date(a).getTime();
          var bDate = new Date(b).getTime();
          if (aDate > bDate) { return -1; }
          return 1;
        });
        var sortedData = {};
        sortedKeys.forEach(function (key) {
          sortedData[key] = data[key];
        });
        return sortedData;
      },
    },
    methods: {
      isOpenedCard: function isOpenedCard(key) {
        var self = this;
        return self.openedCards.indexOf(key) >= 0;
      },
      toggleCard: function toggleCard(key) {
        var self = this;
        if (self.openedCards.indexOf(key) >= 0) {
          self.openedCards.splice(self.openedCards.indexOf(key), 1);
        } else {
          self.openedCards.push(key);
        }
      },
      percentageTaken: function percentageTaken(items, date) {
        var self = this;
        var takenItems = items.filter(function (item) { return self.isTaken(item, date); });
        return Math.round(takenItems.length / items.length * 100);
      },
      isTaken: function isTaken(item, date) {
        var self = this;
        if (!self.takenData) { return false; }
        var taken;
        var todayDate = new Date(date);
        todayDate.setHours(0, 0, 0, 0);
        self.takenData.forEach(function (takenItem) {
          if (taken) { return; }
          var takenDate = new Date(takenItem.data.date || takenItem.start_at);
          takenDate.setHours(0, 0, 0, 0);
          if (item.id === takenItem.data.medication_id && item.time === takenItem.data.time && todayDate.getTime() === takenDate.getTime() && takenItem.data.taken) {
            taken = true;
          }
        });
        return taken;
      },
      isNotTaken: function isNotTaken(item, date) {
        var self = this;
        if (!self.takenData) { return false; }
        var notTaken;
        var todayDate = new Date(date);
        todayDate.setHours(0, 0, 0, 0);
        self.takenData.forEach(function (takenItem) {
          if (notTaken) { return; }
          var takenDate = new Date(takenItem.data.date || takenItem.start_at);
          takenDate.setHours(0, 0, 0, 0);
          if (item.id === takenItem.data.medication_id && item.time === takenItem.data.time && todayDate.getTime() === takenDate.getTime() && !takenItem.data.taken) {
            notTaken = true;
          }
        });
        return notTaken;
      },
      getData: function getData() {
        var self = this;

        function getTaken() {
          return new Promise(function (resolve, reject) {
            API$4.getTaken(self.$root.user).then(function (data) {
              resolve(data);
            }).catch(function (err) {
              reject(err);
            });
          });
        }
        function getData() {
          return new Promise(function (resolve, reject) {
            API$4.getMedications(self.$root.user).then(function (data) {
              resolve(data);
            }).catch(function (err) {
              reject(err);
            });
          });
        }
        Promise
          .all([getData(), getTaken()])
          .then(function (ref) {
            var data = ref[0];
            var takenData = ref[1];

            self.takenData = takenData;
            self.data = data;
          })
          .catch(function (err) {
            console.log(err);
          });
      },
      t: function t(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".history." + v), d);
      },
    },
  };

  var Plan = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-page',{class:("vitals-" + (_vm.vitalsElement) + "-plan-page")},[_c('f7-navbar',[_c('tommy-nav-back'),_vm._v(" "),_c('f7-nav-title',[_vm._v(_vm._s(_vm.t('title')))])],1),_vm._v(" "),_c('f7-fab',{class:("vitals-element-fab vitals-" + (_vm.vitalsElement) + "-fab"),attrs:{"href":("/health_vitals/" + (_vm.vitalsElement) + "/add/")}},[_c('f7-icon',{attrs:{"f7":"add"}})],1),_vm._v(" "),_vm._l((_vm.medications),function(med){return _c('a',{key:med.id,staticClass:"medication-card",attrs:{"href":("/health_vitals/" + (_vm.vitalsElement) + "/edit/" + (med.id) + "/")}},[_c('div',{staticClass:"medication-card-date"},[_vm._v(_vm._s(_vm.$moment(med.data.startDate).format('D MMM YYYY'))+" - "+_vm._s(_vm.$moment(med.data.endDate).format('D MMM YYYY')))]),_vm._v(" "),_c('div',{staticClass:"medication-card-content"},[_c('div',{staticClass:"medication-card-icon"}),_vm._v(" "),_c('div',{staticClass:"medication-card-name"},[_vm._v(_vm._s(med.data.name))])])])})],2)},staticRenderFns: [],
    props: {
      vitalsElement: String,
    },
    data: function data() {
      return {
        medications: null,
      };
    },
    mounted: function mounted() {
      var self = this;
      self.getMedications();
      self.$events.$on(((self.vitalsElement) + ":updateRecords"), self.getMedications);
    },
    beforeDestroy: function beforeDestroy() {
      var self = this;
      self.$events.$off(((self.vitalsElement) + ":updateRecords"), self.getMedications);
    },
    methods: {
      t: function t(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".medication_plan." + v), d);
      },
      getMedications: function getMedications() {
        var self = this;
        API$4.getMedications(self.$root.user).then(function (medications) {
          self.medications = medications;
        });
      },
    },
  };

  var routes$5 = [
    {
      path: '/health_vitals/medication_reminder/',
      component: Index$4,
    },
    {
      path: '/health_vitals/medication_reminder/plan/',
      component: Plan,
    },
    {
      path: '/health_vitals/medication_reminder/add/',
      component: Add$3,
    },
    {
      path: '/health_vitals/medication_reminder/edit/:id/',
      component: Edit,
    },
    {
      path: '/health_vitals/medication_reminder/settings/',
      component: Settings$3,
    },
    {
      path: '/health_vitals/medication_reminder/history/',
      component: History$3,
    } ];
  routes$5.forEach(function (r) {
    r.options = {
      props: {
        vitalsElement: 'medication_reminder',
      },
    };
  });

  var routes$6 = [
    {
      path: '/health_vitals/pedometer/',
      component: Index$1,
    },
    {
      path: '/health_vitals/pedometer/add/',
      component: Add,
    },
    {
      path: '/health_vitals/pedometer/settings/',
      component: Settings,
    },
    {
      path: '/health_vitals/pedometer/history/',
      component: History,
    } ];
  routes$6.forEach(function (r) {
    r.options = {
      props: {
        vitalsElement: 'pedometer',
        chartType: 'column',
        chartColor: '#1498CE',
        chartWeekSumsDays: true,
        chartMonthSumsDays: true,
      },
    };
  });

  var routes$7 = [
    {
      path: '/health_vitals/temperature/',
      component: Index$1,
    },
    {
      path: '/health_vitals/temperature/add/',
      component: Add,
    },
    {
      path: '/health_vitals/temperature/settings/',
      component: Settings,
    },
    {
      path: '/health_vitals/temperature/history/',
      component: History,
    } ];
  routes$7.forEach(function (r) {
    r.options = {
      props: {
        vitalsElement: 'temperature',
      },
    };
  });

  var api$5 = window.tommy.api;

  var API$5 = {
    getRecords: function getRecords(vitalsElement, user, ref) {
      if ( ref === void 0 ) ref = {};
      var page = ref.page;
      var limit = ref.limit;
      var dateFrom = ref.dateFrom;
      var dateTo = ref.dateTo;

      // eslint-disable-next-line
      vitalsElement = vitalsElement.split(/[-_]/g).map(function (w) { return w[0].toUpperCase() + w.substr(1); }).join('');
      var date_range;
      if (dateFrom && dateTo) {
        date_range = [new Date(dateFrom).toJSON(), new Date(dateTo).toJSON()];
      }
      return api$5.getFragments({
        addon: 'health_vitals',
        kind: ("Vitals" + vitalsElement + "Item"),
        with_filters: true,
        with_permission_to: true,
        user_id: Actor.id || user.id,
        actor_id: Actor.id,
        page: page || 1,
        limit: limit || 50,
        date_range: date_range,
      }, {
        cache: false,
      });
    },
    addRecord: function addRecord(vitalsElement, user, data) {
      // eslint-disable-next-line
      vitalsElement = vitalsElement.split(/[-_]/g).map(function (w) { return w[0].toUpperCase() + w.substr(1); }).join('');
      var startAt = new Date(data.date);
      startAt.setHours(parseInt(data.time.split(':')[0], 10), parseInt(data.time.split(':')[1], 10));
      var tagUser = Actor.user || user;
      var obj = {
        addon: 'health_vitals',
        kind: ("Vitals" + vitalsElement + "Item"),
        with_filters: true,
        start_at: startAt.toJSON(),
        tags: [{
          context: 'members',
          name: tagUser.name || ((tagUser.first_name || '') + " " + (tagUser.last_name || '')),
          user_id: Actor.id || user.id,
        }],
        filters: [{
          context: 'members',
          name: tagUser.name || ((tagUser.first_name || '') + " " + (tagUser.last_name || '')),
          user_id: Actor.id || user.id,
        }],
        data: JSON.stringify(data),
      };
      if (Actor.id) {
        obj.actor_id = Actor.id;
        obj.actor_type = 'User';
      }
      return api$5.createFragment(obj);
    },
    getSettings: function getSettings(vitalsElement) {
      return api$5.call({
        endpoint: ("addons/health_vitals/install/settings/" + vitalsElement),
        method: 'GET',
        cache: false,
      }).then(function (res) {
        if (!res) { return res; }
        if (!res.data) { return null; }
        return res.data;
      });
    },
    saveSettings: function saveSettings(vitalsElement, settings) {
      if ( settings === void 0 ) settings = {};

      return api$5.call({
        endpoint: ("addons/health_vitals/install/settings/" + vitalsElement),
        method: 'PUT',
        data: { data: JSON.stringify(settings) },
      });
    },
  };

  var Index$5 = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-page',{class:("vitals-elment-index-page vitals-" + (_vm.vitalsElement) + "-index-page"),attrs:{"id":"vitals_element__index"},on:{"page:beforein":_vm.onPageBeforeIn,"page:beforeout":_vm.onPageBeforeOut},nativeOn:{"!scroll":function($event){return _vm.onPageScroll($event)}}},[_c('f7-navbar',[_c('tommy-nav-back'),_vm._v(" "),_c('f7-nav-title',[_vm._v(_vm._s(_vm.t('title')))]),_vm._v(" "),_c('f7-nav-right',[_c('f7-link',{attrs:{"href":("/health_vitals/" + (_vm.vitalsElement) + "/settings/"),"icon-only":""}},[_c('i',{class:("icon vitals-element-icon-settings vitals-" + (_vm.vitalsElement) + "-icon-settings")})]),_vm._v(" "),_c('f7-link',{attrs:{"href":("/health_vitals/" + (_vm.vitalsElement) + "/history/"),"icon-only":"","route-props":{ goalValue: _vm.settings ? _vm.settings.goal_value : 0 }}},[_c('i',{class:("icon vitals-element-icon-chart vitals-" + (_vm.vitalsElement) + "-icon-chart")})])],1)],1),_vm._v(" "),_c('f7-fab',{class:("vitals-element-fab vitals-" + (_vm.vitalsElement) + "-fab"),attrs:{"href":("/health_vitals/" + (_vm.vitalsElement) + "/add/")}},[_c('f7-icon',{attrs:{"f7":"add"}})],1),_vm._v(" "),_c('div',{class:("vitals-element-index-header vitals-" + (_vm.vitalsElement) + "-index-header")},[_c('div',{class:("vitals-element-index-header-icon vitals-" + (_vm.vitalsElement) + "-index-header-icon")}),_vm._v(" "),(_vm.data && _vm.data.length)?_c('div',{class:("vitals-element-index-header-content vitals-" + (_vm.vitalsElement) + "-index-header-content")},[(_vm.settings && _vm.settings.goal_value)?_c('div',{class:("vitals-" + (_vm.vitalsElement) + "-index-header-data-row")},[_c('div',{class:("vitals-" + (_vm.vitalsElement) + "-index-header-data-label")},[_vm._v(_vm._s(_vm.t('goal_label')))]),_vm._v(" "),_c('div',{class:("vitals-element-index-header-data vitals-" + (_vm.vitalsElement) + "-index-header-data")},[_vm._v(_vm._s(_vm.settings.goal_value)),_c('span',[_vm._v(_vm._s(_vm.t(("vital_unit." + (_vm.settings.goal_unit || 5)))))])])]):_vm._e(),_vm._v(" "),_c('div',{class:("vitals-" + (_vm.vitalsElement) + "-index-header-data-row")},[_c('div',{class:("vitals-" + (_vm.vitalsElement) + "-index-header-data-label")},[_vm._v(_vm._s(_vm.t('achieved_label')))]),_vm._v(" "),_c('div',{class:("vitals-element-index-header-data vitals-" + (_vm.vitalsElement) + "-index-header-data")},[_vm._v(_vm._s(_vm.todayValue)),_c('span',[_vm._v(_vm._s(_vm.t(("vital_unit." + (_vm.data[0].data.unit || 5)))))])])])]):_vm._e(),_vm._v(" "),(_vm.data && !_vm.data.length)?_c('div',{class:("vitals-element-index-header-content vitals-" + (_vm.vitalsElement) + "-index-header-content")},[_c('div',{class:("vitals-element-index-header-data vitals-" + (_vm.vitalsElement) + "-index-header-data")},[_vm._v(_vm._s(_vm.t('vital_label')))])]):_vm._e()]),_vm._v(" "),(_vm.data && !_vm.data.length)?_c('div',{class:("vitals-element-index-no-data vitals-" + (_vm.vitalsElement) + "-index-no-data")},[_c('i',{class:("vitals-element-index-no-data-img vitals-" + (_vm.vitalsElement) + "-index-no-data-img")}),_vm._v(" "),_c('span',[_vm._v(_vm._s(_vm.t('not_available')))])]):_vm._e(),_vm._v(" "),(_vm.data && _vm.data.length)?_c('div',{class:("vitals-element-index-cards vitals-" + (_vm.vitalsElement) + "-index-cards")},_vm._l((_vm.data),function(item,index){return _c('div',{key:index,class:("vitals-element-card vitals-" + (_vm.vitalsElement) + "-card")},[_c('div',{class:("vitals-element-card-title vitals-" + (_vm.vitalsElement) + "-card-title")},[_vm._v(_vm._s(_vm.$moment(item.data.date).format('DD MMM YYYY'))+" "+_vm._s(item.data.time))]),_vm._v(" "),_c('div',{class:("vitals-element-card-content vitals-" + (_vm.vitalsElement) + "-card-content")},[_c('div',{class:("vitals-element-card-icon vitals-" + (_vm.vitalsElement) + "-card-icon")},[(item.data.value < 200)?_c('img',{attrs:{"src":("" + (_vm.$addonAssetsUrl) + (_vm.vitalsElement) + "/card-icon-cup.svg")}}):(item.data.value < 350)?_c('img',{attrs:{"src":("" + (_vm.$addonAssetsUrl) + (_vm.vitalsElement) + "/card-icon-glass.svg")}}):_c('img',{attrs:{"src":("" + (_vm.$addonAssetsUrl) + (_vm.vitalsElement) + "/card-icon-bottle.svg")}})]),_vm._v(" "),_c('div',{class:("vitals-element-card-value vitals-" + (_vm.vitalsElement) + "-card-value")},[_vm._v(_vm._s(item.data.value)+" "),_c('sub',[_vm._v(_vm._s(_vm.t(("vital_unit." + (item.data.unit || 0)))))])])])])})):_vm._e()],1)},staticRenderFns: [],
    props: {
      vitalsElement: String,
    },
    data: function data() {
      return {
        data: null,
        settings: null,
      };
    },
    mounted: function mounted() {
      var self = this;
      self.getData();
      self.$events.$on(((self.vitalsElement) + ":updateRecords"), self.getData);
      API$5.getSettings(self.vitalsElement).then(function (res) {
        if (!res) { return; }
        self.settings = res;
      });
    },
    beforeDestroy: function beforeDestroy() {
      var self = this;
      self.$events.$off(((self.vitalsElement) + ":updateRecords"), self.getData);
    },
    computed: {
      todayValue: function todayValue() {
        var self = this;
        if (!self.data) { return null; }
        var value = 0;
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        self.data.forEach(function (el) {
          var elDate = new Date(el.data.date);
          if (elDate.getTime() === today.getTime()) {
            value += el.data.value;
          }
        });
        return value;
      },
    },
    methods: {
      t: function t(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".index." + v), d);
      },
      getData: function getData() {
        var self = this;
        API$5.getRecords(self.vitalsElement, self.$root.user).then(function (data) {
          self.data = data.filter(function (el) { return el.data && el.data.value; }).sort(function (a, b) {
            var aDate = new Date(a.data.date);
            var ref = a.data.time.split(':');
            var aH = ref[0];
            var aM = ref[1];
            aDate.setHours(parseInt(aH, 10), parseInt(aM, 10));

            var bDate = new Date(b.data.date);
            var ref$1 = b.data.time.split(':');
            var bH = ref$1[0];
            var bM = ref$1[1];
            bDate.setHours(parseInt(bH, 10), parseInt(bM, 10));

            return bDate - aDate;
          });
        });
      },
      onPageScroll: function onPageScroll(e) {
        var self = this;
        var $pageContentEl = self.$$(e.target).closest('.page-content');
        if (!$pageContentEl.length) { return; }
        var scrollTop = $pageContentEl[0].scrollTop;
        if (scrollTop > 100) {
          self.$f7router.view.$navbarEl.removeClass(("vitals-element-index-navbar vitals-" + (self.vitalsElement) + "-index-navbar"));
        } else {
          self.$f7router.view.$navbarEl.addClass(("vitals-element-index-navbar vitals-" + (self.vitalsElement) + "-index-navbar"));
        }
      },
      onPageBeforeIn: function onPageBeforeIn() {
        var self = this;
        self.$f7router.view.$navbarEl.addClass(("vitals-element-index-navbar vitals-" + (self.vitalsElement) + "-index-navbar"));
      },
      onPageBeforeOut: function onPageBeforeOut() {
        var self = this;
        self.$f7router.view.$navbarEl.removeClass(("vitals-element-index-navbar vitals-" + (self.vitalsElement) + "-index-navbar"));
      },
    },
  };

  var Add$4 = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-page',{class:("vitals-element-manual-add-page vitals-" + (_vm.vitalsElement) + "-manual-add-page"),attrs:{"id":"vitals_element__add"}},[_c('f7-navbar',[_c('tommy-nav-back'),_vm._v(" "),_c('f7-nav-title',[_vm._v(_vm._s(_vm.t('title')))])],1),_vm._v(" "),_c('f7-list',{attrs:{"no-chevron":"","no-hairlines":"","no-hairlines-between":""}},[_c('f7-list-item',{attrs:{"link":"","title":("" + (_vm.t('option_a_label')) + (_vm.t('vital_unit.5')))},on:{"click":function($event){_vm.addValue(150);}}},[_c('img',{attrs:{"slot":"media","src":("" + (_vm.$addonAssetsUrl) + (_vm.vitalsElement) + "/card-icon-cup.svg")},slot:"media"})]),_vm._v(" "),_c('f7-list-item',{attrs:{"link":"","title":("" + (_vm.t('option_b_label')) + (_vm.t('vital_unit.5')))},on:{"click":function($event){_vm.addValue(220);}}},[_c('img',{attrs:{"slot":"media","src":("" + (_vm.$addonAssetsUrl) + (_vm.vitalsElement) + "/card-icon-glass.svg")},slot:"media"})]),_vm._v(" "),_c('f7-list-item',{attrs:{"link":"","title":("" + (_vm.t('option_c_label')) + (_vm.t('vital_unit.5')))},on:{"click":function($event){_vm.addValue(350);}}},[_c('img',{attrs:{"slot":"media","src":("" + (_vm.$addonAssetsUrl) + (_vm.vitalsElement) + "/card-icon-bottle.svg")},slot:"media"})]),_vm._v(" "),_c('f7-list-item',{attrs:{"link":"","title":("" + (_vm.t('option_d_label')) + (_vm.t('vital_unit.5')))},on:{"click":function($event){_vm.addValue(400);}}},[_c('img',{attrs:{"slot":"media","src":("" + (_vm.$addonAssetsUrl) + (_vm.vitalsElement) + "/card-icon-bottle.svg")},slot:"media"})]),_vm._v(" "),_c('f7-list-item',{class:("vitals-" + (_vm.vitalsElement) + "-manual-add-custom-button"),attrs:{"link":"","title":("" + (_vm.t('custom_button')))},on:{"click":_vm.addCustom}})],1)],1)},staticRenderFns: [],
    props: {
      vitalsElement: String,
    },
    data: function data() {
      return {};
    },
    computed: {
      allowSave: function allowSave() {
        var self = this;
        return self.value && self.value > 0;
      },
    },
    mounted: function mounted() {
      /*
      self.$f7.calendar.create({
        inputEl: self.$el.querySelector('#date-input'),
        value: [new Date()],
        on: {
          change(c, v) {
            self.date = new Date(v[0]);
            self.date.setHours(0, 0, 0, 0);
          },
        },
      });

      let hours = new Date().getHours();
      if (hours < 10) hours = `0${hours}`;
      let minutes = new Date().getMinutes();
      if (minutes < 10) minutes = `0${minutes}`;

      self.$f7.picker.create({
        inputEl: self.$el.querySelector('#time-input'),
        value: [hours.toString(), minutes.toString()],
        formatValue(v) {
          return `${v[0]}:${v[1]}`;
        },
        cols: [
          {
            values: (() => {
              const v = [];
              for (let i = 0; i < 24; i += 1) {
                if (i < 10) v.push(`0${i}`);
                else v.push(i.toString());
              }
              return v;
            })(),
          },
          {
            divider: true,
            content: ':',
          },
          {
            values: (() => {
              const v = [];
              for (let i = 0; i < 60; i += 1) {
                if (i < 10) v.push(`0${i}`);
                else v.push(i.toString());
              }
              return v;
            })(),
          },
        ],
        on: {
          change(p, v) {
            self.time = v.join(':');
          },
        },
      });
      */
    },
    methods: {
      t: function t(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".manual_enter." + v), d);
      },
      addCustom: function addCustom() {
        var self = this;
        self.$f7.dialog.create({
          text: self.$t('health_vitals.water_tracker.custom_amount.text'),
          content: '<div class="dialog-input-field item-input"><div class="item-input-wrap"><input type="number" class="dialog-input"></div></div>',
          buttons: [
            {
              text: self.$t('health_vitals.water_tracker.custom_amount.cancel_button'),
              keyCodes: [27],
            },
            {
              text: self.$t('health_vitals.water_tracker.custom_amount.confirm_button'),
              bold: true,
              color: 'red',
              keyCodes: [13],
            } ],
          onClick: function onClick(dialog, index) {
            var inputValue = dialog.$el.find('.dialog-input').val();
            if (index !== 1 || !inputValue) { return; }
            self.addValue(parseFloat(inputValue));
          },
          destroyOnClose: true,
        }).open();
      },
      addValue: function addValue(value) {
        var self = this;

        var date = new Date();
        var hours = new Date().getHours();
        if (hours < 10) { hours = "0" + hours; }
        var minutes = new Date().getMinutes();
        if (minutes < 10) { minutes = "0" + minutes; }
        var time = hours + ":" + minutes;
        date.setHours(0, 0, 0, 0);

        API$5.addRecord(
          self.vitalsElement,
          self.$root.user,
          {
            value: value,
            date: new Date(date).toJSON(),
            time: time,
            unit: 5,
          }
        ).then(function () {
          self.$events.$emit(((self.vitalsElement) + ":updateRecords"));
          self.$f7router.back();
        });
      },
    },
  };

  var settings$4 = {
    receiveMessage: false,
    goal_value: 0,
    goal_start_time: '08:00',
    goal_end_time: '22:00',
    goal_time_interval: 60,
    goal_unit: 5,
  };

  var Settings$4 = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-page',{class:("vitals-element-settings-page vitals-" + (_vm.vitalsElement) + "-settings-page"),attrs:{"id":"vitals_element__settings"}},[_c('f7-navbar',[_c('tommy-nav-back'),_vm._v(" "),_c('f7-nav-title',[_vm._v(_vm._s(_vm.t('title')))])],1),_vm._v(" "),_c('div',{class:("vitals-element-settings-header vitals-" + (_vm.vitalsElement) + "-settings-header")},[_c('div',{class:("vitals-element-settings-icon vitals-" + (_vm.vitalsElement) + "-settings-icon")}),_vm._v(" "),_c('div',{class:("vitals-element-settings-center-icon vitals-" + (_vm.vitalsElement) + "-settings-center-icon")})]),_vm._v(" "),_c('div',{class:("vitals-element-settings-text vitals-" + (_vm.vitalsElement) + "-settings-text")},[_c('p',[_vm._v(_vm._s(_vm.t('vital_text')))])]),_vm._v(" "),_c('f7-list',{staticClass:"no-hairlines"},[_c('f7-list-item',{attrs:{"title":_vm.t('chat_label')}},[_c('f7-toggle',{attrs:{"slot":"after","checked":_vm.settings.receiveMessage},on:{"toggle:change":_vm.onMessagesChanges},slot:"after"})],1),_vm._v(" "),_c('f7-list-item',{attrs:{"title":_vm.t('plan_label'),"link":"/vitals_water_tracker/plan/","after":_vm.settings.goal_value ? ("" + (_vm.settings.goal_value) + (_vm.t(("vital_unit." + (_vm.settings.goal_unit))))): '',"route-props":{ settings: _vm.settings }}})],1)],1)},staticRenderFns: [],
    props: {
      vitalsElement: String,
    },
    data: function data() {
      return {
        settings: settings$4,
      };
    },
    mounted: function mounted() {
      var self = this;
      API$5.getSettings(self.vitalsElement).then(function (res) {
        if (!res) { return; }
        self.settings = res;
        settings$4 = self.settings;
      });
      self.$events.$on(((self.vitalsElement) + ":updateGoal"), self.updateGoal);
    },
    beforeDestroy: function beforeDestroy() {
      var self = this;
      self.$events.$off(((self.vitalsElement) + ":updateGoal"), self.updateGoal);
    },
    methods: {
      t: function t(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".settings." + v), d);
      },
      updateGoal: function updateGoal(g) {
        var self = this;
        self.settings.goal_value = g.value;
        self.settings.goal_start_time = g.start_time;
        self.settings.goal_end_time = g.end_time;
        self.settings.goal_time_interval = g.time_interval;
        self.settings.goal_unit = g.unit;
        settings$4 = self.settings;
        API$5.saveSettings(self.vitalsElement, self.settings);
      },
      onMessagesChanges: function onMessagesChanges(checked) {
        var self = this;
        self.settings.receiveMessage = checked;
        settings$4 = self.settings;
        API$5.saveSettings(self.vitalsElement, self.settings);
      },
    },
  };

  var History$4 = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-page',{class:("vitals-element-history-page vitals-" + (_vm.vitalsElement) + "-history-page"),attrs:{"id":"vitals_element__history"}},[_c('f7-navbar',[_c('tommy-nav-back'),_vm._v(" "),_c('f7-nav-title',[_vm._v(_vm._s(_vm.t('title')))])],1),_vm._v(" "),_c('f7-block',[_c('f7-segmented',[_c('f7-button',{attrs:{"active":_vm.range === 'day'},on:{"click":function($event){_vm.range = 'day';}}},[_vm._v(_vm._s(_vm.t('date_options.0')))]),_vm._v(" "),_c('f7-button',{attrs:{"active":_vm.range === 'week'},on:{"click":function($event){_vm.range = 'week';}}},[_vm._v(_vm._s(_vm.t('date_options.1')))]),_vm._v(" "),_c('f7-button',{attrs:{"active":_vm.range === 'month'},on:{"click":function($event){_vm.range = 'month';}}},[_vm._v(_vm._s(_vm.t('date_options.2')))])],1)],1),_vm._v(" "),_c('div',{class:("vitals-element-chart-clicked vitals-" + (_vm.vitalsElement) + "-chart-clicked")},[_c('span',[_vm._v(_vm._s(_vm.clickedDate))]),_vm._v(" "),_c('span',[_vm._v(_vm._s(_vm.clickedValue))])]),_vm._v(" "),(_vm.data && _vm.data.length)?[(_vm.range === 'day')?_c('div',{key:"chart-day",class:("vitals-element-chart vitals-" + (_vm.vitalsElement) + "-chart")},[_c('div',{ref:"chartDay"})]):_vm._e(),_vm._v(" "),(_vm.range === 'week')?_c('div',{key:"chart-week",class:("vitals-element-chart vitals-" + (_vm.vitalsElement) + "-chart")},[_c('div',{ref:"chartWeek"})]):_vm._e(),_vm._v(" "),(_vm.range === 'month')?_c('div',{key:"chart-month",class:("vitals-element-chart vitals-" + (_vm.vitalsElement) + "-chart")},[_c('div',{ref:"chartMonth"})]):_vm._e()]:_vm._e()],2)},staticRenderFns: [],
    props: {
      vitalsElement: String,
      goalValue: Number,
    },
    data: function data() {
      return {
        data: null,
        clicked: null,
        range: 'day',
      };
    },
    mounted: function mounted() {
      var self = this;
      var dateFrom = new Date().setMonth(new Date().getMonth() - 1);
      var dateTo = new Date();
      API$5.getRecords(self.vitalsElement, self.$root.user, { dateFrom: dateFrom, dateTo: dateTo }).then(function (data) {
        self.data = (data || []).sort(function (a, b) {
          var aDate = self.itemDate(a);
          var bDate = self.itemDate(b);

          return aDate.getTime() - bDate.getTime();
        });
        self.$nextTick(function () {
          self.initChart();
        });
      });
    },
    watch: {
      range: function range() {
        var self = this;
        self.clicked = null;
        self.$nextTick(function () {
          self.initChart();
        });
      },
    },
    computed: {
      clickedDate: function clickedDate() {
        var self = this;
        if (!self.clicked) { return ''; }
        return self.$moment(self.clicked.x).format('DD MMM YYYY');
      },
      clickedValue: function clickedValue() {
        var self = this;
        if (!self.clicked) { return ''; }
        var originalItem = self.data[self.clicked.id];
        return ((self.clicked.y) + " " + (self.t(("vital_unit." + (originalItem.data.unit)))));
      },
      todayValues: function todayValues() {
        var self = this;
        if (!self.data) { return null; }
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        var values = self.data
          .filter(function (el) {
            var d = self.itemDate(el);
            if (d.getTime() > today.getTime()) { return true; }
            return false;
          });
        return self.sumValuesByDay(values);
      },
      weekValues: function weekValues() {
        var self = this;
        if (!self.data) { return null; }
        var weekStart = new Date();
        weekStart.setHours(0, 0, 0, 0);
        weekStart.setMonth(weekStart.getMonth(), weekStart.getDate() - 7);

        var values = self.data
          .filter(function (el) {
            var d = self.itemDate(el);
            if (d.getTime() > weekStart.getTime()) { return true; }
            return false;
          });
        return self.sumValuesByDay(values);
      },
      monthValues: function monthValues() {
        var self = this;
        if (!self.data) { return null; }
        var monthStart = new Date();
        monthStart.setHours(0, 0, 0, 0);
        monthStart.setMonth(monthStart.getMonth() - 1, monthStart.getDate());
        var values = self.data
          .filter(function (el) {
            var d = self.itemDate(el);
            if (d.getTime() > monthStart.getTime()) { return true; }
            return false;
          });
        return self.sumValuesByDay(values);
      },
    },
    methods: {
      sumValuesByDay: function sumValuesByDay(values) {
        var self = this;
        var newValues = [];
        var currentDate = self.itemDate(values[0]);
        currentDate.setHours(0, 0, 0, 0);
        var newIndex = 0;
        values.forEach(function (el) {
          var elDate = self.itemDate(el);
          elDate.setHours(0, 0, 0, 0);
          if (elDate.getTime() !== currentDate.getTime()) {
            newIndex += 1;
            currentDate = elDate;
          }
          if (!newValues[newIndex]) {
            newValues[newIndex] = {
              x: currentDate,
              y: 0,
              id: self.data.indexOf(el),
            };
          }
          newValues[newIndex].y += parseInt(el.data.value, 10);
        });
        return newValues;
      },
      itemDate: function itemDate(item) {
        var d = new Date(item.data.date);
        var hours = parseInt(item.data.time.split(':')[0], 10);
        var mins = parseInt(item.data.time.split(':')[1], 10);
        d.setHours(hours, mins);
        return d;
      },
      t: function t(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".history." + v), d);
      },
      initChart: function initChart() {
        var self = this;
        var range = self.range;
        if (!self.data || !self.data.length) { return; }
        var common = {
          chart: {
            type: 'column',
          },
          credits: {
            enabled: false,
          },
          legend: {
            enabled: false,
          },
          title: null,
          tooltip: {
            enabled: false,
          },
          xAxis: {
            type: 'datetime',
          },
          yAxis: Object.assign({}, {title: null},
            (self.goalValue ? {
              plotLines: [{
                color: '#71A7E7',
                width: 2,
                value: self.goalValue,
              }],
            } : {})),
          time: {
            timezoneOffset: new Date().getTimezoneOffset(),
          },
        };
        var seriesCommon = {
          color: '#71A7E7',
          cursor: 'pointer',
          point: {
            events: {
              click: function click() {
                self.clicked = this;
              },
              select: function select() {
                self.clicked = this;
              },
            },
          },
        };
        if (range === 'day') {
          self.$highcharts.chart(self.$refs.chartDay, Object.assign({}, common,
            {series: [
              Object.assign({}, seriesCommon,
                {data: self.todayValues}) ]}));
        }
        if (range === 'week') {
          self.$highcharts.chart(self.$refs.chartWeek, Object.assign({}, common,
            {series: [Object.assign({}, seriesCommon,
              {data: self.weekValues})]}));
        }
        if (range === 'month') {
          self.$highcharts.chart(self.$refs.chartMonth, Object.assign({}, common,
            {series: [Object.assign({}, seriesCommon,
              {data: self.monthValues})]}));
        }
      },
    },
  };

  var Plan$1 = {render: function(){var _vm=this;var _h=_vm.$createElement;var _c=_vm._self._c||_h;return _c('f7-page',{class:("vitals-" + (_vm.vitalsElement) + "-plan-page")},[_c('f7-navbar',[_c('tommy-nav-back'),_vm._v(" "),_c('f7-nav-title',[_vm._v(_vm._s(_vm.t('title')))]),_vm._v(" "),_c('f7-nav-right',[(_vm.allowSave)?_c('f7-link',{attrs:{"href":"#","icon-only":""},on:{"click":_vm.save}},[_c('i',{staticClass:"icon f7-icons"},[_vm._v("check")])]):_vm._e()],1)],1),_vm._v(" "),_c('f7-list',{staticClass:"no-hairlines"},[_c('f7-list-input',{attrs:{"type":"number","inline-label":"","value":_vm.value,"min":"1","label":_vm.t('vital_label')},on:{"input":function($event){_vm.updateGoalValue('value', parseFloat($event.target.value));}}},[_c('span',{staticClass:"vitals-element-input-unit",attrs:{"slot":"inner"},slot:"inner"},[_vm._v(_vm._s(_vm.t(("vital_unit." + (_vm.unit)))))])])],1),_vm._v(" "),_c('f7-block-title',[_vm._v(_vm._s(_vm.t('reminder_label')))]),_vm._v(" "),_c('f7-list',{staticClass:"no-hairlines"},[_c('f7-list-item',{attrs:{"title":_vm.t('start_label'),"after":_vm.start_time,"link":""},on:{"click":function($event){_vm.openTimePicker('start_time', _vm.t('start_label'));}}}),_vm._v(" "),_c('f7-list-item',{attrs:{"title":_vm.t('end_label'),"after":_vm.end_time,"link":""},on:{"click":function($event){_vm.openTimePicker('end_time', _vm.t('end_label'));}}}),_vm._v(" "),_c('f7-list-item',{attrs:{"title":_vm.t('interval_label'),"after":_vm.formatTimeInterval(_vm.time_interval),"link":""},on:{"click":function($event){_vm.openTimePicker('time_interval', _vm.t('interval_label'));}}})],1)],1)},staticRenderFns: [],
    props: {
      vitalsElement: String,
      settings: Object,
    },
    data: function data() {
      var settings = this.settings;
      return {
        value: settings.goal_value,
        start_time: settings.goal_start_time,
        end_time: settings.goal_end_time,
        time_interval: settings.goal_time_interval,
        unit: settings.goal_unit,
        allowSave: false,
      };
    },
    mounted: function mounted() {},
    methods: {
      t: function t(v, d) {
        return this.$t(("health_vitals." + (this.vitalsElement) + ".drinking_plan." + v), d);
      },
      formatTimeInterval: function formatTimeInterval(v) {
        var hours = Math.floor(v / 60);
        var minutes = v - Math.floor(v / 60) * 60;
        if (hours < 10) { hours = "0" + hours; }
        if (minutes < 10) { minutes = "0" + minutes; }
        return (hours + ":" + minutes);
      },
      updateGoalValue: function updateGoalValue(key, value) {
        var self = this;
        self[key] = value;
        self.allowSave = true;
      },
      openTimePicker: function openTimePicker(key, label) {
        var self = this;
        var value = self[key];
        var toNumber = false;
        if (typeof value === 'number') {
          toNumber = true;
          value = self.formatTimeInterval(value);
        }
        var picker;
        self.$f7.dialog.create({
          title: label,
          text: '<div class="vitals-water_tracker-dialog-time-picker"></div>',
          buttons: [
            {
              text: self.$t('label.ok'),
              bold: true,
              color: 'red',
              onClick: function onClick() {
                var finalValue = (picker.value[0]) + ":" + (picker.value[1]);
                if (toNumber) {
                  finalValue = picker.value[0] * 60 + parseInt(picker.value[1], 10);
                }
                self.updateGoalValue(key, finalValue);
              },
            } ],
          on: {
            open: function open() {
              picker = self.$f7.picker.create({
                toolbar: false,
                value: [value.split(':')[0], value.split(':')[1]],
                containerEl: '.vitals-water_tracker-dialog-time-picker',
                cols: [
                  {
                    values: (function () {
                      var v = [];
                      for (var i = 0; i < 24; i += 1) {
                        if (i < 10) { v.push(("0" + i)); }
                        else { v.push(i.toString()); }
                      }
                      return v;
                    })(),
                  },
                  {
                    divider: true,
                    content: ':',
                  },
                  {
                    values: (function () {
                      var v = [];
                      for (var i = 0; i < 60; i += 1) {
                        if (i < 10) { v.push(("0" + i)); }
                        else { v.push(i.toString()); }
                      }
                      return v;
                    })(),
                  } ],
              });
            },
            close: function close() {
              picker.destroy();
            },
          },
        }).open();
      },
      save: function save() {
        var self = this;
        self.$events.$emit(((self.vitalsElement) + ":updateGoal"), {
          value: self.value,
          start_time: self.start_time,
          end_time: self.end_time,
          time_interval: self.time_interval,
          unit: self.unit,
        });
        self.$f7router.back();
      },
    },
  };

  var routes$8 = [
    {
      path: '/health_vitals/water_tracker/',
      component: Index$5,
    },
    {
      path: '/health_vitals/water_tracker/add/',
      component: Add$4,
    },
    {
      path: '/health_vitals/water_tracker/settings/',
      component: Settings$4,
    },
    {
      path: '/health_vitals/water_tracker/history/',
      component: History$4,
    },
    {
      path: '/health_vitals/water_tracker/plan/',
      component: Plan$1,
    } ];
  routes$8.forEach(function (r) {
    r.options = {
      props: {
        vitalsElement: 'water_tracker',
      },
    };
  });

  var routes$9 = [
    {
      path: '/health_vitals/weight/',
      component: Index$1,
    },
    {
      path: '/health_vitals/weight/add/',
      component: Add,
    },
    {
      path: '/health_vitals/weight/settings/',
      component: Settings,
    },
    {
      path: '/health_vitals/weight/history/',
      component: History,
    } ];
  routes$9.forEach(function (r) {
    r.options = {
      props: {
        vitalsElement: 'weight',
      },
    };
  });

  var routes$a = [
    {
      path: '/health_vitals/',
      component: Index,
    },
    {
      path: '/health_vitals/panel/',
      panel: {
        component: RightPanel,
      },
    } ].concat( routes,
    routes$1,
    routes$2,
    routes$3,
    routes$4,
    routes$5,
    routes$6,
    routes$7,
    routes$8,
    routes$9 );

  return routes$a;

}());
