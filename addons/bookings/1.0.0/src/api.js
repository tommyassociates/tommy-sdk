const { api } = window.tommy

const API = {
  getWorkforceShifts(params = {}, options = {}) {
    return api.getWorkforceShifts(Object.assign({}))
  },
  getWorkforceShift(id = undefined, params = {}, options = {}) {
    return api.getWorkforceShift(Object.assign({}))
  },
}

export default API
