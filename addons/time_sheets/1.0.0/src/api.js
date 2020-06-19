const tommy = window.tommy;
const api = tommy.api;

const API = {
  actorId: undefined,
  actor: undefined,
  shifts_active_id: undefined,
  attendances_active_id: undefined,
  getTest(data = null, cache = true) {
    return api
      .call({
        //endpoint: "workforce/timesheets",
        //endpoint: "workforce/shifts/active",
        //endpoint: "workforce/attendances/active",
        endpoint: "workforce/attendances/active",
        method: "GET",
        cache: cache,
        data
      })
      .then(data => {
        return data;
      });
  },/*
  postTestEvent(data = null, cache = true) {
    let date = new Date();
    date.setHours(date.getHours() - 1);
    let date7 = new Date();
    date7.setDate(date7.getDate() + 7);

    data = {
      actorId: 3,
      team_id: 1,
      title: "Test event",
      location: "Test location",
      start_at: date.toISOString(),
      end_at: date7.toISOString(),
      reminder: null,
      details: null,
      color: null,
      duration: 54000,
      resource_id: 123,
      resource_type: "VendorOrder",
      assignee_id: 3,
      assignee_team_id: null,
      addon_install_id: null,
      created_at: date.toISOString(),
      updated_at: date.toISOString(),
    }
    return api
      .call({
        //endpoint: "workforce/timesheets",
        //endpoint: "workforce/shifts/active",
        //endpoint: "workforce/attendances/active",
        endpoint: "workforce/shifts",
        method: "POST",
        cache: false,
        data
      })
      .then(data => {
        return data;
      });
  },*/


  getTimesheets(cache = false) {
    return api
      .call({
        endpoint: "workforce/timesheets",
        method: "GET",
        cache,
      })
      .then(data => {
        return data;
      });
  },

  getTimesheetsShifts(cache = false) {
    return api
      .call({
        endpoint: `workforce/timesheet_items`,
        method: "GET",
        cache,
      })
      .then(data => {
        return data;
      });
  },

  createTimesheet(data) {
    console.log('createTimesheet', data);
    return api
      .call({
        endpoint: `workforce/timesheets`,
        method: "POST",
        data,
      })
      .then(data => {
        return data;
      });
  },

  updateTimesheet(id, data) {
    const endpoint = `workforce/timesheets/${id}`;
    return api
      .call({
        endpoint,
        method: "PUT",
        data,
      });
  },

  deleteTimesheet(id, isManager = false) {
    const endpoint = `workforce/${isManager ? 'manager/' : ''}timesheets/${id}`;
    console.log('deleteTimesheet', endpoint);
    return api
      .call({
        endpoint,
        method: "DELETE",
      })
      .then(data => {
        return data;
      });
  },

  updateTimesheetShift(id, data) {
    const endpoint = `workforce/timesheet_items/${id}`;
    return api
      .call({
        endpoint,
        method: "PUT",
        data,
      });
  },

  deleteTimesheetShift(id) {
    return api
      .call({
        endpoint: `workforce/timesheet_items/${id}`,
        method: "DELETE",
      })
      .then(data => {
        console.log('deleteTimesheetShift', data);
        return data;
      });
  },

  createTimesheetShift(data) {
    console.log('createTimesheetShift', data);
    return api
      .call({
        endpoint: `workforce/timesheet_items`,
        method: "POST",
        data,
      })
      .then(data => {
        return data;
      });
  },

  /**
   * Used for a generic GET api call.
   * @param endpoint
   * @param cache
   * @param otherOptions
   * @returns {Promise<T>}
   */
  call({endpoint = '', cache = false, otherOptions = {}} = {}) {
    if (endpoint === '') {
      console.log(`%c Endpoint is not defined.`, 'color:white;background:red;font-weight:bold');
      return;
    }
    let options = {
      endpoint,
      method: 'GET',
      cache,
    }

    const querystring = Object.keys(otherOptions).map((key) => {
      return (key) + '=' + (otherOptions[key])
    }).join('&');

    if (querystring) options.endpoint = options.endpoint + '?' + querystring;

    return api
      .call(options)
      .then(data => {
        return data;
      });
  },

  getManagerTimesheets({cache = false, otherOptions = {}} = {}) {
    const endpoint = 'workforce/manager/timesheets';
    return this.call({endpoint, cache, otherOptions});
  },

  getManagerTimesheetsShifts({cache = false, otherOptions = {}} = {}) {
    const endpoint = 'workforce/manager/timesheet_items';
    return this.call({endpoint, cache, otherOptions});
  },

  getManagerAttendances({cache = false, otherOptions = {}} = {}) {
    const endpoint = 'workforce/manager/attendances';
    return this.call({endpoint, cache, otherOptions});
  },

  updateManagerTimesheet(id, data) {
    const endpoint = `workforce/manager/timesheets/${id}`;
    return api
      .call({
        endpoint,
        method: "PUT",
        data,
      });
  },

  updateManagerTimesheetsBulk(data) {
    const endpoint = `workforce/manager/timesheets/bulk_update`;
    return api
      .call({
        endpoint,
        method: "PUT",
        data,
      });
  },




  /**
   * Will remove an item from the tommy.cache
   * @param cacheKey
   * @param key
   * @param value
   */
  removeItemFromCache(cacheKey, key, value) {
    return new Promise((resolve, reject) => {
      const cacheData = cache.get('api', cacheKey);console.log(cacheData);
      const data = [...cacheData];
      const filteredData = data.filter(d => +d[key] !== +value);
      cache.set('api', cacheKey, filteredData);
      resolve(filteredData);
    });
  },

  removeItemFromObject(data, key, value) {
    return new Promise((resolve, reject) => {
      const newData = [...data];
      const filteredData = newData.filter(d => +d[key] !== +value);
      resolve(filteredData);
    });
  },




  addonAssetsUrl() {
    return 'addons/time_sheets/versions/1.0.0/files/assets/';
  },


  getShiftActive() {
    return api
      .call({
        endpoint: "workforce/shifts/active",
        method: "GET",
        cache: false,
      })
      .then(data => {
        return data;
      });
  },
  getAttendances(data = null, cache = false, others = false, otherOptions = {}) {
    let options = {
      endpoint: "workforce/attendances",
      method: "GET",
      with_permission_to: true,
      with_filters: true,
      cache: cache,
      data,
    }
    // if (!others) options.endpoint = options.endpoint + '&user_id='+ API.actorId;

    if (!others) {
      otherOptions.user_id = API.actorId;
    }

    const querystring = Object.keys(otherOptions).map((key) => {
      return (key) + '=' + (otherOptions[key])
    }).join('&');

    if (querystring) options.endpoint = options.endpoint + '?' + querystring;

    return api
      .call(options)
      .then(data => {
        return data;
      });
  },
  getAttendancesActive(data = null, cache = false, others = false, otherOptions = {}) {
    let options = {
      endpoint: "workforce/attendances/active",
      method: "GET",
      cache: cache,
      data,
    }

    if (!others) {
      otherOptions.user_id = API.actorId;
    }

    const querystring = Object.keys(otherOptions).map((key) => {
      return (key) + '=' + (otherOptions[key])
    }).join('&');

    if (querystring) options.endpoint = options.endpoint + '?' + querystring;


    return api
      .call(options)
      .then(data => {
        return data;
      });
  },
  getAttendancesDetail(id) {
    return api
      .call({
        endpoint: "workforce/attendances/" + id,
        method: "GET",
        cache: false,
      })
      .then(data => {
        return data;
      });
  },
  editAttendance(id, data) {
    return api
      .call({
        endpoint: "workforce/attendances/" + id,
        method: "PUT",
        cache: false,
        data
      })
      .then(data => {
        return data;
      });
  },
  deleteAttendance(id) {
    return api
      .call({
        endpoint: "workforce/attendances/" + id,
        method: "DELETE",
        cache: false,
      })
      .then(data => {
        return data;
      });
  },
  setAttendances(data) {
    return api
      .call({
        endpoint: "workforce/attendances",
        method: "POST",
        cache: false,
        data,
      })
      .then(data => {
        return data;
      });
  },


  getUserId(self) {
    const userId = self.$f7route.query.actor_id;
    if (userId) {
      return Number(userId);
    } else {
      return Number(self.$root.account.user_id);
    }
  },
  getActor(self) {
    const userId = self.$f7route.query.actor_id;
    if (userId) {
      return self.$root.teamMembers.filter(
        user => user.user_id === parseInt(self.userId, 10)
      )[0];
    } else {
      return self.$root.account;
    }
  },

  // eventsSearch(data) {
  //   //return generateTest(3);
  //
  //   let options = {
  //     endpoint: "workforce/attendances",
  //     method: "GET",
  //     with_permission_to: true,
  //     with_filters: true,
  //     cache: cache,
  //     data,
  //   }
  //   if (!others) options.endpoint = options.endpoint + '?user_id='+ API.actorId;
  //   return api
  //     .call(options)
  //     .then(data => {
  //       return data;
  //     });
  //
  //
  //
  // }

  checkPermision(permission, self) {
    let view = permission.filters.find(e => {
      if (e.context === "members") {
        if (e.user_id === this.actorId) return true;
      } else if (e.context === "roles") {
        if (this.actor.roles.indexOf(e.name) > 0) return true;
      }
    });
    return typeof view !== "undefined";
  },
};


function generateTest(length) {
  const obj = {
    name: "Mason Fok",
    image:
      "data:image/png;base64,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",
    date: "2011-10-05T14:48:00.000Z",
    event: "1",
    latitude: "51.760962",
    longitude: "55.108244"
  };


  const promise = new Promise((resolve, reject) => {
    const test_array = new Array();
    for (let i = 0; i < length; i++) {
      obj.id = Math.floor(Math.random() * 1000);
      test_array.push(obj)
    }
    setTimeout(() => {
      resolve(test_array)
    }, 1000 + Math.random() * 1000)
  })
  return promise;
}

export default API;
