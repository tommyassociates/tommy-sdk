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
  completeLesson(userId, lessonId) {
    const fragment = API.fragment;
    fragment.data.completed_lessons[lessonId] = {
      completed_at: new Date().toJSON(),
    };
    if (!fragment.id) {
      // NEW
      Object.assign(fragment, {
        addon: 'education',
        kind: 'EducationData',
        with_filters: true,
        with_permission_to: true,
        actor_id: API.actorId,
        user_id: API.actorId || userId,
      });
      return api.createFragment(fragment);
    }
    return api.updateFragment(fragment.id, fragment);
  },
};
export default API;
