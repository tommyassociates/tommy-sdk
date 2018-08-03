import API from '../api';

const tommy = window.tommy;

const HistoryController = {
  init (page) {
    HistoryController.bind(page);
    HistoryController.loadHistory();
  },
  bind (page) {
    HistoryController.page = page;
  },
  loadHistory() {
    const page = HistoryController.page;
    const $page = $$(page.container);
    const f7 = tommy.app.f7;

    API.getOrdersHistory().then((orders) => {
      orders.forEach((order) => {
        order.statusKey = `history.status_${order.canceled ? 'canceled' : order.status}`;
        if (order.data && order.data.date) {
          if (!Number.isNaN(parseInt(order.data.date, 10))) {
            order.data.date = parseInt(order.data.date, 10);
          }
        }
      });
      const ordersSorted = orders.sort((a, b) => {
        if (b.id > a.id) return 1;
        if (b.id < a.id) return -1;
        return 0;
      });
      tommy.tplManager.renderInline(
        'nurse_booking__historyTemplate',
        { orders: ordersSorted },
      );
    })
  },

  uninit () {
    HistoryController.page = null;
    delete HistoryController.page;
  },
};

export default HistoryController
