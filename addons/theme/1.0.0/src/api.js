const tommy = window.tommy;
const api = tommy.api;

const API = {
  deleteIconImage() {
    const data = {
      icon_url: '',
    };
    return api
      .call({
        endpoint: 'team',
        method: 'PUT',
        data: data,
      });
  },

  deleteBackground() {
    const data = {
      background_url: '',
    };
    return api
      .call({
        endpoint: 'team',
        method: 'PUT',
        data: data,
      });
  }
};

export default API;
