<template>
  <f7-page id="settings">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>Settings</f7-nav-title>
    </f7-navbar>

    <f7-block-title>Account</f7-block-title>
    <f7-list>
      <f7-list-item
        smart-select
        title="Current Account"
      >
        <select :value="$root.account.id" @change="changeAccount">
          <option
            v-for="(account, index) in $root.accounts"
            :key="index"
            :value="account.id"
          >{{account.name}} ({{account.kind}})</option>
        </select>
      </f7-list-item>
    </f7-list>

    <template v-if="$root.team && teamMembers">
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
            >{{teamMember.first_name}} {{teamMember.last_name}} ({{teamMember.user_id}})</option>
          </select>
        </f7-list-item>
      </f7-list>
    </template>
  </f7-page>
</template>
<script>
  export default {
    data() {
      return {
        teamMembers: null,
        actorId: this.$root.actorId || this.$root.user.id,
      };
    },
    mounted() {
      const self = this;
      if (self.$root.team) {
        self.$api.getCurrentTeamMembers().then((response) => {
          self.teamMembers = response;
        });
      }
    },
    methods: {
      changeActorId(e) {
        const self = this;
        const actorId = parseInt(e.target.value, 10);
        self.$root.setActorId(actorId);
      },
      changeAccount(e) {
        const self = this;
        const accountId = parseInt(e.target.value, 10);
        let newAccount;
        self.$root.accounts.forEach((account) => {
          if (account.id === accountId) newAccount = account;
        });
        if (!newAccount) return;
        const { id, type, location_id } = newAccount; // eslint-disable-line
        self.$root.changeAccount(id, type, location_id);
      },
    },
  };
</script>

