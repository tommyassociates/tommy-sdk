const tommy = window.tommy;
const api = tommy.api;

const API = {
  getAddons(id) {
    return api.getAddons();
  },

  uninstallAddon(pkg) {
    return api.uninstallAddon(pkg);
  },

  installAddon(pkg, data) {
    return api.installAddon(pkg, data);
  },
};

export default API;
