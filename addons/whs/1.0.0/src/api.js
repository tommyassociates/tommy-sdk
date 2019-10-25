const tommy = window.tommy;
const api = tommy.api;

const mainListLimit = 12;


const API = {    
    getMainListItem(){
        return api.call({
            endpoint: 'inventory/items',
            method: 'GET',
            cache: false,
          }).then((data) => {
            return data;
          });
    },
    getMainListLocations(){
      return api.call({
          endpoint: 'inventory/locations',
          method: 'GET',
        }).then((data) => {
          return data;
        });
    },
    getMainListActivities(){
      return api.call({
          endpoint: 'inventory/activities',
          method: 'GET',
        }).then((data) => {
          return data;
        });
    },
    getMainListTags(){
      return api.call({
          endpoint: 'inventory/tags',
          method: 'GET',
          //per: mainListLimit,
         // page: 1,
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
    createLocation(data) {
        return api.call({
          endpoint: `inventory/locations`,
          method: 'POST',
          data,
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
    removeEmpty(obj){
      Object.keys(obj).forEach((key) =>{
        (obj[key] && typeof obj[key] === 'object') && removeEmpty(obj[key]) ||
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
window.deleteTag = API.deleteTag;

export default API;
