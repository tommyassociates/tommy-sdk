<template>
  <f7-page id="settings">
    <f7-navbar>
      <tommy-nav-back href="/" :force="true"></tommy-nav-back>
      <f7-nav-title>Settings</f7-nav-title>
    </f7-navbar>

    <f7-block-title>Account</f7-block-title>
    <f7-list>
      <f7-list-item
        smart-select
        title="Current Account"
      >
        <!-- {{ account.id }} -->
        <select :value="`${account.id}:${account.type}`" @change="changeAccount">
          <option
            v-for="(account, index) in accounts"
            :key="index"
            :value="account.id + ':' + account.type"
          >{{ account.name }} ({{ account.type }}: {{ account.contact_name }})
          </option>
        </select>
      </f7-list-item>
    </f7-list>

    <template v-if="team && teamMembers">
      <f7-block-title>Actor</f7-block-title>
      <f7-list>
        <f7-list-item
          smart-select
          title="Current Actor"
        >
          <select @change="changeActorId" :value="actorId">
            <option
              v-for="(teamMember, index) in teamMembers"
              :key="index"
              :value="teamMember.user_id"
            >{{ teamMember.first_name }} {{ teamMember.last_name }} ({{ teamMember.user_id }})
            </option>
          </select>
        </f7-list-item>
      </f7-list>
    </template>
  </f7-page>
</template>
<script>
import {mapState} from 'vuex';

export default {
  data() {
    return {
      actorId: null,
    };
  },
  computed: {
    ...mapState(['account', 'user']),
    ...mapState('accounts', ['accounts']),
    ...mapState('team', ['team', 'teamMembers']),
  },
  created() {
    this.actorId = localStorage.getItem('actorId');
  },
  methods: {
    changeActorId(e) {
      const self = this;
      const actorId = parseInt(e.target.value, 10);
      localStorage.setItem('actorId', actorId);
    },
    changeAccount(e) {
      const data = e.target.value.split(':'),
        accountId = parseInt(data[0], 10),
        accountType = data[1];
      let newAccount;
      this.accounts.forEach(account => {
        console.log(accountId, accountType, account)
        if (account.id === accountId && account.type === accountType)
          newAccount = account;
      });
      if (!newAccount) return;
      this.$store.dispatch('changeAccount', { ...newAccount, ignoreAddons: true });
    },
  },
  mounted() {
    this.actorId = this.$root.actorId || this.user.id;
  },
};
</script>
