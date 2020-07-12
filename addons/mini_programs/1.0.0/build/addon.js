var addon=function(t){var n={};function e(o){if(n[o])return n[o].exports;var i=n[o]={i:o,l:!1,exports:{}};return t[o].call(i.exports,i,i.exports,e),i.l=!0,i.exports}return e.m=t,e.c=n,e.d=function(t,n,o){e.o(t,n)||Object.defineProperty(t,n,{enumerable:!0,get:o})},e.r=function(t){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(t,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(t,"__esModule",{value:!0})},e.t=function(t,n){if(1&n&&(t=e(t)),8&n)return t;if(4&n&&"object"==typeof t&&t&&t.__esModule)return t;var o=Object.create(null);if(e.r(o),Object.defineProperty(o,"default",{enumerable:!0,value:t}),2&n&&"string"!=typeof t)for(var i in t)e.d(o,i,function(n){return t[n]}.bind(null,i));return o},e.n=function(t){var n=t&&t.__esModule?function(){return t.default}:function(){return t};return e.d(n,"a",n),n},e.o=function(t,n){return Object.prototype.hasOwnProperty.call(t,n)},e.p="",e(e.s=1)}([,function(t,n,e){"use strict";e.r(n);var o=function(){var t=this,n=t.$createElement,e=t._self._c||n;return e("f7-page",{attrs:{id:"example__index"}},[e("f7-navbar",[e("tommy-nav-menu"),t._v(" "),e("f7-nav-title",[t._v(t._s(t.$t("mini_programs.index.title")))]),t._v(" "),e("f7-nav-right")],1),t._v(" "),e("f7-page-content",[e("f7-row",{attrs:{"no-gap":""}},[e("f7-col",{attrs:{width:"100"}},[e("f7-block",{attrs:{strong:"",inset:""}},[e("p",[t._v(t._s(t.$t("mini_programs.index.introduction"))+" "),e("a",{attrs:{href:t.$t("mini_programs.index.visit_link.url"),target:"_blank"}},[t._v("\n            "+t._s(t.$t("mini_programs.index.visit_link.text"))+"\n          ")])])])],1)],1),t._v(" "),t.loaded?e("f7-row",{attrs:{"no-gap":""}},t._l(t.addons,(function(n,o){return e("f7-col",{key:"addon-"+o,attrs:{width:"100","tablet-width":"50"}},[e("f7-block",{attrs:{strong:"",inset:""}},[e("f7-block-header",[e("f7-row",[e("f7-col",{attrs:{width:"80"}},[t._v(t._s(n.title))]),t._v(" "),e("f7-col",{attrs:{width:"20",align:"right"}},[e("f7-toggle",{ref:"toggle-"+n.id,refInFor:!0,attrs:{checked:n.installed},on:{"toggle:change":function(e){return t.toggleAddon(n)}}})],1)],1)],1),t._v(" "),e("f7-row",[e("f7-col",{staticClass:"col--icon"},[e("img",{attrs:{src:n.icon_url,width:"60"}})]),t._v(" "),e("f7-col",{staticClass:"col--icon-description"},[t._v("\n              "+t._s(n.description)+"\n            ")])],1)],1)],1)})),1):t._e()],1)],1)};o._withStripped=!0;var i=window.tommy.api,r={getAddons:function(t){return i.getAddons()},uninstallAddon:function(t){return i.uninstallAddon(t)},installAddon:function(t,n){return i.installAddon(t,n)}};function l(t,n,e,o,i,r,l,a){var s,d="function"==typeof t?t.options:t;if(n&&(d.render=n,d.staticRenderFns=e,d._compiled=!0),o&&(d.functional=!0),r&&(d._scopeId="data-v-"+r),l?(s=function(t){(t=t||this.$vnode&&this.$vnode.ssrContext||this.parent&&this.parent.$vnode&&this.parent.$vnode.ssrContext)||"undefined"==typeof __VUE_SSR_CONTEXT__||(t=__VUE_SSR_CONTEXT__),i&&i.call(this,t),t&&t._registeredComponents&&t._registeredComponents.add(l)},d._ssrRegister=s):i&&(s=a?function(){i.call(this,this.$root.$options.shadowRoot)}:i),s)if(d.functional){d._injectStyles=s;var c=d.render;d.render=function(t,n){return s.call(n),c(t,n)}}else{var u=d.beforeCreate;d.beforeCreate=u?[].concat(u,s):[s]}return{exports:t,options:d}}var a=l({methods:{alertDialog:function(t,n,e){var o=arguments.length>3&&void 0!==arguments[3]?arguments[3]:null;this.$f7.dialog.create({title:t,text:n,cssClass:o,buttons:[{text:e,cssClass:"dialog-button-bold",keyCodes:[13]}]}).open()},confirmDialog:function(t,n,e,o,i,r){var l=arguments.length>6&&void 0!==arguments[6]?arguments[6]:null,a=arguments.length>7&&void 0!==arguments[7]&&arguments[7],s=!(arguments.length>8&&void 0!==arguments[8])||arguments[8];this.$f7.dialog.create({title:t,text:n,cssClass:l,buttons:[{text:o,bold:a,keyCodes:[27],onClick:function(){"function"==typeof r&&r()}},{text:e,bold:s,keyCodes:[13],onClick:function(){"function"==typeof i&&i()}}]}).open()}}},void 0,void 0,!1,null,null,null);a.options.__file="tommy-core/src/mixins/dialog.vue";var s=l({components:{},data:function(){return{addons:[],loaded:!1}},mixins:[a.exports],methods:{toggleAddon:function(t){console.log(t);var n=this;t.installed?n.confirmDialog(!1,n.$t("mini_programs.index.uninstall_addon_confirmation_message"),n.$t("mini_programs.index.confirm_button"),n.$t("mini_programs.index.cancel_button"),(function(){return n.uninstallAddon(t)}),(function(){return n.cancelUninstall(t)}),null,!0,!1):n.installAddon(t)},cancelUninstall:function(t){t.installed=!0},uninstallAddon:function(t){console.log("delete"),r.uninstallAddon(t.package).then((function(){t.installed=!1}))},installAddon:function(t){var n={token:this.$root.token};r.installAddon(t.package,n).then((function(){t.installed=!0}))}},mounted:function(){var t=this;r.getAddons().then((function(n){t.addons=n.filter((function(t){return!1===t.private})),t.loaded=!0}))}},o,[],!1,null,null,null);s.options.__file="addons/mini_programs/1.0.0/src/pages/index.vue";var d=[{path:"/mini_programs/",component:s.exports}];n.default=d}]).default;