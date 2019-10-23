const tommy = window.tommy;
const api = tommy.api;

const API = {
    getMainListItem(){
        return api.call({
            endpoint: 'inventory/items',
            method: 'GET',
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

export default API;
