const { api } = window.tommy

const API = {
  getShifts() {
    return api
      .call({
        endpoint: 'workforce/shifts',
        method: 'GET',
      })
      .then(data => {
        return data
      })
  },
  getShift(id) {
    return api
      .call({
        endpoint: 'workforce/shifts'+id,
        method: 'GET',
      })
      .then(data => {
        return data
      })
  },
}

export default API
