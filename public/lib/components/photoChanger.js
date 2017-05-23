define(['app','util','config','api'], //'views/module'/*,'i18n!nls/lang'*/,'tplManager'
function (app,util,config,api) { //VM/*,i18n*/TM
    var fileSelector;

    var photoChanger = {
        init: function (settings) {
            if (!settings.url) {
                throw "'url' endpoint param must be provided";
            }

            this.settings = settings;
        },

        openMenu: function () {
            var self = this;

            var buttons1 = [
                {
                    text: 'Edit Picture',
                    label: true
                }, {
                    text: 'Take Photo',
                    bold: true,
                    onClick: photoChanger.capturePhotoEdit //.bind(self)
                }, {
                    text: 'Choose from Library',
                    onClick: photoChanger.uploadPhotoAlbum //.bind(self)
                }
            ];

             var buttons2 = [{
                 text: 'Cancel',
                 color: 'red'
             }];

             var groups = [buttons1, buttons2];
             window.tommy.app.actions(groups);
        },

        capturePhotoEdit: function () {
            if (util.isPhonegap()) {

                // Take picture using device camera, allow edit, and retrieve
                // image as base64-encoded string.
                navigator.camera.getPicture(photoChanger.onPhotoDataSuccess, photoChanger.onPhotoFail, {
                    quality: 20,
                    allowEdit: true,
                    destinationType: navigator.camera.DestinationType.DATA_URL,
                    encodingType: 0
                });
            }
            else {
                photoChanger.selectImageFromFilesystem();
            }
        },

        uploadPhotoAlbum: function () {
            if (util.isPhonegap()) {

                // Take picture using device camera, allow edit, and retrieve
                // image as base64-encoded string.
                navigator.camera.getPicture(photoChanger.onPhotoDataSuccess, photoChanger.onPhotoFail, {
                    quality: 20,
                    allowEdit: true,
                    destinationType: navigator.camera.DestinationType.DATA_URL,
                    sourceType: navigator.camera.PictureSourceType.PHOTOLIBRARY,
                    encodingType: 0
                });
            }
            else {
                photoChanger.selectImageFromFilesystem();
            }
        },

        selectImageFromFilesystem: function () {
            fileSelector = document.createElement('input');
            fileSelector.setAttribute('type', 'file');
            fileSelector.click();
            fileSelector.onchange = function () {
                photoChanger.upload(fileSelector.files[0]);
            };
        },

        onPhotoDataSuccess: function (imageURI) {
            function dataURLToBlob(dataURL) {
                var BASE64_MARKER = ';base64,';
                if (dataURL.indexOf(BASE64_MARKER) == -1) {
                    var parts = dataURL.split(',');
                    var contentType = parts[0].split(':')[1];
                    var raw = decodeURIComponent(parts[1]);

                    return new Blob([raw], {type: contentType});
                }
                var parts = dataURL.split(BASE64_MARKER);
                var contentType = parts[0].split(':')[1];
                var raw = window.atob(parts[1]);
                var rawLength = raw.length;
                var dataArray = new Uint8Array(rawLength);

                for (var i = 0; i < rawLength; ++i) {
                    dataArray[i] = raw.charCodeAt(i);
                }

                return new Blob([dataArray], {type: contentType});
            }

            var base64str = 'data:image/jpg;base64,' + imageURI;
            var selfie = dataURLToBlob(base64str);

            photoChanger.upload(selfie);
        },

        onPhotoFail: function (message) {
            window.tommy.app.alert('Error getting image from device: ' + message);

            if (photoChanger.settings.error)
                photoChanger.settings.error();
        },

        upload: function (photo) {
            var form = new FormData();
            form.append('photo', photo, 'profilephoto.jpg');

            api.call({
                endpoint: photoChanger.settings.url,
                method: 'PUT',
                data: form
            }).then(function (response) {
                console.log('photoChanger', 'upload success', response);
                if (response.icon_url) {
                    config.setCurrentAvatar(response.icon_url);
                    app.renderCurrentAvatar();
                }

                if (photoChanger.settings.success)
                    photoChanger.settings.success(response);
            }).catch(photoChanger.settings.error);
        }
    };

    return photoChanger;
});
