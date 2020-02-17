<template>
  <f7-page id="availability__index" @page:afterin="onPageAfterIn" @page:beforeout="onPageBeforeOut">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{$t('availability.index.title', 'Availabilities')}}</f7-nav-title>
      <f7-nav-right v-if="formChanged">
        <f7-link @click="save" icon-f7="check"></f7-link>
      </f7-nav-right>
    </f7-navbar>

    <div class="refresh-panel" v-if="showRefreshPanel">
      {{$t('availability.index.last_updated', 'Last updated')}}:
      <span class="time">{{refreshPanelText}}</span>
      <a href="#" class="refresh" @click="loadAvailabilities">{{$t('availability.index.refresh', 'Refresh')}}</a>
    </div>

    <f7-list class="no-margin-top" no-hairlines v-if="!isNurse">
      <f7-list-item
        :title="$t('availability.index.available_button')"
      >
        <f7-toggle slot="after" :checked="availableForWork" @change="changeAvailableForWork($event.target.checked)"></f7-toggle>
      </f7-list-item>
    </f7-list>

    <f7-list class="no-margin" no-hairlines v-if="items">
      <f7-list-item
        v-for="(item, key) in items"
        :key="key"
      >
        <div class="availability__list-date">
          <strong>{{dayOrToday(item.start_at)}}</strong>
          <span>{{formatDate(item.start_at, 'Do MMM')}}</span>
        </div>
        <div class="availability__toggle-container">
          <!-- item-title -->
          <a
            href="#"
            :class="availabilityClass('am', item.data)"
            class="availability__toggle-availability"
            @click="toggle(item, key, 'am')"
          >
            <span v-html="$t('availability.word.am', 'am')"></span>
          </a>
          <a
            href="#"
            class="availability__toggle-availability"
            :class="availabilityClass('pm', item.data)"
            @click="toggle(item, key, 'pm')"
          >
            <span v-html="$t('availability.word.pm', 'pm')"></span>
          </a>
          <a
            href="#"
            class="availability__toggle-availability"
            :class="availabilityClass('nd', item.data)"
            @click="toggle(item, key, 'nd')"
          >
            <span v-html="$t('availability.word.nd', 'nd')"></span>
          </a>
        </div>
      </f7-list-item>
    </f7-list>
  </f7-page>
