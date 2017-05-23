define(['util','api','app'],
function (util,api,app) {

    /*==========================================================================
    ************   Tag Select   ************
    ==========================================================================*/

    var tagSelectComponent = {
        initWidget: function ($tagSelect, savedTags, onChange) {
            api.getCurrentTeamTags({cache: true}).then(function(tagItems) {

                // Populate the tag select
                var $select = $tagSelect.find('select');
                for (var i = 0; i < tagItems.length; i++) {
                    var item = tagItems[i],
                        selected = util.isTagSelected(savedTags, item);
                    $select.append('<option data-type="' + item[0] + '" data-id="' + item[1] + '" ' + (selected ? 'selected' : '') + '>' + item[2] + '</option>');
                }

                tagSelectComponent.init($tagSelect);

                // Handle change events
                $tagSelect.on('change', function() {
                    var data = []; // [ 'User', 1, 'Kam Low' ]];
                    $select.find('option:checked').each(function() {
                        var item = $$(this).dataset();
                        data.push([item.type, item.id, this.value]);
                    });

                    if (onChange)
                        onChange(data);
                });
            });
        },

        init: function (pageContainer) {
            pageContainer = $$(pageContainer);
            var selects;
            if (pageContainer.is('.tag-select')) {
                selects = pageContainer;
            }
            else {
                selects = pageContainer.find('.tag-select');
            }
            if (selects.length === 0) return;

            selects.each(function () {
                var tagSelect = $$(this);

                var $select = tagSelect.find('select');
                if ($select.length === 0) return;
                var select = $select[0];
                if (select.length === 0) return;

                // var valueText = [];
                for (var i = 0; i < select.length; i++) {
                    if (select[i].selected) {
                        tagSelectComponent._onOptionSelected(tagSelect, select, select[i]);
                        // valueText.push(select[i].textContent.trim());
                    }
                }

                // var itemAfter = tagSelect.find('.item-after');
                // if (itemAfter.length === 0) {
                //     tagSelect.find('.item-inner').append('<div class="item-after">' + valueText.join(', ') + '</div>');
                // }
                // else {
                //     var selectedText = itemAfter.text();
                //     if (itemAfter.hasClass('tag-select-value')) {
                //         for (i = 0; i < select.length; i++) {
                //             select[i].selected = select[i].textContent.trim() === selectedText.trim();
                //         }
                //     } else {
                //         itemAfter.text(valueText.join(', '));
                //     }
                // }

                tagSelect.find('li.tag-search').click(function() {
                    tagSelectComponent.open(tagSelect, false);
                });
            });
        },

        addOption: function (select, option, index) {
            select = $$(select);
            var tagSelect = select.parents('.tag-select');
            if (typeof index === 'undefined') {
                select.append(option);
            }
            else {
                $$(option).insertBefore(select.find('option').eq(index));
            }
            tagSelect.init(tagSelect);
            var selectName = tagSelect.find('select').attr('name');
            var opened = $$('.page.tag-select-page[data-select-name="' + selectName + '"]').length > 0;
            if (opened) {
                tagSelect.open(tagSelect, true);
            }
        },

        open: function (tagSelect, reLayout) {
            tagSelect = $$(tagSelect);
            if (tagSelect.length === 0) return;

            // Find related view
            var view = tagSelect.parents('.' + app.f7.params.viewClass);
            if (view.length === 0) return;
            view = view[0].f7View;

            // Parameters
            var openIn = tagSelect.attr('data-open-in') || app.f7.params.openIn;
            if (openIn === 'popup') {
                if ($$('.popup.tag-select-popup').length > 0) return;
            }
            else if (openIn === 'picker') {
                if ($$('.picker-modal.modal-in').length > 0 && !reLayout){
                    if (tagSelect[0].f7TagSelectPicker !== $$('.picker-modal.modal-in:not(.modal-out)')[0]) app.f7.closeModal($$('.picker-modal.modal-in:not(.modal-out)'));
                    else return;
                }
            }
            else {
                if (!view) return;
            }

            var tagSelectData = tagSelect.dataset();
            var pageTitle = tagSelectData.pageTitle || tagSelect.find('.item-title').text();
            var backText = tagSelectData.backText || app.f7.params.tagSelectBackText;
            var closeText;
            if (openIn === 'picker') {
                closeText = tagSelectData.pickerCloseText || tagSelectData.backText || app.f7.params.tagSelectPickerCloseText ;
            }
            else {
                closeText = tagSelectData.popupCloseText || tagSelectData.backText || app.f7.params.tagSelectPopupCloseText ;
            }
            var backOnSelect = tagSelectData.backOnSelect !== undefined ? tagSelectData.backOnSelect : app.f7.params.tagSelectBackOnSelect;
            var formTheme = tagSelectData.formTheme || app.f7.params.tagSelectFormTheme;
            var navbarTheme = tagSelectData.navbarTheme || app.f7.params.tagSelectNavbarTheme;
            var toolbarTheme = tagSelectData.toolbarTheme || app.f7.params.tagSelectToolbarTheme;
            var virtualList = tagSelectData.virtualList;
            var virtualListHeight = tagSelectData.virtualListHeight;
            var material = app.f7.params.material;
            var pickerHeight = tagSelectData.pickerHeight || app.f7.params.tagSelectPickerHeight;

            // Collect all options/values
            var select = tagSelect.find('select')[0];
            var $select = $$(select);
            var $selectData = $select.dataset();
            if (select.disabled || tagSelect.hasClass('disabled') || $select.hasClass('disabled')) {
                return;
            }
            var values = [];
            var id = (new Date()).getTime();
            var inputType = select.multiple ? 'checkbox' : 'radio';
            var inputName = inputType + '-' + id;
            var maxLength = $select.attr('maxlength');
            var selectName = select.name;
            var option, optionHasMedia, optionImage, optionIcon, optionGroup, optionGroupLabel, optionPreviousGroup, optionIsLabel, previousGroup, optionColor, optionClassName, optionData;
            for (var i = 0; i < select.length; i++) {
                option = $$(select[i]);
                optionData = option.dataset();
                optionImage = optionData.optionImage || $selectData.optionImage || tagSelectData.optionImage;
                optionIcon = optionData.optionIcon || $selectData.optionIcon || tagSelectData.optionIcon;
                optionHasMedia = optionImage || optionIcon || inputType === 'checkbox';
                if (material) optionHasMedia = optionImage || optionIcon;
                optionColor = optionData.optionColor;
                optionClassName = optionData.optionClass;
                if (option[0].disabled) optionClassName += ' disabled';
                optionGroup = option.parent('optgroup')[0];
                optionGroupLabel = optionGroup && optionGroup.label;
                optionIsLabel = false;
                if (optionGroup) {
                    if (optionGroup !== previousGroup) {
                        optionIsLabel = true;
                        previousGroup = optionGroup;
                        values.push({
                            groupLabel: optionGroupLabel,
                            isLabel: optionIsLabel
                        });
                    }
                }
                values.push({
                    value: option[0].value,
                    text: option[0].textContent.trim(),
                    selected: option[0].selected,
                    group: optionGroup,
                    groupLabel: optionGroupLabel,
                    image: optionImage,
                    icon: optionIcon,
                    color: optionColor,
                    className: optionClassName,
                    disabled: option[0].disabled,
                    inputType: inputType,
                    id: id,
                    hasMedia: optionHasMedia,
                    checkbox: inputType === 'checkbox',
                    inputName: inputName,
                    material: app.f7.params.material
                });
            }


            // Item template/HTML
            if (!app.f7._compiledTemplates.tagSelectItem) {
                app.f7._compiledTemplates.tagSelectItem = app.t7.compile(app.f7.params.tagSelectItemTemplate ||
                    '{{#if isLabel}}' +
                    '<li class="item-divider">{{groupLabel}}</li>' +
                    '{{else}}' +
                    '<li{{#if className}} class="{{className}}"{{/if}}>' +
                        '<label class="label-{{inputType}} item-content">' +
                            '<input type="{{inputType}}" name="{{inputName}}" value="{{value}}" {{#if selected}}checked{{/if}}>' +
                            '{{#if material}}' +
                                '{{#if hasMedia}}' +
                                '<div class="item-media">' +
                                    '{{#if icon}}<i class="icon {{icon}}"></i>{{/if}}' +
                                    '{{#if image}}<img src="{{image}}">{{/if}}' +
                                '</div>' +
                                '<div class="item-inner">' +
                                    '<div class="item-title{{#if color}} color-{{color}}{{/if}}">{{text}}</div>' +
                                '</div>' +
                                '<div class="item-after">' +
                                    '<i class="icon icon-form-{{inputType}}"></i>' +
                                '</div>' +
                                '{{else}}' +
                                '<div class="item-media">' +
                                    '<i class="icon icon-form-{{inputType}}"></i>' +
                                '</div>' +
                                '<div class="item-inner">' +
                                    '<div class="item-title{{#if color}} color-{{color}}{{/if}}">{{text}}</div>' +
                                '</div>' +
                                '{{/if}}' +
                            '{{else}}' +
                                '{{#if hasMedia}}' +
                                '<div class="item-media">' +
                                    '{{#if checkbox}}<i class="icon icon-form-checkbox"></i>{{/if}}' +
                                    '{{#if icon}}<i class="icon {{icon}}"></i>{{/if}}' +
                                    '{{#if image}}<img src="{{image}}">{{/if}}' +
                                '</div>' +
                                '{{/if}}' +
                                '<div class="item-inner">' +
                                    '<div class="item-title{{#if color}} color-{{color}}{{/if}}">{{text}}</div>' +
                                '</div>' +
                            '{{/if}}' +
                        '</label>' +
                    '</li>' +
                    '{{/if}}'
                );
            }
            var tagSelectItemTemplate = app.f7._compiledTemplates.tagSelectItem;

            var inputsHTML = '';
            if (!virtualList) {
                for (var j = 0; j < values.length; j++) {
                    inputsHTML += tagSelectItemTemplate(values[j]);
                }
            }

            // Toolbar / Navbar
            var toolbarHTML = '', navbarHTML;
            var noNavbar = '', noToolbar = '', noTabbar = '', navbarLayout;

            if (openIn === 'picker') {
                if (!app.f7._compiledTemplates.tagSelectToolbar) {
                    app.f7._compiledTemplates.tagSelectToolbar = app.t7.compile(app.f7.params.tagSelectToolbarTemplate ||
                        '<div class="toolbar {{#if toolbarTheme}}theme-{{toolbarTheme}}{{/if}}">' +
                          '<div class="toolbar-inner">' +
                            '<div class="left"></div>' +
                            '<div class="right"><a href="#" class="link close-picker"><span>{{closeText}}</span></a></div>' +
                        '</div>' +
                      '</div>'
                    );
                }

                toolbarHTML = app.f7._compiledTemplates.tagSelectToolbar({
                    pageTitle: pageTitle,
                    closeText: closeText,
                    openIn: openIn,
                    toolbarTheme: toolbarTheme,
                    inPicker: openIn === 'picker'
                });
            }
            else {
                // Navbar HTML
                if (!app.f7._compiledTemplates.tagSelectNavbar) {
                    app.f7._compiledTemplates.tagSelectNavbar = app.t7.compile(app.f7.params.tagSelectNavbarTemplate ||
                        '<div class="navbar {{#if navbarTheme}}theme-{{navbarTheme}}{{/if}}">' +
                            '<div class="navbar-inner">' +
                                '{{leftTemplate}}' +
                                '<div class="center sliding">{{pageTitle}}</div>' +
                            '</div>' +
                        '</div>'
                    );
                }
                navbarHTML = app.f7._compiledTemplates.tagSelectNavbar({
                    pageTitle: pageTitle,
                    backText: backText,
                    closeText: closeText,
                    openIn: openIn,
                    navbarTheme: navbarTheme,
                    inPopup: openIn === 'popup',
                    inPage: openIn === 'page',
                    leftTemplate: openIn === 'popup' ? // use smart select values
                        (app.f7.params.smartSelectPopupCloseTemplate || (material ? '<div class="left"><a href="#" class="link close-popup icon-only"><i class="icon icon-back"></i></a></div>' : '<div class="left"><a href="#" class="link close-popup"><i class="icon icon-back"></i><span>{{closeText}}</span></a></div>')).replace(/{{closeText}}/g, closeText) :
                        (app.f7.params.smartSelectBackTemplate || (material ? '<div class="left"><a href="#" class="back link icon-only"><i class="icon icon-back"></i></a></div>' : '<div class="left sliding"><a href="#" class="back link"><i class="icon icon-back"></i><span>{{backText}}</span></a></div>')).replace(/{{backText}}/g, backText)
                });
                // Determine navbar layout type - static/fixed/through
                if (openIn === 'page') {
                    navbarLayout = 'static';
                    if (tagSelect.parents('.navbar-through').length > 0) navbarLayout = 'through';
                    if (tagSelect.parents('.navbar-fixed').length > 0) navbarLayout = 'fixed';
                    noToolbar = tagSelect.parents('.page').hasClass('no-toolbar') ? 'no-toolbar' : '';
                    noNavbar  = tagSelect.parents('.page').hasClass('no-navbar')  ? 'no-navbar'  : 'navbar-' + navbarLayout;
                    noTabbar = tagSelect.parents('.page').hasClass('no-tabbar') ? 'no-tabbar' : '';
                }
                else {
                    navbarLayout = 'fixed';
                }
            }

            // Page Layout
            var pageName = 'tag-select-' + inputName;

            var useSearchbar = typeof tagSelect.data('searchbar') === 'undefined' ? app.f7.params.tagSelectSearchbar : (tagSelect.data('searchbar') === 'true' ? true : false);
            var searchbarPlaceholder, searchbarCancel;

            if (useSearchbar) {
                searchbarPlaceholder = tagSelect.data('searchbar-placeholder') || 'Search';
                searchbarCancel = tagSelect.data('searchbar-cancel') || 'Cancel';
            }

            var searchbarHTML =   '<form class="searchbar searchbar-init" data-search-list=".tag-select-list-' + id + '" data-search-in=".item-title">' +
                                    '<div class="searchbar-input">' +
                                        '<input type="search" placeholder="' + searchbarPlaceholder + '">' +
                                        '<a href="#" class="searchbar-clear"></a>' +
                                    '</div>' +
                                    (material ? '' : '<a href="#" class="searchbar-cancel">' + searchbarCancel + '</a>') +
                                  '</form>' +
                                  '<div class="searchbar-overlay"></div>';

            var pageHTML =
                (openIn !== 'picker' && navbarLayout === 'through' ? navbarHTML : '') +
                '<div class="pages">' +
                '  <div data-page="' + pageName + '" data-select-name="' + selectName + '" class="page tag-select-page ' + noNavbar + ' ' + noToolbar + ' ' + noTabbar + '">' +
                     (openIn !== 'picker' && navbarLayout === 'fixed' ? navbarHTML : '') +
                     (useSearchbar ? searchbarHTML : '') +
                '    <div class="page-content">' +
                       (openIn !== 'picker' && navbarLayout === 'static' ? navbarHTML : '') +
                '      <div class="list-block no-margin no-border-top ' + (virtualList ? 'virtual-list' : '') + ' tag-select-list-' + id + ' ' + (formTheme ? 'theme-' + formTheme : '') + '">' +
                '        <ul>' +
                            (virtualList ? '' : inputsHTML) +
                '        </ul>' +
                '      </div>' +
                '    </div>' +
                '  </div>' +
                '</div>';

            // Define popup and picker
            var popup, picker;

            // Scroll SS Picker To Input
            function scrollToInput() {
                var pageContent = tagSelect.parents('.page-content');
                if (pageContent.length === 0) return;
                var paddingTop = parseInt(pageContent.css('padding-top'), 10),
                    paddingBottom = parseInt(pageContent.css('padding-bottom'), 10),
                    pageHeight = pageContent[0].offsetHeight - paddingTop - picker.height(),
                    pageScrollHeight = pageContent[0].scrollHeight - paddingTop - picker.height(),
                    newPaddingBottom;
                var inputTop = tagSelect.offset().top - paddingTop + tagSelect[0].offsetHeight;
                if (inputTop > pageHeight) {
                    var scrollTop = pageContent.scrollTop() + inputTop - pageHeight;
                    if (scrollTop + pageHeight > pageScrollHeight) {
                        newPaddingBottom = scrollTop + pageHeight - pageScrollHeight + paddingBottom;
                        if (pageHeight === pageScrollHeight) {
                            newPaddingBottom = picker.height();
                        }
                        pageContent.css({'padding-bottom': (newPaddingBottom) + 'px'});
                    }
                    pageContent.scrollTop(scrollTop, 300);
                }
            }

            // Close SS Picker on HTML Click
            function closeOnHTMLClick(e) {
                var close = true;
                if (e.target === tagSelect[0] || $$(e.target).parents(tagSelect[0]).length > 0) {
                    close = false;
                }
                if ($$(e.target).parents('.picker-modal').length > 0) {
                    close = false;
                }
                if (close) {
                    app.f7.closeModal('.tag-select-picker.modal-in');
                }
            }

            // Check max length
            function checkMaxLength(container) {
                if (select.selectedOptions.length >= maxLength) {
                    container.find('input[type="checkbox"]').each(function () {
                        if (!this.checked) {
                            $$(this).parents('li').addClass('disabled');
                        }
                        else {
                            $$(this).parents('li').removeClass('disabled');
                        }
                    });
                }
                else {
                    container.find('.disabled').removeClass('disabled');
                }
            }

            // Event Listeners on new page
            function handleInputs(container) {
                container = $$(container);
                // if (virtualList) {
                //     var virtualListInstance = app.f7.virtualList(container.find('.virtual-list'), {
                //         items: values,
                //         template: tagSelectItemTemplate,
                //         height: virtualListHeight || undefined,
                //         searchByItem: function (query, index, item) {
                //             if (item.text.toLowerCase().indexOf(query.trim().toLowerCase()) >=0 ) return true;
                //             return false;
                //         }
                //     });
                //     container.once(openIn === 'popup' || openIn === 'picker' ? 'closed': 'pageBeforeRemove', function () {
                //         if (virtualListInstance && virtualListInstance.destroy) virtualListInstance.destroy();
                //     });
                // }
                if (maxLength) {
                    checkMaxLength(container);
                }
                container.on('change', 'input[name="' + inputName + '"]', function () {
                    tagSelectComponent._clearAllSelectedTagItems(tagSelect);

                    var input = this;
                    var value = input.value;
                    // var optionText = [];
                    // if (input.type === 'checkbox') {
                        var values = [];
                        for (var i = 0; i < select.options.length; i++) {
                            var option = select.options[i];
                            if (option.value === value) {
                                option.selected = input.checked;
                            }
                            if (option.selected) {
                                // optionText.push(option.textContent.trim());
                                tagSelectComponent._onOptionSelected(tagSelect, select, option);
                            }
                        }
                        if (maxLength) {
                            checkMaxLength(container);
                        }
                    // }
                    // else {
                    //     optionText = [tagSelect.find('option[value="' + value + '"]').text()];
                    //     select.value = value;
                    // }

                    $select.trigger('change');
                    // tagSelect.find('.item-after').text(optionText.join(', '));
                    if (backOnSelect && inputType === 'radio') {
                        // if (openIn === 'popup') app.f7.closeModal(popup);
                        // else if (openIn === 'picker') app.f7.closeModal(picker);
                        // else view.router.back();
                        view.router.back();
                    }
                });
            }

            // Page initialization callback
            function pageInit(e) {
                var page = e.detail.page;
                if (page.name === pageName) {
                    handleInputs(page.container);
                }
            }

            // if (openIn === 'popup') {
            //     if (reLayout) {
            //         popup = $$('.popup.tag-select-popup .view');
            //         popup.html(pageHTML);
            //     }
            //     else {
            //         popup = app.f7.popup(
            //             '<div class="popup tag-select-popup tag-select-popup-' + inputName + '">' +
            //                 '<div class="view navbar-fixed">' +
            //                     pageHTML +
            //                 '</div>' +
            //             '</div>'
            //             );
            //         popup = $$(popup);
            //     }
            //     app.f7.initPage(popup.find('.page'));
            //     handleInputs(popup);
            // }
            // else if (openIn === 'picker') {
            //     if (reLayout) {
            //         picker = $$('.picker-modal.tag-select-picker .view');
            //         picker.html(pageHTML);
            //     }
            //     else {
            //         picker = app.f7.pickerModal(
            //             '<div class="picker-modal tag-select-picker tag-select-picker-' + inputName + '"' + (pickerHeight ? ' style="height:' + pickerHeight + '"' : '') + '>' +
            //                 toolbarHTML +
            //                 '<div class="picker-modal-inner">' +
            //                     '<div class="view">' +
            //                         pageHTML +
            //                     '</div>' +
            //                 '</div>' +
            //             '</div>'
            //             );
            //         picker = $$(picker);
            //
            //         // Scroll To Input
            //         scrollToInput();
            //
            //         // Close On Click
            //         $$('html').on('click', closeOnHTMLClick);
            //
            //         // On Close
            //         picker.once('close', function () {
            //             // Reset linked picker
            //             tagSelect[0].f7TagSelectPicker = undefined;
            //
            //             // Detach html click
            //             $$('html').off('click', closeOnHTMLClick);
            //
            //             // Restore page padding bottom
            //             tagSelect.parents('.page-content').css({paddingBottom: ''});
            //         });
            //
            //         // Link Picker
            //         tagSelect[0].f7TagSelectPicker = picker[0];
            //     }
            //
            //     // Init Page
            //     app.f7.initPage(picker.find('.page'));
            //
            //     // Attach events
            //     handleInputs(picker);
            // }
            // else {
                $$(document).once('pageInit', '.tag-select-page', pageInit);
                view.router.load({
                    content: pageHTML,
                    reload: reLayout ? true : undefined
                });
            // }
        },

        _clearAllSelectedTagItems: function (tagSelect) {
            tagSelect.find('li.tag-item').remove();
        },

        _onOptionSelected: function (tagSelect, select, option) {
            var text = option.textContent.trim();
            var $item = $$('<li class="tag-item" data-value="' + option.value + '">' +
                '    <div class="item-content">' +
                '      <div class="item-inner">' +
                '        <div class="item-title">' + text + '</div>' +
                '        <div class="item-after"><a href="#" class="item-link remove"><i class="material-icons">close</i></a></div>' +
                '      </div>' +
                '    </div>' +
                '</li>');

            $item.find('a').click(function(event) {
                $item.remove();
                option.selected = false;
                $$(option).trigger('change');
                event.preventDefault();
            });

            tagSelect.find('ul').append($item);
        }
    };

    return tagSelectComponent;
});
