// var app = new Framework7({
//         init: false
//     }),
//     $ = Dom7,
//     view = app.f7.addView('.view-main', {
//         dynamicNavbar: true
//     })
//     ;

require(['app','api','util','cache','tplManager','moment'],
function (app,api,util,cache,tplManager,moment) {

  app.f7.onPageInit('blood_chart', function(page){
      var $page = $$(page.container),
          $chartValues = $page.find('.values strong'),
          chartLabels = {
              day: [
                  ['','2:00'],
                  ['','4:00'],
                  ['','6:00'],
                  ['','8:00'],
                  ['','10:00'],
                  ['','12:00'],
                  ['','14:00']
              ],
              week: [
                  ['','Mon'],
                  ['','Tue'],
                  ['','Wed'],
                  ['','Thu'],
                  ['','Fri'],
                  ['','Sat'],
                  ['','Sun']
              ],
              month: [
                  ['','01.04'],
                  ['','01.05'],
                  ['','01.06'],
                  ['','01.07'],
                  ['','01.08'],
                  ['','01.09'],
                  ['','01.10'],
              ],
          },
          chart;

      function chartValues(){
          for (var i = 0; i < 3; i++)
              $chartValues[i].innerHTML = arguments[0][i];
      }

      $page
          .on('click', '.switch-btn', function(){
              var $el = $$(this);
              chartValues(['0', '0', '0']);
              $el.addClass('active').siblings().removeClass('active');
              chart.data.labels = chartLabels[$el.data('type')];
              chart.update();
          });

      chart = new Chart($page.find('canvas')[0].getContext('2d'), {
          type: 'line',
          data: {
              labels: chartLabels.day,
              datasets: [
                  {
                      label: '',
                      borderWidth: 2,
                      borderColor: 'rgba(95,168,26,.5)',
                      backgroundColor: 'rgba(95,168,26,.5)',
                      pointBackgroundColor: 'rgba(95,168,26,1)',
                      pointBorderColor: 'rgba(95,168,26,0)',
                      pointBorderWidth: 0,
                      pointRadius: 3,
                      pointHoverBorderColor: 'rgba(95,168,26,.5)',
                      pointHoverRadius: 6,
                      pointHoverBorderWidth: 12,
                      lineTension: 0,
                      fill: false,
                      data: [120, 115, 110, 118, 120, 117, 101],
                  },
                  {
                      label: '',
                      borderWidth: 2,
                      backgroundColor: 'rgba(245,166,35,.5)',
                      borderColor: 'rgba(245,166,35,.5)',
                      pointBackgroundColor: 'rgba(245,166,35,1)',
                      pointBorderColor: 'rgba(95,168,26,0)',
                      pointBorderWidth: 0,
                      pointRadius: 3,
                      pointHoverBorderColor: 'rgba(245,166,35,.5)',
                      pointHoverRadius: 6,
                      pointHoverBorderWidth: 12,
                      lineTension: 0,
                      fill: false,
                      data: [81, 78, 85, 82, 90, 82, 80],
                  },
                  {
                      label: '',
                      borderWidth: 2,
                      backgroundColor: 'rgba(255,69,0,.5)',
                      borderColor: 'rgba(255,69,0,.5)',
                      pointBackgroundColor: 'rgba(255,69,0,1)',
                      pointBorderColor: 'rgba(95,168,26,0)',
                      pointBorderWidth: 0,
                      pointRadius: 3,
                      pointHoverBorderColor: 'rgba(255,69,0,.5)',
                      pointHoverRadius: 6,
                      pointHoverBorderWidth: 12,
                      lineTension: 0,
                      fill: false,
                      data: [75, 72, 78, 75, 79, 70, 65]
                  }
              ]
          },
          options: {
              responsive: true,
              tooltips: {
                  enabled: false,
                  custom: function(tooltip){
                      if (typeof tooltip !== 'undefined' && typeof tooltip.dataPoints !== 'undefined') {
                          var arr = [];
                          for (var i = 0; i < 3; i++)
                              arr.push(tooltip.dataPoints[i].yLabel);
                          chartValues(arr);
                      }
                  },
                  intersect: false,
                  mode: 'index'

              },
              hover: {
                  mode: 'index',
                  intersect: false
              },
              legend: { display: false },
              scales: {
                  xAxes: [{
                      distribution: 'linear',
                      beginAtZero: false,
                      ticks: {
                          autoSkip: false,
                      },
                      scaleLabel: { display: false },
                      gridLines: {
                          lineWidth: 1,
                          display: true,
                          borderDash: [5, 5],
                          drawTicks: false,
                          drawBorder: true,
                          color: 'rgba(204,204,204,1)'
                      },
                  }],
                  yAxes: [{
                      distribution: 'linear',
                      beginAtZero: false,
                      scaleLabel: { display: false },
                      ticks: {
                          autoSkip: false,
                          min: 40,
                          max: 160,
                          stepSize: 20,
                          callback: function(value) {
                              return value + '   ';
                          }
                      },
                      gridLines: {
                          display: true,
                          borderDash: [5, 5],
                          drawTicks: false,
                          drawBorder: true,
                          color: 'rgba(204,204,204,1)'
                      }
                  }]
              },
          }
      });
  });

  app.f7.onPageInit('blood_main', function(page){
      var $page = $$(page.container);
      $page.once('click', '.card', function(){
          view.router.loadPage('index-empty.html');
      });
  });

  app.f7.onPageInit('blood_measuring', function(page){
      var $page = $$(page.container);
      setTimeout(function(){
          $page.find('.measuring.empty').removeClass('empty');
          setTimeout(function(){
              $page.find('.measuring').removeClass('measuring')
          }, 1500);
      }, 1500);

      $page.once('click', '.restart', function(){
          view.router.reloadPage('measuring.html');
      });
      $page.once('click', '.save', function(){
          view.router.loadPage('main.html');
      });
  });

  app.f7.onPageInit('blood_measurement-add', function(page){
      var $page = $$(page.container);
      $page.find('.keypad').each(function(){
          app.f7.keypad({
              input: $$(this),
              valueMaxLength: 5,
              dotButton: false,
              toolbar: false
          });
      });
      $page.on('click', 'input.date.right', function(){
          var calendar, $el = $$(this);

          $el.blur();

          $$(document)
              .once('modal:opened', function(e){
                  $$(e.target).addClass('modal-preloader-in');
              })
              .once('modal:open', function(e){
                  $$(e.target).addClass('modal-calendar');
                  var monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August' , 'September' , 'October', 'November', 'December'];

                  calendar = app.f7.calendar({
                      container: '#calendar-container',
                      value: [new Date()],
                      weekHeader: true,
                      dateFormat: 'DD',
                      toolbarTemplate:
                          '<div class="toolbar calendar-custom-toolbar">' +
                          '<div class="toolbar-inner">' +
                          '<div class="left">' +
                          '<a href="#" class="link icon-only"><i class="icon f7-icons">chevron_left</i></a>' +
                          '</div>' +
                          '<div class="center"></div>' +
                          '<div class="right">' +
                          '<a href="#" class="link icon-only"><i class="icon f7-icons">chevron_right</i></a>' +
                          '</div>' +
                          '</div>' +
                          '</div>',
                      onOpen: function (p) {
                          $$('.calendar-custom-toolbar .center').text(monthNames[p.currentMonth] +', ' + p.currentYear);
                          $$('.calendar-custom-toolbar .left .link').on('click', function () {
                              calendarInline.prevMonth();
                          });
                          $$('.calendar-custom-toolbar .right .link').on('click', function () {
                              calendarInline.nextMonth();
                          });
                      }
                  });
              });

          app.f7.modal({
              text: '<div id="calendar-container"></div>',
              afterText: '<div class="modal-preloader"><span class="preloader"></span></div>',
              buttons: [
                  {
                      text: 'Cancel'
                  },
                  {
                      text: 'Confirm',
                      bold: true,
                      onClick: function () {
                          $el.val(moment(calendar.value[0]).format('DD MMM. YYYY'));
                      }
                  },
              ]
          });
      });
      $page.on('click', 'input.time.right', function(){
          var timepicker, $el = $$(this);

          $el.blur();

          $$(document)
              .once('modal:opened', function(e){
                  $$(e.target).addClass('modal-preloader-in');
              })
              .once('modal:open', function(e){
                  var today = new Date();

                  $$(e.target).addClass('modal-timepicker');

                  timepicker = app.f7.picker({
                      container: '#timepicker-container',
                      toolbar: false,
                      rotateEffect: false,

                      value: [(today.getHours() < 10 ? '0' + today.getHours() : today.getHours()), (today.getMinutes() < 10 ? '0' + today.getMinutes() : today.getMinutes())],

                      formatValue: function (p, values, displayValues) {
                          return values[0] + ':' + values[1];
                      },
                      cols: [
                          {
                              values: (function () {
                                  var arr = [];
                                  for (var i = 0; i <= 23; i++) { arr.push(i < 10 ? '0' + i : i); }
                                  return arr;
                              })(),
                          },
                          {
                              divider: true,
                              content: ':'
                          },
                          {
                              values: (function () {
                                  var arr = [];
                                  for (var i = 0; i <= 59; i++) { arr.push(i < 10 ? '0' + i : i); }
                                  return arr;
                              })(),
                          }
                      ]
                  });
              });

          app.f7.modal({
              title: 'Time',
              text: '<div id="timepicker-container"></div>',
              afterText: '<div class="modal-preloader"><span class="preloader"></span></div>',
              buttons: [
                  {
                      text: 'Done',
                      bold: true,
                      onClick: function () {
                          //$el.val(moment(calendar.value[0]).format('DD MMM. YYYY'));
                      }
                  },
              ]
          });
      });
  });

  $$(document)
      .on('click', '.measurement-search', function(e){
          e.preventDefault();

          var $el = $$(this), $next = $el.next();

          $el.prop('hidden', true);
          $next.prop('hidden', false);

          setTimeout(function(){
              $next.nextAll().prop('hidden', false);
              setTimeout(function(){
                  $next.nextAll().prop('hidden', true);

                  $el.prop('hidden', false);
                  $next.prop('hidden', true);
              }, 2000);
          }, 1000);
      });

  // app.f7.init();
});
