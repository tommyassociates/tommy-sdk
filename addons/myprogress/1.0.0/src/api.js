const tommy = window.tommy;
const api = tommy.api;

const API = {
  getData(userId) {
    return api.getFragments({
      addon: 'myprogress',
      kind: 'Myprogress',
      with_filters: true,
      with_permission_to: true,
      actor_id: userId,
      user_id: userId,
    });
  },
  saveData(userId, f) {
    if (f.id) {
      return api.updateFragment(f.id, f, {
        dataType: 'json',
        contentType: 'application/json',
        processData: false,
      });
    }

    return api.createFragment({
      addon: 'myprogress',
      kind: 'Myprogress',
      with_filters: true,
      with_permission_to: true,
      data: f.data,
      actor_id: userId,
      user_id: userId,
    }, {
      dataType: 'json',
      contentType: 'application/json',
      processData: false,
    });
  },
};
export default API;
