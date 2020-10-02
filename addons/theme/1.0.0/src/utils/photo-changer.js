import { i18n, api } from 'tommy-core/src/tommy'; // '../tommy/tommy';

let fileSelector;
const photoChanger = {
  settings: {},
  init(settings) {
    if (!settings.url) {
      throw new Error('"url" endpoint param must be provided');
    }
    if (!settings.filename) {
      settings.filename = 'profilephoto.jpg'
    }
    if (!settings.param) {
      settings.param = 'photo'
    }
    if (settings.f7) photoChanger.f7 = settings.f7;
    photoChanger.settings = settings;
  },

  openMenu() {
    const buttons1 = [
      {
        text: i18n.t('account.photochange_edit_picture'),
        label: true,
      }, {
        text: i18n.t('account.photochange_take_photo'),
        bold: true,
        onClick: photoChanger.capturePhotoEdit,
      }, {
        text: i18n.t('account.photochange_choose_library'),
        onClick: photoChanger.uploadPhotoAlbum,
      },
    ];

    const buttons2 = [{
      text: i18n.t('label.cancel'),
      color: 'red',
    }];

    const groups = [buttons1, buttons2];
    photoChanger.f7.actions
      .create({ buttons: groups })
      .open();
  },

  capturePhotoEdit() {
    if (window.cordova) {
      // Take picture using device camera, allow edit, and retrieve
      // image as base64-encoded string.
      navigator.camera.getPicture(photoChanger.onPhotoDataSuccess, photoChanger.onPhotoFail, {
        quality: 20,
        allowEdit: true,
        destinationType: navigator.camera.DestinationType.DATA_URL,
        encodingType: 0,
      });
    } else {
      photoChanger.selectImageFromFilesystem();
    }
  },

  uploadPhotoAlbum() {
    if (window.cordova) {
      // Take picture using device camera, allow edit, and retrieve
      // image as base64-encoded string.
      navigator.camera.getPicture(photoChanger.onPhotoDataSuccess, photoChanger.onPhotoFail, {
        quality: 20,
        allowEdit: true,
        destinationType: navigator.camera.DestinationType.DATA_URL,
        sourceType: navigator.camera.PictureSourceType.PHOTOLIBRARY,
        encodingType: 0,
      });
    } else {
      photoChanger.selectImageFromFilesystem();
    }
  },

  selectImageFromFilesystem() {
    fileSelector = document.createElement('input');
    fileSelector.setAttribute('type', 'file');
    fileSelector.click();
    fileSelector.onchange = function onchange() {
      photoChanger.upload(fileSelector.files[0]);
    };
  },

  onPhotoDataSuccess(imageURI) {
    function dataURLToBlob(dataURL) {
      const BASE64_MARKER = ';base64,';
      if (dataURL.indexOf(BASE64_MARKER) === -1) {
        const parts = dataURL.split(',');
        const contentType = parts[0].split(':')[1];
        const raw = decodeURIComponent(parts[1]);
        return new Blob([raw], { type: contentType });
      }
      const parts = dataURL.split(BASE64_MARKER);
      const contentType = parts[0].split(':')[1];
      const raw = window.atob(parts[1]);
      const rawLength = raw.length;
      const dataArray = new Uint8Array(rawLength);

      for (let i = 0; i < rawLength; i += 1) {
        dataArray[i] = raw.charCodeAt(i);
      }

      return new Blob([dataArray], { type: contentType });
    }

    const base64str = `data:image/jpg;base64,${imageURI}`;
    const selfie = dataURLToBlob(base64str);

    photoChanger.upload(selfie);
  },

  onPhotoFail(message) {
    photoChanger.f7.preloader.hide();
    photoChanger.f7.dialog.alert(i18n.t('account.photochange_error_getting_image') + message);

    if (photoChanger.settings.error) { photoChanger.settings.error(); }
  },

  upload(blob) {
    photoChanger.f7.preloader.show();
    const form = new FormData();
    form.append(photoChanger.settings.param, blob, photoChanger.settings.filename);
    api
      .call({
        endpoint: photoChanger.settings.url,
        method: 'PUT',
        data: form,
      })
      .then((response) => {
        photoChanger.f7.preloader.hide();
        // log('photoChanger', 'upload success', response);
        if (photoChanger.settings.success) {
          photoChanger.settings.success(response);
        }
      })
      .catch((error) => {
        photoChanger.f7.preloader.hide();
        if (photoChanger.settings.error) {
          photoChanger.settings.error(error);
        }
      });
  },
};

export default photoChanger;
