<script>
import API from "../api";
import currencyList from "../utils/currency-list.js";
import currency from "../utils/filter/currency";
import number from "../utils/filter/number";

export default {
  methods: {
    $_currency: currency,
    $_number: number,
    formatCurrency(
      value,
      symbol_code = API.main_page.$data.settings.main.currency,
      dec,
      options = {}
    ) {
      self = this;
      const symbol = self.currencyList[symbol_code];
      return self.$_currency(value, symbol, dec, options);
    },
    formatNumber(value, format = '0,0', options = {}) {
        if(value === undefined) return '';
      return self.$_number(value, format, options);
    }
  },
  computed: {
    getCurencySimbol() {
      self = this;
      return self.currencyList[API.main_page.$data.settings.main.currency];
    }
  },
  data() {
    return {
      currencyList
    };
  }
};
</script>