// TODO: pass this into the ext scope
var BONUS_MULTIPLIERS = {
  'drink': 100
};

(function() {
  var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  Date.prototype.getMonthName = function() {
    return months[this.getMonth()];
  };

  Date.prototype.getDayName = function() {
    return days[this.getDay()];
  };

  Date.prototype.getDayShortName = function() {
    return this.getDayName().substring(0, 3);
  };
})();

function createItemRecord(type, quantity, time) {
  time || ((new Date()).getTime() / 1000);
  var data = JSON.stringify({
    type: 'drink',
    quantity: quantity
  });
  T.api.create('/settings', $.extend(T.env.account, {
    scope: 'barbonus:item',
    data: data,
    created_at: time}), function(err, res) {
      console.log('created item record', err, res);
  });
}

// Create demo fixtures
function createFixtures() {
  var start = new Date("12/20/2015"),
  // var start = new Date("1/20/2016"),
    end = new Date();

  console.log(start, end);
  while(start < end) {
    console.log(start);

    // set a quantity between 1 and 5
    var quanitity = Math.floor(Math.random() * 5) + 1;
    createItemRecord('drink', quanitity, start);

    // incrememnt date
    start = new Date(start.setDate(start.getDate() + 1));
  }
}

function loadItems(start, end, callback) {
  var now = new Date();

  // last 7 days by default
  start = start || now.setDate(now.getDate() - 7),
  end = end || now;

  T.api.get('/settings', $.extend(T.env.account, {
      scope: 'barbonus:item',
      start_at: start,
      end_at: end }),
    function(err, res) {
      console.log('loaded item records', err, res);
      if (callback)
        callback(res);
  });
}

function addBonusToUI(bonus) {
  console.log('addBonusToUI', bonus);

  // <li>
  //   <a href="#" class="item-link item-content">
  //     <div class="item-media"><img src="..." width="80"></div>
  //     <div class="item-inner">
  //       <div class="item-title-row">
  //         <div class="item-title">Yellow Submarine</div>
  //         <div class="item-after">$15</div>
  //       </div>
  //       <div class="item-subtitle">Beatles</div>
  //       <div class="item-text">Lorem ipsum dolor sit amet...</div>
  //     </div>
  //   </a>
  // </li>

  var itemDate = '<span class="day">' +
      bonus.date.getDayShortName() +
    '</span>' +
    '<span class="date">' +
      bonus.date.getDay() +
    '</span>';

  var itemTotal = '<span class="total ';
  if (bonus.total > 0)
    itemTotal += 'plus">+ ';
  else
    itemTotal += 'minus">- ';
  itemTotal += bonus.total;
  itemTotal += '</span>';

  var itemRows = '';
  for (type in bonus.items) {
    var item = bonus.items[type];
    itemRows += '<div class="item-text">' + item.quantity  + ' ' + type  + '</div>';
  }

  // Create the list item ' + bonus.id + '
  var navItem = $('<li><a href="#" class="item-link item-content">' +
    '<div class="item-media">' + itemDate + '</div>' +
    '<div class="item-inner">' +
      '<div class="item-title-row">' +
        '<div class="item-title">' + itemTotal + '</div>' +
      '</div>' +
      itemRows +
    '</div></a></li>');

  navItem.find('a').click(function(){
    // T.env.f7App.alert('Would you like to poke ' + employee.user.first_name + '?',
    //             'Confirm', function() {
    //   pokeUser(employee.user);
    // });
    return false;
  });

  // Add the sidebar menu
  $('#ext-barbonus-employee-bonuses ul').append(navItem);
}

// Calculate bonuses
// function calculateBonus(bonus) {
//   for (var i = 0; i < bonus.items.length; i++) {
//     console.log('calculate bonuses', bonus.value);
//     bonus.value += (bonus.items[i].data.quantity *
//       BONUS_MULTIPLIERS[bonus.items[i].data.type]);
//   }
//     console.log('calculate bonuses', bonus.value);
//   return bonus;
// }

function loadBonuses(start, end, callback) {
  var bonuses = {}
  loadItems(start, end, function(items) {
    if (items) {
      for (var i = 0; i < items.length; i++) {
        var item = items[i],
          createdAt = new Date(item.created_at),
          date = (createdAt.getMonth() + 1) + '/' +
            createdAt.getDate() + '/' +
            createdAt.getFullYear(),
          data = JSON.parse(item.data),
          amount = (data.quantity * BONUS_MULTIPLIERS[data.type]);
        console.log('item', item);
        if (!bonuses[date])
          bonuses[date] = { total: 0, date: createdAt, items: {} };
        if (!bonuses[date].items[data.type])
          bonuses[date].items[data.type] = { quantity: 0, total: 0 };
        bonuses[date].items[data.type].quantity += data.quantity;
        bonuses[date].items[data.type].total += amount;
        bonuses[date].total += amount;
      }

      // Calculate bonuses and add them to the UI
      for (date in bonuses) {
        // var bonus = bonuses[date];
        addBonusToUI(bonuses[date]);
        // bonuses[date] = bonus;
      }
    }
    // bonus = calculateBonus(bonus);
    // console.log('loaded items', bonuses);
  });
}

loadBonuses();

// createFixtures();


// // Show a loading indicator
// T.env.f7App.showPreloader('Loading Employees...');
//
// // Get a list of accessible account employees from the API
// T.api.get('/employees', {}, function(err, res) {
//   T.env.f7App.hidePreloader();
//
//   console.log('employees response', err, res);
//   if (err) {
//     alert('API error: Could not fetch employees');
//     return;
//   }
//
//   // Add each of the users to the view
//   for (i = 0; i < res.length; i++) {
//     var employee = res[i];
//
//     // Create the list item
//     var navItem = $('<li><a href="#' + employee.id + '" class="item-link">' +
//       '<div class="item-content">' +
//         '<div class="item-inner">' +
//           '<div class="item-title">' +
//             employee.user.first_name + ' ' + employee.user.last_name +
//           '</div>' +
//         '</div>' +
//       '</div></a></li>');
//
//     navItem.find('a').click(function(){
//       T.env.f7App.alert('Would you like to poke ' + employee.user.first_name + '?',
//                   'Confirm', function() {
//         pokeUser(employee.user);
//       });
//       return false;
//     });
//
//     // Add the sidebar menu
//     $('#ext-poke-users ul').append(navItem);
//   }
// });
//
// function pokeUser(receiver) {
//   T.api.create('/chat_messages', {
//       receiver_id: receiver.id,
//       message: 'You\'ve been Poked!'}, function(err, res) {
//     console.log('send message response', err, res);
//     if (err) {
//       alert('API error: Could not send message');
//       return;
//     }
//
//     T.env.f7App.addNotification({
//       message: ('You have poked ' + receiver.first_name + '!')
//     });
//   });
// }
