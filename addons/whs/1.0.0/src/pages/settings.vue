<template>
  <f7-page>
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{$t('whs.settings.title')}}</f7-nav-title>
    </f7-navbar>

    <f7-list class="no-margin no-hairlines whs-settings-list">
      <f7-list-input
        type="text"
        :label="$t('whs.common.name_label')"
        inline-label
        :value="new_name || settings.main.name"
        @input="new_name = $event.target.value"        
      >  
        <f7-link slot="inner-end" v-if="new_name != settings.main.name && new_name !== null" @click="updateMainSettings('name', new_name)">   
          <f7-icon f7="check"  />
        </f7-link>
      </f7-list-input>
      <f7-list-item
        :title="$t('whs.settings.currency')"
        smart-select
        :smart-select-params="{
          openIn: 'popup',
          pageBackLinkText: '',
          popupCloseLinkText: '',
          renderItem(item) {return renderCurrencyItem(this, item)},
          closeOnSelect: true,
        }"
      >
        <select name="currency" @change="updateMainSettings('currency',$event.target.value)">
          <option
            v-for="(label, code) in currencyList"
            :key="code"
            :value="code"
            :selected="code === settings.main.currency"
          >{{code}}</option>
        </select>

      </f7-list-item>
      <f7-list-item
        link
        :title="$t('whs.settings.date')"
        :after="demoDate"
        popup-open=".whs-date-format-popup"
      />
      <f7-list-item
        link
        :title="$t('whs.settings.time')"
        :after="demoTime"
        popup-open=".whs-time-format-popup"
      />
      <f7-list-item
        link
        :title="$t('whs.settings.export')"
      />
      <f7-list-item
        link
        :title="$t('whs.settings.import')"
      />
      <f7-list-item
        link
        :title="$t('whs.settings.permissions')"
      />
      <f7-list-item
        link
        :title="$t('whs.settings.customers')"
      />
      <f7-list-item
        link
        :title="$t('whs.settings.integrations')"
      />
      <f7-list-item
        divider
        :title="$t('whs.settings.preferences_title')"
      />
      <f7-list-item
        link="/whs/settings/items/"
        :title="$t('whs.settings.items')"
      />
      <f7-list-item
        link="/whs/settings/tags/"
        :title="$t('whs.settings.tags')"
      />
      <f7-list-item
        link="/whs/settings/locations/"
        :title="$t('whs.settings.locations')"
      />
      <f7-list-item
        link="/whs/settings/activities/"
        :title="$t('whs.settings.activities')"
      />
      <f7-list-item
        link
        :title="$t('whs.settings.activity_dashboard')"
      />
    </f7-list>
    <f7-list class="no-hairlines whs-settings-list">
      <f7-list-item
        link
        :title="$t('whs.settings.subscriptions')"
      />
    </f7-list>

    <f7-popup 
      class="whs-date-format-popup"
      @popup:open="editParam = settings.date"
    >
      <f7-page>
        <f7-navbar>
          <f7-nav-left>
            <f7-link popup-close class="icon-only"><i class="icon icon-back"></i></f7-link>
          </f7-nav-left>
          <f7-nav-title>{{$t('whs.settings.date')}}</f7-nav-title>
          <f7-nav-right>
            <f7-link icon-only popup-close @click="updateMainSettings('date', editParam)">
              <f7-icon f7="check" />
            </f7-link>
          </f7-nav-right>
        </f7-navbar>

        <f7-list class="no-margin no-hairlines whs-settings-list">
          <f7-list-input
            type="text"
            :label="$t('whs.settings.date_format_format')"
            inline-label
            :value="editParam"
            @input="editParam = $event.target.value"
          />
          <f7-list-item
            :title="$t('whs.settings.date_format_demo')"
            :after="$moment().format(editParam)"
          />
          <f7-list-item
            divider
            :title="$t('whs.settings.date_format_values')"
          />
          <f7-list-item
            v-for="(token) in momentDateTokens"
            :key="token"
            :title="token"
            :after="$moment().format(token)"
          ></f7-list-item>

          <f7-list-item
            divider
            :title="$t('whs.settings.date_format_examples')"
          />
          <f7-list-item
            v-for="(token) in momentDateExamples"
            :key="token"
            :title="token"
            :after="$moment().format(token)"
            @click="editParam = token"
          ></f7-list-item>
        </f7-list>
      </f7-page>
    </f7-popup>

    <f7-popup 
      class="whs-time-format-popup"
      @popup:open="editParam = settings.time"
    >
      <f7-page>
        <f7-navbar>
          <f7-nav-left>
            <f7-link popup-close class="icon-only"><i class="icon icon-back"></i></f7-link>
          </f7-nav-left>
          <f7-nav-title>{{$t('whs.settings.time')}}</f7-nav-title>
          <f7-nav-right>
            <f7-link icon-only popup-close @click="updateMainSettings('time', editParam)">
              <f7-icon f7="check" />
            </f7-link>
          </f7-nav-right>
        </f7-navbar>
        <f7-list class="no-margin no-hairlines whs-settings-list">
          <f7-list-input
            type="text"
            :label="$t('whs.settings.time_format_format')"
            inline-label
            :value="editParam"
            @input="editParam = $event.target.value"
          />
          <f7-list-item
            :title="$t('whs.settings.time_format_demo')"
            :after="$moment().format(editParam)"
          />
          <f7-list-item
            divider
            :title="$t('whs.settings.time_format_values')"
          />
          <f7-list-item
            v-for="(token) in momentTimeTokens"
            :key="token"
            :title="token"
            :after="$moment().format(token)"
          ></f7-list-item>

          <f7-list-item
            divider
            :title="$t('whs.settings.time_format_examples')"
          />
          <f7-list-item
            v-for="(token) in momentTimeExamples"
            :key="token"
            :title="token"
            :after="$moment().format(token)"
            @click="editParam = token"
          ></f7-list-item>
        </f7-list>
      </f7-page>
    </f7-popup>
  </f7-page>
