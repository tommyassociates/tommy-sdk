const { api } = window.tommy

const API = {
  getEvents() {
    return api
      .call({
        endpoint: 'events',
        method: 'GET',
      })
      .then(data => {
        return data
      })
  },
  getEvent(id) {
    return api
      .call({
        endpoint: 'events'+id,
        method: 'GET',
      })
      .then(data => {
        return data
      })
  },
}

export default API