</template>
<script>
  export default {
    data() {
      const self = this;
      const items = {};
      const startAt = self.$moment().subtract(1, 'day').startOf('day');
      const endAt = self.$moment().add(2, 'weeks').endOf('week');
      const current = startAt.clone();
      const roles = self.$root.account.roles;
      const isNurse = !roles || (roles && roles.length === 0) || (roles && (roles.indexOf('Nurse') >= 0 || roles.indexOf('Employee') >= 0));
      while (current.add(1, 'day') < endAt) {
        const date = current.format('YYYY-MM-DD');
        if (!items[date]) {
          items[date] = {
            start_at: current.format(),
            data: {},
          };
        }
      }
      const actor_id = self.$f7route.query.actor_id;
      let availableForWork = false;
      if (self.$root.teamMembers) {
        self.$root.teamMembers.forEach((member) => {
          const userId = actor_id || self.$root.user.id;
          if (member.user_id === parseInt(userId, 10)) {
            availableForWork = member.tags.indexOf('Available For Work') >= 0;
          }
        });
      }
      return {
        startAt,
        endAt,
        items,
        formChanged: false,
        lastUpdated: null,
        showRefreshPanel: false,
        refreshPanelTimeout: null,
        refreshPanelInterval: null,
        refreshPanelText: '1 min ago',
        actor_id,
        availableForWork,
        isNurse,
      };
    },
    methods: {
      changeAvailableForWork(available) {
        const self = this;
        self.availableForWork = true;
        const userId = self.actor_id || self.$root.user.id;
        const currentTeamMember = self.$root.teamMembers.filter(m => m.user_id === parseInt(userId, 10))[0];
        if (!currentTeamMember) return;
        const currentTags = [...currentTeamMember.tags];
        if (available) {
          currentTags.push('Available For Work');
        } else {
          currentTags.splice(currentTags.indexOf('Available For Work'), 1);
        }
        self.$api.updateCurrentTeamMember(userId, { tags: currentTags.length ? currentTags : [''] });
      },
      onPageAfterIn() {
        const self = this;
        self.loadAvailabilities();
        self.refreshPanelInterval = setInterval(() => {
          self.refreshPanelText = self.$moment(self.lastUpdated).fromNow();
        }, 20 * 1000);
      },
      onPageBeforeOut() {
        const self = this;
        clearTimeout(self.refreshPanelTimeout);
        clearInterval(self.refreshPanelInterval);
      },
      toggle(item, key, shift) {
        const self = this;
        if (item.data[`${shift}_locked`] === 'true' || item.data[`${shift}_locked`] === true) return;
        const itemAvail = item.data[shift];
        if (!itemAvail || itemAvail === '0') item.data[shift] = 1;
        if (itemAvail === 1 || itemAvail === '1') item.data[shift] = -1;
        if (itemAvail === -1 || itemAvail === '-1') item.data[shift] = 0;
        item.changed = true;
        self.items[key] = item;
        self.formChanged = true;
        self.$forceUpdate();
      },
      dayOrToday(date) {
        const self = this;
        const time = self.$moment(date);
        if (time.isSame(self.$moment(), 'day')) return 'Today';
        return time.format('dddd');
      },
      formatDate(date, format) {
        const self = this;
        const localTime = self.$moment.utc(date).toDate();
        return self.$moment(localTime).format(format);
      },
      availabilityClass(shift, data) {
        if (data && data[`${shift}_locked`] === 'true' || data[`${shift}_locked`] === true) return 'locked';
        if (data && (data[shift] === -1 || data[shift] === '-1')) return 'unavailable';
        if (data && (data[shift] === 1 || data[shift] === '1')) return 'available';
        return '';
      },
      loadAvailabilities() {
        const self = this;
        // eslint-disable-next-line
        const params = {
          addon: 'availability',
          kind: 'Availability',
          user_id: self.actor_id || self.$root.user.id,
          date_range: [
            self.startAt.utc().format(),
            self.endAt.utc().format(),
          ],
        };
        if (self.actor_id) {
          params.actor_id = self.actor_id;
        }

        self.showRefreshPanel = false;

        return self.$api
          .getFragments(params, { cache: false })
          .then((items) => {
            self.lastUpdated = new Date();
            self.refreshPanelTimeout = setTimeout(() => {
              self.showRefreshPanel = true;
            }, 41 * 1000);
            items.forEach((item) => {
              const date = self.$moment(item.start_at).format('YYYY-MM-DD');
              if (!item.data) item.data = {};
              if (self.items[date] && new Date(item.created_at).getTime() < new Date(self.items[date].created_at).getTime()) {
                return;
              }
              self.items[date] = item;
              self.$forceUpdate();
            });
          });
      },
      save() {
        const self = this;
        self.formChanged = false;
        Object.keys(self.items).forEach((key) => {
          const item = self.items[key];
          if (!item.changed) return;
          item.changed = false;
          const itemData = {
            am: item.data.am || 0,
            pm: item.data.pm || 0,
            nd: item.data.nd || 0,
          };
          if (item.data.am_locked === true || item.data.am_locked === 'true') itemData.am_locked = true;
          if (item.data.pm_locked === true || item.data.pm_locked === 'true') itemData.pm_locked = true;
          if (item.data.nd_locked === true || item.data.nd_locked === 'true') itemData.nd_locked = true;
          const itemToSend = {
            ...item,
            addon: 'availability',
            kind: 'Availability',
            data: JSON.stringify(itemData),
            start_at: key,
            user_id: self.actor_id || self.$root.user.id,
          };
          if (self.actor_id) {
            itemToSend.actor_id = self.actor_id;
          }
          if (item.id) {
            self.$api.updateFragment(item.id, Object.assign(itemToSend)).then((response) => {
              self.items[key] = response;
              self.$forceUpdate();
            });
          } else {
            self.$api.createFragment(itemToSend).then((response) => {
              self.items[key] = response;
              self.$forceUpdate();
            });
          }
        });
      },
    },
  };
</script>
