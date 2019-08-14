const tommy = window.tommy;
const api = tommy.api;

const API = {
  actor: undefined,
  actorId: undefined,

  sendMessage(msg) {
    const api_key = 'U4ruDrK3nhlbpi50npIArQtt';
    const params = {
      message: msg,
    };
    return api.sendBroadcast(api_key, params);
  },
};

export default API;
