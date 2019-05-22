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
      with_attachments: true,
    });
  },
  saveData(userId, f) {
    if (f.attachments && f.attachments.length) {
      f.attachments = f.attachments.filter(attachment => typeof attachment === 'string');
    }
    if (f.id) {
      f.with_attachments = true;

      return api.updateFragment(f.id, f, {
        dataType: 'json',
        contentType: 'application/json',
        processData: false,
      });
    }

    return api.createFragment({
      with_attachments: true,
      addon: 'myprogress',
      kind: 'Myprogress',
      with_filters: true,
      with_permission_to: true,
      data: f.data,
      attachments: f.attachments,
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
