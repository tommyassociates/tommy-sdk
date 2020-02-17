const { api } = window.tommy

const API = {
  getWorkforceShifts(params = {}, options = {}) {
    return api.getEvents(Object.assign({}))
  },
  getWorkforceShift(id = undefined, params = {}, options = {}) {
    return api.getEvents(Object.assign({}))
  },
}

export default API
