var addon=function(){var d=window.tommy.api,a=function getRecords(t,e,a,n){void 0===n&&(n={});var i,s=n.page,l=n.limit,r=n.dateFrom,o=n.dateTo;return e=e.split(/[-_]/g).map(function(t){return t[0].toUpperCase()+t.substr(1)}).join(""),r&&o&&(i=[new Date(r).toJSON(),new Date(o).toJSON()]),d.getFragments({addon:t,kind:"Vitals"+e+"Item",with_filters:!0,with_permission_to:!0,user_id:a.id,page:s||1,limit:l||50,date_range:i},{cache:!1})},s=function addRecord(t,e,a,n){e=e.split(/[-_]/g).map(function(t){return t[0].toUpperCase()+t.substr(1)}).join("");var i=new Date(n.date);i.setHours(parseInt(n.time.split(":")[0],10),parseInt(n.time.split(":")[1],10));var s={addon:t,kind:"Vitals"+e+"Item",with_filters:!0,start_at:i.toJSON(),tags:[{context:"members",name:a.first_name+" "+a.last_name,user_id:a.id}],filters:[{context:"members",name:a.first_name+" "+a.last_name,user_id:a.id}],data:JSON.stringify(n)};return d.createFragment(s)},t=function getSettings(t){return d.call({endpoint:"addons/"+t+"/install/settings/addonSettings",method:"GET",cache:!1}).then(function(t){return t?t.data?t.data:null:t})},e=function saveSettings(t,e){return void 0===e&&(e={}),d.call({endpoint:"addons/"+t+"/install/settings/addonSettings",method:"PUT",data:{data:JSON.stringify(e)}})},n={render:function(){var a=this,t=a.$createElement,n=a._self._c||t;return n("f7-page",{class:"vitals-elment-index-page vitals-"+a.vitalsElement+"-index-page",attrs:{id:"vitals_element__index"},on:{"page:beforein":a.onPageBeforeIn,"page:beforeout":a.onPageBeforeOut},nativeOn:{"!scroll":function(t){return a.onPageScroll(t)}}},[n("f7-navbar",[n("tommy-nav-menu"),a._v(" "),n("f7-nav-title",[a._v(a._s(a.t("title")))]),a._v(" "),n("f7-nav-right",[n("f7-link",{attrs:{href:"/"+a.addon+"/settings/","icon-only":""}},[n("i",{class:"icon vitals-element-icon-settings vitals-"+a.vitalsElement+"-icon-settings"})]),a._v(" "),n("f7-link",{attrs:{href:"/"+a.addon+"/history/","icon-only":""}},[n("i",{class:"icon vitals-element-icon-chart vitals-"+a.vitalsElement+"-icon-chart"})])],1)],1),a._v(" "),n("f7-fab",{class:"vitals-element-fab vitals-"+a.vitalsElement+"-fab",attrs:{href:"/"+a.addon+"/add/"}},[n("f7-icon",{attrs:{f7:"add"}})],1),a._v(" "),n("div",{class:"vitals-element-index-header vitals-"+a.vitalsElement+"-index-header"},[n("div",{class:"vitals-element-index-header-icon vitals-"+a.vitalsElement+"-index-header-icon"}),a._v(" "),a.data&&a.data.length?n("div",{class:"vitals-element-index-header-content vitals-"+a.vitalsElement+"-index-header-content"},[n("div",{class:"vitals-element-index-header-data vitals-"+a.vitalsElement+"-index-header-data"},[a._v(a._s(a.data[0].data.value)),n("span",[a._v(a._s(a.t("vital_unit."+(a.data[0].data.unit||0))))])]),a._v(" "),n("div",{class:"vitals-element-index-header-date vitals-"+a.vitalsElement+"-index-header-date"},[a._v(a._s(a.$moment(a.data[0].data.date).format("DD MMM YYYY"))+" "+a._s(a.data[0].data.time))])]):a._e(),a._v(" "),a.data&&!a.data.length?n("div",{class:"vitals-element-index-header-content vitals-"+a.vitalsElement+"-index-header-content"},[n("div",{class:"vitals-element-index-header-data vitals-"+a.vitalsElement+"-index-header-data"},[a._v(a._s(a.t("vital_label")))])]):a._e()]),a._v(" "),a.data&&!a.data.length?n("div",{class:"vitals-element-index-no-data vitals-"+a.vitalsElement+"-index-no-data"},[n("i",{class:"vitals-element-index-no-data-img vitals-"+a.vitalsElement+"-index-no-data-img"}),a._v(" "),n("span",[a._v(a._s(a.t("not_available")))])]):a._e(),a._v(" "),a.data&&a.data.length?n("div",{class:"vitals-element-index-cards vitals-"+a.vitalsElement+"-index-cards"},a._l(a.data,function(t,e){return n("div",{key:e,class:"vitals-element-card vitals-"+a.vitalsElement+"-card "+a.cardExtraClass(t)},[n("div",{class:"vitals-element-card-title vitals-"+a.vitalsElement+"-card-title"},[a._v(a._s(a.$moment(t.data.date).format("DD MMM YYYY"))+" "+a._s(t.data.time))]),a._v(" "),n("div",{class:"vitals-element-card-content vitals-"+a.vitalsElement+"-card-content"},[n("div",{class:"vitals-element-card-icon vitals-"+a.vitalsElement+"-card-icon"},[a.cardCustomIconName(t)?n("img",{attrs:{src:""+a.$addonAssetsUrl+a.cardCustomIconName(t)+".svg"}}):n("img",{attrs:{src:a.$addonAssetsUrl+"card-icon.svg"}})]),a._v(" "),n("div",{class:"vitals-element-card-value vitals-"+a.vitalsElement+"-card-value"},[a._v(a._s(t.data.value)+" "),n("sub",[a._v(a._s(a.t("vital_unit."+(t.data.unit||0))))])])])])})):a._e()],1)},staticRenderFns:[],props:{addon:String,vitalsElement:String,indexCardExtraClass:[String,Function],indexCardCustomIconName:[String,Function]},data:function data(){return{data:null}},mounted:function mounted(){var t=this;t.getData(),t.$events.$on(t.addon+":updateRecords",t.getData)},beforeDestroy:function beforeDestroy(){var t=this;t.$events.$off(t.addon+":updateRecords",t.getData)},methods:{cardCustomIconName:function cardCustomIconName(t){var e=this;return e.indexCardCustomIconName?"function"==typeof e.indexCardCustomIconName?e.indexCardCustomIconName(t):e.indexCardCustomIconName:""},cardExtraClass:function cardExtraClass(t){var e=this;return e.indexCardExtraClass?"function"==typeof e.indexCardExtraClass?e.indexCardExtraClass(t):e.indexCardExtraClass:""},t:function t(e,a){return this.$t(this.addon+".index."+e,a)},getData:function getData(){var e=this;a(e.addon,e.vitalsElement,e.$root.user).then(function(t){e.data=t.filter(function(t){return t.data&&t.data.value}).sort(function(t,e){var a=new Date(t.data.date),n=t.data.time.split(":"),i=n[0],s=n[1];a.setHours(parseInt(i,10),parseInt(s,10));var l=new Date(e.data.date),r=e.data.time.split(":"),o=r[0],d=r[1];return l.setHours(parseInt(o,10),parseInt(d,10)),l-a})})},onPageScroll:function onPageScroll(t){var e=this,a=e.$$(t.target).closest(".page-content");a.length&&(100<a[0].scrollTop?e.$f7router.view.$navbarEl.removeClass("vitals-element-index-navbar vitals-"+e.vitalsElement+"-index-navbar"):e.$f7router.view.$navbarEl.addClass("vitals-element-index-navbar vitals-"+e.vitalsElement+"-index-navbar"))},onPageBeforeIn:function onPageBeforeIn(){this.$f7router.view.$navbarEl.addClass("vitals-element-index-navbar vitals-"+this.vitalsElement+"-index-navbar")},onPageBeforeOut:function onPageBeforeOut(){this.$f7router.view.$navbarEl.removeClass("vitals-element-index-navbar vitals-"+this.vitalsElement+"-index-navbar")}}},i={render:function(){var a=this,t=a.$createElement,n=a._self._c||t;return n("f7-page",{class:"vitals-element-manual-add-page vitals-"+a.vitalsElement+"-manual-add-page",attrs:{id:"vitals_element__add"}},[n("f7-navbar",[n("tommy-nav-back"),a._v(" "),n("f7-nav-title",[a._v(a._s(a.t("title")))]),a._v(" "),n("f7-nav-right",[a.allowSave?n("f7-link",{attrs:{href:"#","icon-only":""},on:{click:a.save}},[n("i",{staticClass:"icon f7-icons"},[a._v("check")])]):a._e()],1)],1),a._v(" "),n("f7-list",[n("f7-list-input",{attrs:{type:"number","inline-label":"",value:a.value,min:"1",label:a.t("vital_label")},on:{input:function(t){a.value=t.target.value}}},[n("span",{staticClass:"vitals-element-input-unit",attrs:{slot:"inner"},slot:"inner"},[a._v(a._s(a.t("vital_unit.0")))])]),a._v(" "),n("f7-list-input",{attrs:{type:"text","inline-label":"","input-id":"date-input",label:a.t("date_label")}}),a._v(" "),n("f7-list-input",{attrs:{type:"text","inline-label":"","input-id":"time-input",label:a.t("time_label")}}),a._v(" "),a._l(a.manualAddExtraFields,function(e,t){return["smartselect"===e.type?n("f7-list-item",{key:t,attrs:{title:e.label(a.$t),"smart-select":"","smart-select-params":{openIn:"popover",closeOnSelect:!0}}},[n("select",{on:{change:function(t){a.onExtraFieldChange(t,e)}}},a._l(e.values(a.$t),function(t,e){return n("option",{key:e,domProps:{value:t.value}},[a._v(a._s(t.display))])}))]):a._e(),a._v(" "),"select"===e.type?n("f7-list-input",{key:t,attrs:{type:e.type,value:this[e.propName],label:e.label(a.$t),"input-style":e.inputStyle,"inline-label":""},on:{change:function(t){a.onExtraFieldChange(t,e)}}},a._l(e.values(a.$t),function(t,e){return n("option",{key:e,domProps:{value:t.value}},[a._v(a._s(t.display))])})):a._e()]})],2)],1)},staticRenderFns:[],props:{addon:String,vitalsElement:String,manualAddExtraFields:Array},data:function data(){var e={};return this.manualAddExtraFields&&this.manualAddExtraFields.forEach(function(t){e[t.propName]=t.defaultValue}),Object.assign({},{value:"",date:"",time:""},e)},computed:{allowSave:function allowSave(){return this.value&&0<this.value}},mounted:function mounted(){var a=this;a.$f7.calendar.create({inputEl:a.$el.querySelector("#date-input"),value:[new Date],on:{change:function change(t,e){a.date=new Date(e[0]),a.date.setHours(0,0,0,0)}}});var t=(new Date).getHours();t<10&&(t="0"+t);var e=(new Date).getMinutes();e<10&&(e="0"+e),a.$f7.picker.create({inputEl:a.$el.querySelector("#time-input"),value:[t.toString(),e.toString()],formatValue:function formatValue(t){return t[0]+":"+t[1]},cols:[{values:function(){for(var t=[],e=0;e<24;e+=1)e<10?t.push("0"+e):t.push(e.toString());return t}()},{divider:!0,content:":"},{values:function(){for(var t=[],e=0;e<60;e+=1)e<10?t.push("0"+e):t.push(e.toString());return t}()}],on:{change:function change(t,e){a.time=e.join(":")}}})},methods:{onExtraFieldChange:function onExtraFieldChange(t,e){this[e.propName]=t.target.value},t:function t(e,a){return this.$t(this.addon+".manual_enter."+e,a)},save:function save(){var e=this,t=e.value,a=e.date,n=e.time,i={};e.manualAddExtraFields&&e.manualAddExtraFields.forEach(function(t){i[t.propName]=e[t.propName]}),s(e.addon,e.vitalsElement,e.$root.user,Object.assign({},{value:t,date:new Date(a).toJSON(),time:n,unit:0},i)).then(function(){e.$events.$emit(e.addon+":updateRecords"),e.$f7router.back()})}}},l={receiveMessage:!1},r=[{path:"/vitals_blood_glucose/",component:n},{path:"/vitals_blood_glucose/add/",component:i},{path:"/vitals_blood_glucose/settings/",component:{render:function(){var t=this,e=t.$createElement,a=t._self._c||e;return a("f7-page",{class:"vitals-element-settings-page vitals-"+t.vitalsElement+"-settings-page",attrs:{id:"vitals_element__settings"}},[a("f7-navbar",[a("tommy-nav-back"),t._v(" "),a("f7-nav-title",[t._v(t._s(t.t("title")))])],1),t._v(" "),a("div",{class:"vitals-element-settings-header vitals-"+t.vitalsElement+"-settings-header"},[a("div",{class:"vitals-element-settings-icon vitals-"+t.vitalsElement+"-settings-icon"}),t._v(" "),a("div",{class:"vitals-element-settings-center-icon vitals-"+t.vitalsElement+"-settings-center-icon"})]),t._v(" "),a("div",{class:"vitals-element-settings-text vitals-"+t.vitalsElement+"-settings-text"},[a("p",[t._v(t._s(t.t("vital_text")))])]),t._v(" "),a("f7-list",{staticClass:"no-hairlines"},[a("f7-list-item",{attrs:{title:t.t("chat_label")}},[a("f7-toggle",{attrs:{slot:"after",checked:t.settings.receiveMessage},on:{"toggle:change":t.onMessagesChanges},slot:"after"})],1)],1)],1)},staticRenderFns:[],props:{addon:String,vitalsElement:String},data:function data(){return{settings:l}},mounted:function mounted(){var e=this;t(e.addon).then(function(t){t&&(e.settings=t,l=e.settings)})},methods:{t:function t(e,a){return this.$t(this.addon+".settings."+e,a)},onMessagesChanges:function onMessagesChanges(t){this.settings.receiveMessage=t,l=this.settings,e(this.addon,this.settings)}}}},{path:"/vitals_blood_glucose/history/",component:{render:function(){var e=this,t=e.$createElement,a=e._self._c||t;return a("f7-page",{class:"vitals-element-history-page vitals-"+e.vitalsElement+"-history-page",attrs:{id:"vitals_element__history"}},[a("f7-navbar",[a("tommy-nav-back"),e._v(" "),a("f7-nav-title",[e._v(e._s(e.t("title")))])],1),e._v(" "),a("f7-block",[a("f7-segmented",[a("f7-button",{attrs:{active:"day"===e.range},on:{click:function(t){e.range="day"}}},[e._v(e._s(e.t("date_options.0")))]),e._v(" "),a("f7-button",{attrs:{active:"week"===e.range},on:{click:function(t){e.range="week"}}},[e._v(e._s(e.t("date_options.1")))]),e._v(" "),a("f7-button",{attrs:{active:"month"===e.range},on:{click:function(t){e.range="month"}}},[e._v(e._s(e.t("date_options.2")))])],1)],1),e._v(" "),a("div",{class:"vitals-element-chart-clicked vitals-"+e.vitalsElement+"-chart-clicked"},[a("span",[e._v(e._s(e.clickedDate))]),e._v(" "),a("span",[e._v(e._s(e.clickedValue))]),e._v(" "),e.clickedExtra?a("span",{domProps:{innerHTML:e._s(e.clickedExtra)}}):e._e()]),e._v(" "),e.data&&e.data.length?["day"===e.range?a("div",{key:"chart-day",class:"vitals-element-chart vitals-"+e.vitalsElement+"-chart"},[a("div",{ref:"chartDay"})]):e._e(),e._v(" "),"week"===e.range?a("div",{key:"chart-week",class:"vitals-element-chart vitals-"+e.vitalsElement+"-chart"},[a("div",{ref:"chartWeek"})]):e._e(),e._v(" "),"month"===e.range?a("div",{key:"chart-month",class:"vitals-element-chart vitals-"+e.vitalsElement+"-chart"},[a("div",{ref:"chartMonth"})]):e._e()]:e._e()],2)},staticRenderFns:[],props:{addon:String,vitalsElement:String,chartType:{type:String,default:"line"},chartColor:{type:String,default:"#5FA81A"},chartMarkerColor:String,chartClickedExtra:Function,chartWeekSumsDays:Boolean,chartMonthSumsDays:Boolean},data:function data(){return{data:null,clicked:null,range:"day"}},mounted:function mounted(){var i=this,t=(new Date).setMonth((new Date).getMonth()-1),e=new Date;a(i.addon,i.vitalsElement,i.$root.user,{dateFrom:t,dateTo:e}).then(function(t){i.data=(t||[]).sort(function(t,e){var a=i.itemDate(t),n=i.itemDate(e);return a.getTime()-n.getTime()}),i.$nextTick(function(){i.initChart()})})},watch:{range:function range(){var t=this;t.clicked=null,t.$nextTick(function(){t.initChart()})}},computed:{clickedDate:function clickedDate(){var t=this;return t.clicked?t.chartWeekSumsDays&&"week"===t.range?t.$moment(t.clicked.x).format("DD MMM YYYY"):t.chartMonthSumsDays&&"month"===t.range?t.$moment(t.clicked.x).format("DD MMM YYYY"):t.$moment(t.clicked.x).format("DD MMM YYYY HH:mm"):""},clickedValue:function clickedValue(){var t=this;if(!t.clicked)return"";var e=t.data[t.clicked.id];return t.clicked.y+" "+t.t("vital_unit."+e.data.unit)},clickedExtra:function clickedExtra(){var t=this;if(!t.clicked)return"";if(t.chartClickedExtra){var e=t.data[t.clicked.id];return t.chartClickedExtra(e,t.$t)}return""},todayValues:function todayValues(){var a=this;if(!a.data)return null;var e=new Date;return e.setHours(0,0,0,0),a.data.filter(function(t){return a.itemDate(t).getTime()>e.getTime()}).map(function(t){var e=a.itemDate(t);return{y:parseInt(t.data.value,10),x:e,id:a.data.indexOf(t)}})},weekValues:function weekValues(){var a=this;if(!a.data)return null;var e=new Date;e.setHours(0,0,0,0),e.setMonth(e.getMonth(),e.getDate()-7);var t=a.data.filter(function(t){return a.itemDate(t).getTime()>e.getTime()});return a.chartWeekSumsDays?a.sumValuesByDay(t):t.map(function(t){var e=a.itemDate(t);return{y:parseInt(t.data.value,10),x:e,id:a.data.indexOf(t)}})},monthValues:function monthValues(){var a=this;if(!a.data)return null;var e=new Date;e.setHours(0,0,0,0),e.setMonth(e.getMonth()-1,e.getDate());var t=a.data.filter(function(t){return a.itemDate(t).getTime()>e.getTime()});return a.chartWeekSumsDays?a.sumValuesByDay(t):t.map(function(t){var e=a.itemDate(t);return{y:parseInt(t.data.value,10),x:e,id:a.data.indexOf(t)}})}},methods:{sumValuesByDay:function sumValuesByDay(t){var a=this,n=[],i=a.itemDate(t[0]);i.setHours(0,0,0,0);var s=0;return t.forEach(function(t){var e=a.itemDate(t);e.setHours(0,0,0,0),e.getTime()!==i.getTime()&&(s+=1,i=e),n[s]||(n[s]={x:i,y:0,id:a.data.indexOf(t)}),n[s].y+=parseInt(t.data.value,10)}),n},itemDate:function itemDate(t){var e=new Date(t.data.date),a=parseInt(t.data.time.split(":")[0],10),n=parseInt(t.data.time.split(":")[1],10);return e.setHours(a,n),e},t:function t(e,a){return this.$t(this.addon+".history."+e,a)},initChart:function initChart(){var t=this,e=t.range;if(t.data&&t.data.length){var a={chart:{type:t.chartType||"line"},credits:{enabled:!1},legend:{enabled:!1},title:null,tooltip:{enabled:!1},xAxis:{type:"datetime"},yAxis:{title:null},time:{timezoneOffset:(new Date).getTimezoneOffset()},plotOptions:{line:{marker:{enabled:!0,fillColor:t.chartMarkerColor||t.chartColor}}}},n={color:t.chartColor,cursor:"pointer",point:{events:{click:function click(){t.clicked=this},select:function select(){t.clicked=this}}}};"day"===e&&t.$highcharts.chart(t.$refs.chartDay,Object.assign({},a,{series:[Object.assign({},n,{data:t.todayValues})]})),"week"===e&&t.$highcharts.chart(t.$refs.chartWeek,Object.assign({},a,{series:[Object.assign({},n,{data:t.weekValues})]})),"month"===e&&t.$highcharts.chart(t.$refs.chartMonth,Object.assign({},a,{series:[Object.assign({},n,{data:t.monthValues})]}))}}}}}];return r.forEach(function(t){t.options={props:{addon:"vitals_blood_glucose",vitalsElement:"blood_glucose",indexCardCustomIconName:function indexCardCustomIconName(t){return t&&t.data&&t.data.state?"card-icon-"+t.data.state:""},manualAddExtraFields:[{type:"smartselect",propName:"state",defaultValue:"none",label:function label(t){return t("vitals_blood_glucose.manual_enter.vital_variants_label")},values:function values(t){return[{value:"none",display:t("vitals_blood_glucose.manual_enter.vital_variants.0")},{value:"beforemeal",display:t("vitals_blood_glucose.manual_enter.vital_variants.1")},{value:"aftermeal",display:t("vitals_blood_glucose.manual_enter.vital_variants.2")}]}}],chartColor:"#FEBFB8",chartMarkerColor:"#FD7E70",chartClickedExtra:function chartClickedExtra(t,e){var a=t.data.state;return('\n          <span class="vitals-blood_glucose-chart-clicked-state-icon-'+a+'"></span>\n          <span class="vitals-blood_glucose-chart-clicked-state-text">'+e("vitals_blood_glucose.history.vital_variants."+["none","beforemeal","aftermeal"].indexOf(a))+"</span>\n        ").trim()}}}}),r}();