</template>
<script>
import API from "../api";
import currencyList from '../utils/currency-list';

export default {
  components: {
  },
  data() {
    return {
      currencyList,
      momentDateTokens: ['YYYY', 'YY', 'M', 'MM', 'MMM', 'MMMM', 'D', 'DD', 'Do', 'ddd', 'dddd'],
      momentDateExamples: ['ddd, DD MMMM YYYY', 'DD-MMM-YYYY', 'DD-MM-YYYY', 'M/D/YYYY', 'YYYY-MM-DD'],
      momentTimeTokens: ['HH', 'H', 'h', 'hh', 'a', 'A', 'm', 'mm', 's', 'ss', 'Z', 'ZZ'],
      momentTimeExamples: ['h:mm A', 'HH:mm', 'h:mm:ss A','h:mm:s A', 'HH-mm'],
      settings: API.main_page.$data.settings,
      editParam: null,
      new_name: null,
    };
  },
  created() {

  },
  computed: {
    demoDate(){
      self = this;      
      return self.$moment(new Date()).format(self.settings.main.date)
    },
    demoTime(){
      self = this;      
      return self.$moment(new Date()).format(self.settings.main.time)
    }
  },
  methods: {
    renderCurrencyItem(ss, item) {
      const self = this;
      return `
        <li>
          <label class="item-radio item-content">
            <input type="radio" name="${item.inputName}" value="${item.value}" ${item.selected ? 'checked' : ''}>
            <i class="icon icon-radio"></i>
            <div class="item-inner">
              <div class="item-title">${item.text}</div>
              <div class="item-after">${currencyList[item.text]}</div>
            </div>
          </label>
        </li>
      `;
    },
    updateMainSettings(target, val){
      self = this;
      self.editParam = null;
      self.settings.main[target] = val;
      API.saveSettings('main',self.settings.main);
    }
  },
  beforeDestroy() {
    const self = this;
  },
  mounted() {
    const self = this;
  }
};
</script>
