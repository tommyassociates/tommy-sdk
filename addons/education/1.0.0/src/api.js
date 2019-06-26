const tommy = window.tommy;
const api = tommy.api;

const API = {
  actorId: undefined,
  fragment: null,
  getData(userId) {
    const data = {
      addon: 'education',
      kind: 'EducationData',
      with_filters: true,
      with_permission_to: true,
      actor_id: API.actorId,
      user_id: API.actorId || userId,
    };
    return api.getFragments(data);
  },
};
export default API;
