var addon=function(){window.tommy.api;var t={render:function(){var t=this,s=t.$createElement,a=t._self._c||s;return a("div",{staticClass:"whs-empty-block"},[a("i",{staticClass:"icon whs-icon-empty"}),t._v(" "),a("span",[t._v(t._s(t.text))])])},staticRenderFns:[],props:{text:String}},s={render:function(){var a=this,t=a.$createElement,i=a._self._c||t;return i("li",{staticClass:"item-content whs-form-images-picker"},[a.lineWithActions?i("div",{staticClass:"item-inner justify-content-flex-end align-items-center"},[i("label",{staticClass:"link"},[i("input",{attrs:{type:"file",multiple:a.multiple,accept:"image/*"},on:{change:a.onFilesChange}}),a._v(" "),i("i",{staticClass:"f7-icons"},[a._v("images")])]),a._v(" "),a._m(0)]):a._e(),a._v(" "),a.previews.length||!a.lineWithActions?i("div",{staticClass:"whs-form-images-previews"},[a._l(a.previews,function(t,s){return i("div",{key:s,staticClass:"whs-form-images-preview",style:"background-image: url("+t+")"},[i("a",{on:{click:function(t){a.deleteFile(s)}}},[i("i",{staticClass:"f7-icons"},[a._v("close")])])])}),a._v(" "),a.lineWithActions?a._e():i("label",{staticClass:"whs-form-images-add-button"},[i("input",{attrs:{type:"file",multiple:a.multiple,accept:"image/*"},on:{change:a.onFilesChange}}),a._v(" "),i("i",{staticClass:"f7-icons"},[a._v("camera")]),a._v(" "),i("span",[a._v(a._s(a.$t("whs.common.add_photo_label")))])])],2):a._e()])},staticRenderFns:[function(){var t=this,s=t.$createElement,a=t._self._c||s;return a("a",{staticClass:"link"},[a("i",{staticClass:"f7-icons"},[t._v("camera")])])}],props:{lineWithActions:{type:Boolean,default:!0},multiple:Boolean},data:function data(){return{files:[],previews:[]}},methods:{onFilesChange:function onFilesChange(t){var i=this,e=t.target.files;if(e.length)for(var s=function(t){var s=e[t],a=new FileReader;a.onload=function(){i.files.push(s),i.previews.push(a.result)},a.readAsDataURL(s)},a=0;a<e.length;a+=1)s(a)},deleteFile:function deleteFile(t){this.files.splice(t,1),this.previews.splice(t,1)}}},a={render:function(){var t=this,s=t.$createElement,a=t._self._c||s;return a("li",[a("a",{staticClass:"item-content no-chevron item-link whs-list-search-item"},[t._m(0),t._v(" "),a("div",{staticClass:"item-inner"},[a("div",{staticClass:"item-title"},[t._v(t._s(t.$t("whs.common.tags_search_placeholder")))])])])])},staticRenderFns:[function(){var t=this.$createElement,s=this._self._c||t;return s("div",{staticClass:"item-media"},[s("i",{staticClass:"icon whs-list-search-icon"})])}]};return[{path:"/whs/",component:{render:function(){var s=this,t=s.$createElement,a=s._self._c||t;return a("f7-page",[a("f7-navbar",[a("tommy-nav-menu"),s._v(" "),a("f7-nav-title",[s._v(s._s(s.$t("whs.index.title")))]),s._v(" "),a("f7-nav-right",{staticClass:"whs-navbar-links"},[a("f7-link",{attrs:{"icon-only":"","popover-open":".whs-popover-add"}},[a("f7-icon",{attrs:{f7:"add"}})],1),s._v(" "),a("f7-link",{attrs:{"icon-only":""}},[a("f7-icon",{attrs:{f7:"bell"}})],1),s._v(" "),a("f7-link",{attrs:{href:"/whs/settings/","icon-only":""}},[a("f7-icon",{attrs:{f7:"gear"}})],1)],1)],1),s._v(" "),a("f7-popover",{staticClass:"whs-popover whs-popover-add",attrs:{backdrop:!1}},[a("f7-list",{attrs:{"no-chevron":""}},[a("f7-list-item",{attrs:{link:"/whs/item-add/","popover-close":""}},[a("i",{staticClass:"whs-icon whs-icon-box-black",attrs:{slot:"media"},slot:"media"}),s._v(" "),a("span",{attrs:{slot:"title"},slot:"title"},[s._v("New Item")])]),s._v(" "),a("f7-list-item",{attrs:{link:"/whs/location-add/","popover-close":""}},[a("i",{staticClass:"whs-icon whs-icon-drawer-black",attrs:{slot:"media"},slot:"media"}),s._v(" "),a("span",{attrs:{slot:"title"},slot:"title"},[s._v("New Location")])]),s._v(" "),a("f7-list-item",{attrs:{link:"/whs/tag-add/","popover-close":""}},[a("i",{staticClass:"whs-icon whs-icon-tag-black",attrs:{slot:"media"},slot:"media"}),s._v(" "),a("span",{attrs:{slot:"title"},slot:"title"},[s._v("New Tag")])]),s._v(" "),a("f7-list-item",{attrs:{link:"/whs/activity-add/","popover-close":""}},[a("i",{staticClass:"whs-icon whs-icon-clock-black",attrs:{slot:"media"},slot:"media"}),s._v(" "),a("span",{attrs:{slot:"title"},slot:"title"},[s._v("New Activity")])])],1)],1),s._v(" "),a("f7-searchbar",{staticClass:"whs-searchbar",attrs:{slot:"static",placeholder:s.$t("whs.common.search_placeholder"),customSearch:"",backdrop:!1,disableButton:!1,value:s.search},on:{input:function(t){s.onSearchbarSearch(t.target.value)},"searchbar:clear":s.onSearchbarClear,"searchbar:enable":function(t){s.searchEnabled=!0},"searchbar:disable":function(t){s.searchEnabled=!1}},slot:"static"},[a("f7-link",{attrs:{"icon-only":""}},[a("i",{staticClass:"icon whs-icon-barcode"})]),s._v(" "),a("f7-link",{attrs:{"icon-only":""}},[a("i",{staticClass:"icon whs-icon-sort-black"})])],1),s._v(" "),s.searchEnabled?s._e():a("div",{staticClass:"whs-menubar"},[a("a",{class:"link "+("items"===s.activeTab?"whs-menubar-active":""),on:{click:function(t){s.activeTab="items"}}},[a("i",{class:"icon whs-icon whs-icon-box-"+("items"===s.activeTab?"orange":"black")}),s._v(" "),a("span",[s._v("Items")])]),s._v(" "),a("a",{class:"link "+("locations"===s.activeTab?"whs-menubar-active":""),on:{click:function(t){s.activeTab="locations"}}},[a("i",{class:"icon whs-icon whs-icon-drawer-"+("locations"===s.activeTab?"orange":"black")}),s._v(" "),a("span",[s._v("Locations")])]),s._v(" "),a("a",{class:"link "+("tags"===s.activeTab?"whs-menubar-active":""),on:{click:function(t){s.activeTab="tags"}}},[a("i",{class:"icon whs-icon whs-icon-tag-"+("tags"===s.activeTab?"orange":"black")}),s._v(" "),a("span",[s._v("Tags")])]),s._v(" "),a("a",{class:"link "+("activity"===s.activeTab?"whs-menubar-active":""),on:{click:function(t){s.activeTab="activity"}}},[a("i",{class:"icon whs-icon whs-icon-clock-"+("activity"===s.activeTab?"orange":"black")}),s._v(" "),a("span",[s._v("Activity")])])]),s._v(" "),s.searchEnabled?a("div",{staticClass:"whs-menubar"},[a("a",{class:"link "+("all"===s.activeSearchFilter?"whs-menubar-active":""),on:{click:function(t){s.activeSearchFilter="all"}}},[a("i",{staticClass:"icon f7-icons"},[s._v("data")]),s._v(" "),a("span",[s._v("All")])]),s._v(" "),a("a",{class:"link "+("items"===s.activeSearchFilter?"whs-menubar-active":""),on:{click:function(t){s.activeSearchFilter="items"}}},[a("i",{class:"icon whs-icon whs-icon-box-"+("items"===s.activeSearchFilter?"orange":"black")}),s._v(" "),a("span",[s._v("Items")])]),s._v(" "),a("a",{class:"link "+("locations"===s.activeSearchFilter?"whs-menubar-active":""),on:{click:function(t){s.activeSearchFilter="locations"}}},[a("i",{class:"icon whs-icon whs-icon-drawer-"+("locations"===s.activeSearchFilter?"orange":"black")}),s._v(" "),a("span",[s._v("Locations")])]),s._v(" "),a("a",{class:"link "+("tags"===s.activeSearchFilter?"whs-menubar-active":""),on:{click:function(t){s.activeSearchFilter="tags"}}},[a("i",{class:"icon whs-icon whs-icon-tag-"+("tags"===s.activeSearchFilter?"orange":"black")}),s._v(" "),a("span",[s._v("Tags")])])]):s._e(),s._v(" "),"items"!==s.activeTab||s.searchEnabled?s._e():[a("f7-list",{staticClass:"whs-list",attrs:{"media-list":""}},s._l(10,function(t){return a("f7-list-item",{attrs:{"chevron-center":"",link:"/whs/item/",title:"Field001"}},[a("div",{staticClass:"whs-item-image",attrs:{slot:"media"},slot:"media"}),s._v(" "),a("div",{staticClass:"whs-item-row"},[s._v("QUANTITY: 9000")]),s._v(" "),a("div",{staticClass:"whs-item-row"},[s._v("LOCATIONS: 10")])])}))],s._v(" "),"locations"!==s.activeTab||s.searchEnabled?s._e():[a("f7-list",{staticClass:"whs-list",attrs:{"media-list":""}},s._l(10,function(t){return a("f7-list-item",{attrs:{"chevron-center":"",link:"",title:"Blacktown"}},[a("div",{staticClass:"whs-item-image",attrs:{slot:"media"},slot:"media"}),s._v(" "),a("div",{staticClass:"whs-item-row"},[s._v("LOCATIONS: 2000")]),s._v(" "),a("div",{staticClass:"whs-item-row"},[s._v("Test description of the location")])])}))],s._v(" "),"tags"!==s.activeTab||s.searchEnabled?s._e():[a("f7-list",{staticClass:"whs-list",attrs:{"media-list":""}},s._l(10,function(t){return a("f7-list-item",{attrs:{"chevron-center":"",link:"",title:"Color"}},[a("div",{staticClass:"whs-item-image",attrs:{slot:"media"},slot:"media"}),s._v(" "),a("div",{staticClass:"whs-item-row"},[s._v("LOCATIONS: 2000")]),s._v(" "),a("div",{staticClass:"whs-item-row"},[s._v("Items: 500")])])}))]],2)},staticRenderFns:[],data:function data(){return{activeTab:"items",activeSearchFilter:"all",search:"",searchEnabled:!1}},created:function created(){},computed:{},methods:{onSearchbarSearch:function onSearchbarSearch(t){this.search=t},onSearchbarClear:function onSearchbarClear(t){this.$f7.searchbar.disable()}},beforeDestroy:function beforeDestroy(){},mounted:function mounted(){}}},{path:"/whs/item/",component:{render:function(){var s=this,t=s.$createElement,a=s._self._c||t;return a("f7-page",{staticClass:"whs-details-page"},[a("f7-navbar",{attrs:{innerClass:"whs-details-navbar-inner"}},[a("tommy-nav-back"),s._v(" "),a("f7-nav-title",[s._v("Field001")]),s._v(" "),a("f7-nav-right",{staticClass:"whs-navbar-links"},[a("f7-link",{attrs:{"icon-only":""}},[a("f7-icon",{attrs:{f7:"add"}})],1),s._v(" "),a("f7-link",{attrs:{"icon-only":""}},[a("f7-icon",{attrs:{f7:"gear"}})],1)],1)],1),s._v(" "),a("f7-subnavbar",{staticClass:"no-hairline"},[s._v(" Funky field minced 100% plant based 4-40 ")]),s._v(" "),a("div",{staticClass:"whs-menubar whs-menubar-labels no-swipe-panel"},[a("a",{class:"link "+("summary"===s.activeTab?"whs-menubar-active":""),on:{click:function(t){s.activeTab="summary"}}},[a("span",[s._v("Summary")])]),s._v(" "),a("a",{class:"link "+("locations"===s.activeTab?"whs-menubar-active":""),on:{click:function(t){s.activeTab="locations"}}},[a("span",[s._v("Locations")])]),s._v(" "),a("a",{class:"link "+("tags"===s.activeTab?"whs-menubar-active":""),on:{click:function(t){s.activeTab="tags"}}},[a("span",[s._v("Tags")])]),s._v(" "),a("a",{class:"link "+("activity"===s.activeTab?"whs-menubar-active":""),on:{click:function(t){s.activeTab="activity"}}},[a("span",[s._v("Activity")])])]),s._v(" "),"summary"===s.activeTab?[a("div",{staticClass:"whs-summary-cards"},[a("div",{staticClass:"whs-summary-card"},[a("div",{staticClass:"whs-summary-card-left"},[a("i",{staticClass:"icon whs-icon-box-black"})]),s._v(" "),a("div",{staticClass:"whs-summary-card-right"},[a("div",{staticClass:"whs-summary-card-value"},[s._v("50,000")]),s._v(" "),a("div",{staticClass:"whs-summary-card-label"},[s._v("TOTAL")])])]),s._v(" "),a("div",{staticClass:"whs-summary-card"},[a("div",{staticClass:"whs-summary-card-left"},[a("i",{staticClass:"icon whs-icon-tag-black"})]),s._v(" "),a("div",{staticClass:"whs-summary-card-right"},[a("div",{staticClass:"whs-summary-card-value"},[s._v("150")]),s._v(" "),a("div",{staticClass:"whs-summary-card-label"},[s._v("TAGS")])])]),s._v(" "),a("div",{staticClass:"whs-summary-card"},[a("div",{staticClass:"whs-summary-card-left"},[a("i",{staticClass:"icon whs-icon-drawer-black"})]),s._v(" "),a("div",{staticClass:"whs-summary-card-right"},[a("div",{staticClass:"whs-summary-card-value"},[s._v("5,000")]),s._v(" "),a("div",{staticClass:"whs-summary-card-label"},[s._v("LOCATIONS")])])]),s._v(" "),a("div",{staticClass:"whs-summary-card"},[a("div",{staticClass:"whs-summary-card-left"},[a("div",{staticClass:"whs-summary-card-title"},[s._v("Value")])]),s._v(" "),a("div",{staticClass:"whs-summary-card-right"},[a("div",{staticClass:"whs-summary-card-value"},[s._v("$ 290,900")]),s._v(" "),a("div",{staticClass:"whs-summary-card-label"},[s._v("Est. Total")])])]),s._v(" "),a("div",{staticClass:"whs-summary-card"},[a("div",{staticClass:"whs-summary-card-left"},[a("div",{staticClass:"whs-summary-card-title"},[s._v("Expiring")])]),s._v(" "),a("div",{staticClass:"whs-summary-card-right"},[a("div",{staticClass:"whs-summary-card-value"},[s._v("250")]),s._v(" "),a("div",{staticClass:"whs-summary-card-label"},[s._v("Items")])])]),s._v(" "),a("div",{staticClass:"whs-summary-card"},[a("div",{staticClass:"whs-summary-card-left"},[a("div",{staticClass:"whs-summary-card-title"},[s._v("Pending in")])]),s._v(" "),a("div",{staticClass:"whs-summary-card-right"},[a("div",{staticClass:"whs-summary-card-value"},[s._v("20")]),s._v(" "),a("div",{staticClass:"whs-summary-card-label"},[s._v("Items")])])]),s._v(" "),a("div",{staticClass:"whs-summary-card"},[a("div",{staticClass:"whs-summary-card-left"},[a("div",{staticClass:"whs-summary-card-title"},[s._v("Pending out")])]),s._v(" "),a("div",{staticClass:"whs-summary-card-right"},[a("div",{staticClass:"whs-summary-card-value"},[s._v("20")]),s._v(" "),a("div",{staticClass:"whs-summary-card-label"},[s._v("Items")])])])])]:s._e(),s._v(" "),"locations"===s.activeTab?[a("div",{staticClass:"whs-table"},[a("table",[a("thead",[a("tr",[a("th",{staticClass:"sort-cell"},[a("a",{staticClass:"link"},[a("i",{staticClass:"whs-icon whs-icon-sort-black"})])]),s._v(" "),a("th",[s._v("Location")]),s._v(" "),a("th",[s._v("Parent")]),s._v(" "),a("th",[s._v("Items")])])]),s._v(" "),a("tbody",[a("tr",[a("td",{staticClass:"media-cell"}),s._v(" "),a("td",[s._v("1000348671")]),s._v(" "),a("td",[s._v("BF-02-01")]),s._v(" "),a("td",[s._v("500")])]),s._v(" "),a("tr",[a("td",{staticClass:"media-cell"}),s._v(" "),a("td",[s._v("1000348671")]),s._v(" "),a("td",[s._v("BF-02-01")]),s._v(" "),a("td",[s._v("500")])]),s._v(" "),a("tr",[a("td",{staticClass:"media-cell"}),s._v(" "),a("td",[s._v("1000348671")]),s._v(" "),a("td",[s._v("BF-02-01")]),s._v(" "),a("td",[s._v("500")])]),s._v(" "),a("tr",[a("td",{staticClass:"media-cell"}),s._v(" "),a("td",[s._v("1000348671")]),s._v(" "),a("td",[s._v("BF-02-01")]),s._v(" "),a("td",[s._v("500")])])])])]),s._v(" "),a("div",{staticClass:"whs-pagination",attrs:{slot:"fixed"},slot:"fixed"},[a("div",{staticClass:"whs-pagination-rows"},[s._v("4 "+s._s(s.$t("whs.pagination.rows")))]),s._v(" "),a("div",{staticClass:"whs-pagination-nav"},[a("a",{staticClass:"link"},[a("i",{staticClass:"f7-icons"},[s._v("chevron_left")])]),s._v(" "),a("span",[s._v(s._s(s.$t("whs.pagination.page",{current:1,total:4})))]),s._v(" "),a("a",{staticClass:"link"},[a("i",{staticClass:"f7-icons"},[s._v("chevron_right")])])]),s._v(" "),a("div",{staticClass:"whs-pagination-actions"},[a("a",{staticClass:"link"},[a("i",{staticClass:"icon f7-icons"},[s._v("share")])]),s._v(" "),a("a",{staticClass:"link"},[a("i",{staticClass:"icon f7-icons"},[s._v("gear")])])])])]:s._e(),s._v(" "),"tags"===s.activeTab?[a("empty-block",{attrs:{text:s.$t("whs.common.no_tags")}})]:s._e(),s._v(" "),"activity"===s.activeTab?[a("empty-block",{attrs:{text:s.$t("whs.common.no_activity")}})]:s._e()],2)},staticRenderFns:[],components:{EmptyBlock:t},data:function data(){return{activeTab:"summary"}},created:function created(){},computed:{},methods:{},beforeDestroy:function beforeDestroy(){},mounted:function mounted(){}}},{path:"/whs/item-add/",component:{render:function(){var t=this,s=t.$createElement,a=t._self._c||s;return a("f7-page",[a("f7-navbar",[a("tommy-nav-back"),t._v(" "),a("f7-nav-title",[t._v(t._s(t.$t("whs.item_add.title")))]),t._v(" "),a("f7-nav-right",{staticClass:"whs-navbar-links"},[a("f7-link",{attrs:{"icon-only":""}},[a("f7-icon",{attrs:{f7:"check"}})],1)],1)],1),t._v(" "),a("a",{staticClass:"whs-toolbar-button",attrs:{slot:"fixed"},slot:"fixed"},[t._v(t._s(t.$t("whs.item_add.add_more_button")))]),t._v(" "),a("f7-list",{staticClass:"whs-form"},[a("ul",[a("form-images-picker",{attrs:{lineWithActions:!1,multiple:"multiple"}}),t._v(" "),a("f7-list-item",{attrs:{divider:""}},[a("i",{staticClass:"whs-form-icon whs-form-icon-aa"}),t._v(" "+t._s(t.$t("whs.common.name_label"))+" ")]),t._v(" "),a("f7-list-input",{attrs:{type:"text",placeholder:t.$t("whs.common.required_placeholder")}}),t._v(" "),a("f7-list-item",{attrs:{divider:""}},[a("i",{staticClass:"whs-form-icon whs-form-icon-barcode"}),t._v(" "+t._s(t.$t("whs.common.sku_barcode_label"))+" ")]),t._v(" "),a("f7-list-input",{attrs:{type:"text",placeholder:t.$t("whs.common.sku_barcode_placeholder")}},[a("a",{staticClass:"link whs-form-barcode-link",attrs:{slot:"input"},slot:"input"},[a("i",{staticClass:"whs-icon whs-icon-barcode"})])]),t._v(" "),a("f7-list-item",{attrs:{divider:""}},[a("i",{staticClass:"whs-form-icon whs-form-icon-dollar"}),t._v(" "+t._s(t.$t("whs.common.price_label"))+" ")]),t._v(" "),a("f7-list-input",{attrs:{type:"number",placeholder:t.$t("whs.common.price_placeholder")}}),t._v(" "),a("f7-list-item",{attrs:{divider:""}},[a("i",{staticClass:"whs-form-icon whs-form-icon-hash"}),t._v(" "+t._s(t.$t("whs.common.tags_label"))+" ")]),t._v(" "),a("tags-picker"),t._v(" "),a("f7-list-item",{attrs:{divider:""}},[a("i",{staticClass:"whs-form-icon whs-form-icon-1"}),t._v(" "+t._s(t.$t("whs.common.minimum_stock_level_label"))+" ")]),t._v(" "),a("f7-list-input",{attrs:{type:"text",placeholder:t.$t("whs.common.minimum_stock_level_placeholder")}}),t._v(" "),a("f7-list-item",{attrs:{divider:""}},[a("i",{staticClass:"whs-form-icon whs-form-icon-location"}),t._v(" "+t._s(t.$t("whs.common.location_quantity_label"))+" ")]),t._v(" "),a("f7-list-item",{attrs:{link:"",title:t.$t("whs.common.location_quantity_placeholder")}}),t._v(" "),a("f7-list-item",{attrs:{divider:""}},[a("i",{staticClass:"whs-form-icon whs-form-icon-text"}),t._v(" "+t._s(t.$t("whs.common.notes_label"))+" ")]),t._v(" "),a("f7-list-input",{attrs:{type:"textarea",resizable:"",placeholder:t.$t("whs.common.notes_placeholder")}}),t._v(" "),a("f7-list-item",{attrs:{divider:""}},[a("i",{staticClass:"whs-form-icon whs-form-icon-check"}),t._v(" "+t._s(t.$t("whs.common.storage_label"))+" ")]),t._v(" "),a("f7-list-item",{attrs:{link:"",title:t.$t("whs.common.storage_placeholder")}})],1)])],1)},staticRenderFns:[],components:{FormImagesPicker:s,TagsPicker:a},data:function data(){return{}},created:function created(){},computed:{},methods:{},beforeDestroy:function beforeDestroy(){},mounted:function mounted(){}}},{path:"/whs/tag-add/",component:{render:function(){var t=this,s=t.$createElement,a=t._self._c||s;return a("f7-page",[a("f7-navbar",[a("tommy-nav-back"),t._v(" "),a("f7-nav-title",[t._v(t._s(t.$t("whs.tag_add.title")))]),t._v(" "),a("f7-nav-right",{staticClass:"whs-navbar-links"},[a("f7-link",{attrs:{"icon-only":""}},[a("f7-icon",{attrs:{f7:"check"}})],1)],1)],1),t._v(" "),a("f7-list",{staticClass:"whs-form"},[a("ul",[a("f7-list-item",{attrs:{divider:""}},[a("i",{staticClass:"whs-form-icon whs-form-icon-aa"}),t._v(" "+t._s(t.$t("whs.common.name_label"))+" ")]),t._v(" "),a("f7-list-input",{attrs:{type:"text",placeholder:t.$t("whs.common.required_placeholder")}}),t._v(" "),a("f7-list-item",{attrs:{divider:""}},[a("i",{staticClass:"whs-form-icon whs-form-icon-image"}),t._v(" "+t._s(t.$t("whs.common.icon_label"))+" ")]),t._v(" "),a("form-images-picker")],1)])],1)},staticRenderFns:[],components:{FormImagesPicker:s},data:function data(){return{}},created:function created(){},computed:{},methods:{},beforeDestroy:function beforeDestroy(){},mounted:function mounted(){}}},{path:"/whs/location-add/",component:{render:function(){var t=this,s=t.$createElement,a=t._self._c||s;return a("f7-page",[a("f7-navbar",[a("tommy-nav-back"),t._v(" "),a("f7-nav-title",[t._v(t._s(t.$t("whs.location_add.title")))]),t._v(" "),a("f7-nav-right",{staticClass:"whs-navbar-links"},[a("f7-link",{attrs:{"icon-only":""}},[a("f7-icon",{attrs:{f7:"check"}})],1)],1)],1),t._v(" "),a("f7-list",{staticClass:"whs-form"},[a("ul",[a("form-images-picker",{attrs:{lineWithActions:!1,multiple:"multiple"}}),t._v(" "),a("f7-list-item",{attrs:{divider:""}},[a("i",{staticClass:"whs-form-icon whs-form-icon-aa"}),t._v(" "+t._s(t.$t("whs.common.name_label"))+" ")]),t._v(" "),a("f7-list-input",{attrs:{type:"text",placeholder:t.$t("whs.common.required_placeholder")}}),t._v(" "),a("f7-list-item",{attrs:{divider:""}},[a("i",{staticClass:"whs-form-icon whs-form-icon-barcode"}),t._v(" "+t._s(t.$t("whs.common.sku_barcode_label"))+" ")]),t._v(" "),a("f7-list-input",{attrs:{type:"text",placeholder:t.$t("whs.common.sku_barcode_placeholder")}},[a("a",{staticClass:"link whs-form-barcode-link",attrs:{slot:"input"},slot:"input"},[a("i",{staticClass:"whs-icon whs-icon-barcode"})])]),t._v(" "),a("f7-list-item",{attrs:{divider:""}},[a("i",{staticClass:"whs-form-icon whs-form-icon-location"}),t._v(" "+t._s(t.$t("whs.common.parent_location_label"))+" ")]),t._v(" "),a("f7-list-item",{attrs:{link:"",title:t.$t("whs.common.parent_location_placeholder")}}),t._v(" "),a("f7-list-item",{attrs:{divider:""}},[a("i",{staticClass:"whs-form-icon whs-form-icon-text"}),t._v(" "+t._s(t.$t("whs.common.notes_label"))+" ")]),t._v(" "),a("f7-list-input",{attrs:{type:"textarea",resizable:"",placeholder:t.$t("whs.common.notes_placeholder")}}),t._v(" "),a("f7-list-item",{attrs:{divider:""}},[a("i",{staticClass:"whs-form-icon whs-form-icon-1"}),t._v(" "+t._s(t.$t("whs.common.pallet_capacity_label"))+" ")]),t._v(" "),a("f7-list-item",{attrs:{title:"1"}},[a("f7-stepper",{attrs:{input:!1,"buttons-only":"",color:"gray"}})],1),t._v(" "),a("f7-list-item",{attrs:{divider:""}},[a("i",{staticClass:"whs-form-icon whs-form-icon-hash"}),t._v(" "+t._s(t.$t("whs.common.tags_label"))+" ")]),t._v(" "),a("tags-picker"),t._v(" "),a("f7-list-item",{attrs:{divider:""}},[a("i",{staticClass:"whs-form-icon whs-form-icon-toggle"}),t._v(" "+t._s(t.$t("whs.common.active_location_label"))+" ")]),t._v(" "),a("f7-list-item",[a("f7-toggle",{attrs:{slot:"after"},slot:"after"})],1),t._v(" "),a("f7-list-item",{attrs:{divider:""}},[a("i",{staticClass:"whs-form-icon whs-form-icon-check"}),t._v(" "+t._s(t.$t("whs.common.location_category_label"))+" ")]),t._v(" "),a("f7-list-item",{attrs:{link:"",title:t.$t("whs.common.location_category_placeholder")}})],1)])],1)},staticRenderFns:[],components:{FormImagesPicker:s,TagsPicker:a},data:function data(){return{}},created:function created(){},computed:{},methods:{},beforeDestroy:function beforeDestroy(){},mounted:function mounted(){}}},{path:"/whs/settings/",component:{render:function(){var t=this,s=t.$createElement,a=t._self._c||s;return a("f7-page",[a("f7-navbar",[a("tommy-nav-back"),t._v(" "),a("f7-nav-title",[t._v(t._s(t.$t("whs.settings.title")))])],1),t._v(" "),a("f7-list",{staticClass:"no-margin no-hairlines whs-settings-list"},[a("f7-list-input",{attrs:{type:"text",label:t.$t("whs.general.name_label"),"inline-label":"",value:"Inventory"}}),t._v(" "),a("f7-list-item",{attrs:{link:"",title:t.$t("whs.settings.currency"),after:"$"}}),t._v(" "),a("f7-list-item",{attrs:{link:"",title:t.$t("whs.settings.date"),after:"2019-03-16"}}),t._v(" "),a("f7-list-item",{attrs:{link:"",title:t.$t("whs.settings.time"),after:"5:58 PM"}}),t._v(" "),a("f7-list-item",{attrs:{link:"",title:t.$t("whs.settings.export")}}),t._v(" "),a("f7-list-item",{attrs:{link:"",title:t.$t("whs.settings.import")}}),t._v(" "),a("f7-list-item",{attrs:{link:"",title:t.$t("whs.settings.permissions")}}),t._v(" "),a("f7-list-item",{attrs:{link:"",title:t.$t("whs.settings.customers")}}),t._v(" "),a("f7-list-item",{attrs:{link:"",title:t.$t("whs.settings.integrations")}}),t._v(" "),a("f7-list-item",{attrs:{divider:"",title:t.$t("whs.settings.preferences_title")}}),t._v(" "),a("f7-list-item",{attrs:{link:"/whs/settings/items/",title:t.$t("whs.settings.items")}}),t._v(" "),a("f7-list-item",{attrs:{link:"/whs/settings/tags/",title:t.$t("whs.settings.tags")}}),t._v(" "),a("f7-list-item",{attrs:{link:"/whs/settings/locations/",title:t.$t("whs.settings.locations")}}),t._v(" "),a("f7-list-item",{attrs:{link:"/whs/settings/activities/",title:t.$t("whs.settings.activities")}}),t._v(" "),a("f7-list-item",{attrs:{link:"",title:t.$t("whs.settings.activity_dashboard")}})],1),t._v(" "),a("f7-list",{staticClass:"no-hairlines whs-settings-list"},[a("f7-list-item",{attrs:{link:"",title:t.$t("whs.settings.subscriptions")}})],1)],1)},staticRenderFns:[],components:{},data:function data(){return{}},created:function created(){},computed:{},methods:{},beforeDestroy:function beforeDestroy(){},mounted:function mounted(){}}},{path:"/whs/settings/items/",component:{render:function(){var t=this,s=t.$createElement,a=t._self._c||s;return a("f7-page",[a("f7-navbar",[a("tommy-nav-back"),t._v(" "),a("f7-nav-title",[t._v(t._s(t.$t("whs.settings_items.title")))])],1),t._v(" "),a("f7-list",{staticClass:"no-margin no-hairlines whs-settings-list"},[a("f7-list-input",{attrs:{type:"text",label:t.$t("whs.general.name_label"),"inline-label":"",value:"Items"}})],1)],1)},staticRenderFns:[],components:{},data:function data(){return{}},created:function created(){},computed:{},methods:{},beforeDestroy:function beforeDestroy(){},mounted:function mounted(){}}}]}();