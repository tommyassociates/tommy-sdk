const api = window.tommy.api;

const API = {
  getWaterTracker(user) {
    return api.getFragments({
      addon: 'vitals_water_tracker',
      kind: 'VitalsWaterTrackerItem',
      with_filters: true,
      with_permission_to: true,
      user_id: user.id,
      page: 1,
      limit: 1,
      per: 1,
    }, {
      cache: false,
    });
  },
  getTemperature(user) {
    return api.getFragments({
      addon: 'vitals_temperature',
      kind: 'VitalsTemperatureItem',
      with_filters: true,
      with_permission_to: true,
      user_id: user.id,
      page: 1,
      limit: 1,
      per: 1,
    }, {
      cache: false,
    });
  },
  getPedometer(user) {
    return api.getFragments({
      addon: 'vitals_pedometer',
      kind: 'VitalsPedometerItem',
      with_filters: true,
      with_permission_to: true,
      user_id: user.id,
      page: 1,
      limit: 1,
      per: 1,
    }, {
      cache: false,
    });
  },
  getHeight(user) {
    return api.getFragments({
      addon: 'vitals_height',
      kind: 'VitalsHeightItem',
      with_filters: true,
      with_permission_to: true,
      user_id: user.id,
      page: 1,
      limit: 1,
      per: 1,
    }, {
      cache: false,
    });
  },
  getWeight(user) {
    return api.getFragments({
      addon: 'vitals_weight',
      kind: 'VitalsWeightItem',
      with_filters: true,
      with_permission_to: true,
      user_id: user.id,
      page: 1,
      limit: 1,
      per: 1,
    }, {
      cache: false,
    });
  },
  getHeartRate(user) {
    return api.getFragments({
      addon: 'vitals_heart_rate',
      kind: 'VitalsHeartRateItem',
      with_filters: true,
      with_permission_to: true,
      user_id: user.id,
      page: 1,
      limit: 1,
      per: 1,
    }, {
      cache: false,
    });
  },
  getBloodPressure(user) {
    return api.getFragments({
      addon: 'vitals_blood_pressure',
      kind: 'VitalsBloodPressureItem',
      with_filters: true,
      with_permission_to: true,
      user_id: user.id,
      page: 1,
      limit: 1,
      per: 1,
    }, {
      cache: false,
    });
  },
  getBloodGlucose(user) {
    return api.getFragments({
      addon: 'vitals_blood_glucose',
      kind: 'VitalsBloodGlucoseItem',
      with_filters: true,
      with_permission_to: true,
      user_id: user.id,
      page: 1,
      limit: 1,
      per: 1,
    }, {
      cache: false,
    });
  },
  getMedicationReminder(user) {
    return new Promise((resolve, reject) => {
      const medicationsRequest = api.getFragments({
        addon: 'vitals_medication_reminder',
        kind: 'VitalsMedicationReminderMedication',
        with_filters: true,
        with_permission_to: true,
        user_id: user.id,
      }, {
        cache: false,
      });
      const takenRequest = api.getFragments({
        addon: 'vitals_medication_reminder',
        kind: 'VitalsMedicationReminderTaken',
        with_filters: true,
        with_permission_to: true,
        user_id: user.id,
      }, {
        cache: false,
      });
      Promise.all([medicationsRequest, takenRequest]).then(([medications, takenData]) => {
        const data = {};
        medications.forEach((medication) => {
          const startDate = new Date(medication.data.startDate);
          if (startDate.getTime() > new Date().getTime()) return;
          let endDate = new Date(medication.data.endDate);
          if (endDate.getTime() > new Date().getTime()) {
            endDate = new Date();
            endDate.setHours(0, 0, 0, 0);
          }
          const days = (endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000) + 1;
          for (let i = 0; i < days; i += 1) {
            const d = new Date(startDate).getTime() + i * (24 * 60 * 60 * 1000);
            const formatted = new Date(d).toJSON();
            if (!data[formatted]) data[formatted] = [];
            data[formatted].push(...medication.data.dosage.map(dose => ({
              id: medication.id,
              name: medication.data.name,
              time: dose.time,
            })));
          }
        });
        Object.keys(data).forEach((key) => {
          const dayData = data[key];
          dayData.sort((a, b) => {
            const aTime = parseInt(a.time.split(':')[0], 10) * 60 + parseInt(a.time.split(':')[1], 10);
            const bTime = parseInt(b.time.split(':')[0], 10) * 60 + parseInt(b.time.split(':')[1], 10);
            if (aTime < bTime) return -1;
            return 1;
          });
        });
        const sortedKeys = Object.keys(data).sort((a, b) => {
          const aDate = new Date(a).getTime();
          const bDate = new Date(b).getTime();
          if (aDate < bDate) return -1;
          return 1;
        });

        const lastDate = sortedKeys[sortedKeys.length - 1];
        const lastData = data[lastDate];
        const takenItems = lastData.filter((item) => {
          let taken;
          const todayDate = new Date(lastDate);
          todayDate.setHours(0, 0, 0, 0);
          takenData.forEach((takenItem) => {
            if (taken) return;
            const takenDate = new Date(takenItem.data.date || takenItem.start_at);
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

export default API;
