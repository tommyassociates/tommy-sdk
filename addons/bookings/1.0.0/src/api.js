const tommy = window.tommy
const api = tommy.api

const API = {
  getShiftIndex() {
    return api
      .call({
        endpoint: "workforce/shifts",
        method: "GET",
        cache: false,
      })
      .then(data => {
        return data;
      });
  },
  gethiftDetail(id) {
    return api
    .call({
      endpoint: "workforce/shifts/"+id,
      method: "GET",
      cache: false,
    })
    .then(data => {
      return data;
    });
  },
}

export default API
