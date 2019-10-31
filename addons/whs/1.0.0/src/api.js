const tommy = window.tommy;
const api = tommy.api;

const mainListLimit = 12;


const API = {
    main_page: undefined,
    settings: {
      currency: "$"
    }, 
    getItem(data = null){
      let cache = true;
      if (data) cache = false;
        return api.call({
            endpoint: 'inventory/items',
            method: 'GET',
            cache: cache,
            data
          }).then((data) => {
            return data;
          });
    },    
    getItemDetail(id){
      return api.call({
          endpoint: `inventory/items/${id}`,
          method: 'GET',
          data:{
            with_summary: true,
          },          
        }).then((data) => {
          return data;
        });
    },
    getLocations(data = null){
      let cache = true;
      if (data) cache = false;
      return api.call({
          endpoint: 'inventory/locations',
          method: 'GET',
          cache: cache,
          data
        }).then((data) => {
          return data;
        });
    },
    getLocationDetail(id){
      return api.call({
          endpoint: `inventory/locations/${id}`,
          method: 'GET',
          data:{
            with_summary: true,
          },          
        }).then((data) => {
          return data;
        });
    },
    getActivities(data = null){
      let cache = true;
      if (data) cache = false;
      return api.call({
          endpoint: 'inventory/activities',
          method: 'GET',
          cache: cache,
          data
        }).then((data) => {
          return data;
        });
    },
    getTags(data = null){
      let cache = true;
      if (data) cache = false;
      return api.call({
          endpoint: 'inventory/tags',
          method: 'GET',
          cache: cache,
          data
        }).then((data) => {
          return data;
        });
    },
    createItem(data) {
        return api.call({
          endpoint: `inventory/items`,
          method: 'POST',
          data,
          cache: false,
        });
      },
    editItem(data, id) {
        return api.call({
          endpoint: `inventory/items/${id}`,
          method: 'PUT',
          data,
          cache: false,
        });
      },
    deleteItem(id) {
        return api.call({
          endpoint: `inventory/items/${id}`,
          method: 'DELETE',
          cache: false,
        });
      },
    createLocation(data) {
        return api.call({
          endpoint: `inventory/locations`,
          method: 'POST',
          data,
          cache: false,
        });
      },
    editLocation(data, id) {
        return api.call({
          endpoint: `inventory/locations/${id}`,
          method: 'PUT',
          data,
          cache: false,
        });
      },
    deleteLocation(id) {
        return api.call({
          endpoint: `inventory/locations/${id}`,
          method: 'DELETE',
          cache: false,
        });
      },
    createTag(data) {
        return api.call({
          endpoint: `tags`,
          method: 'POST',
          data,
          cache: false,
        });
      },
    deleteTag(id){
      return api.call({
        endpoint: `tags/${id}`,
        method: 'DELETE',
      })
    },
    toast(text){
      const finishToast = self.$f7.toast.create({
        text: text,
        position: 'center',
        closeTimeout: 2000,
      });
      finishToast.open();
    },
    resetCache(key){
      api.resetCache(key);
    },
    removeEmpty(obj){
      Object.keys(obj).forEach((key) =>{
        (obj[key] && typeof obj[key] === 'object') && API.removeEmpty(obj[key]) ||
        (obj[key] === '' || obj[key] === null) && delete obj[key]
      });
      return obj;
    },
    clearObject(obj){
      ///check this
      Object.keys(obj).forEach((key) =>{
        obj[key] = null;
      });
      return obj;
    }
};
///test
//window.deleteTag = API.deleteTag;

export default API;
