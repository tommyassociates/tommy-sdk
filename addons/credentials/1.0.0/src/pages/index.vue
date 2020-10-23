<template>
  <f7-page id="credentials__index">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{$t('credentials.index.title')}}</f7-nav-title>
      <f7-nav-right></f7-nav-right>
    </f7-navbar>
    <f7-list media-list class="list-custom credentials">
      <!-- <div>{{credentials}}</div> -->
      <f7-list-item
        title="Xero"
        text="Xero's online accounting software connects you to accountants & bookkeepers, your bank, & helps get you STP compliant."
      >
        <div class="segmented" slot="after">
          <f7-button icon-material="help" href="/credentials/help/xero" small></f7-button>
          <f7-button v-if="credentials['xero_oauth2']" icon-material="info" href="/credentials/audit-logs/Xero" small></f7-button>
          <f7-button v-if="credentials['xero_oauth2']" @click="disconnectAccount(credentials['xero_oauth2'])" color="red" icon-material="link" fill small></f7-button>
          <f7-button v-if="!credentials['xero_oauth2']" @click="connectAccount('xero_oauth2')" color="green" icon-material="link" fill small></f7-button>
        </div>
        <!-- <f7-button icon-material="settings" small></f7-button> -->
        <!-- <a v-if="credentials['xero_oauth2']" href="#" @click="connectAccount('xero_oauth2')" class="button button-round button-fill">Settings</a>
        <a v-if="!credentials['xero_oauth2']" href="#" @click="connectAccount('xero_oauth2')" class="button button-round button-fill">Connect</a>
        <a v-else href="#" @click="disconnectAccount(credentials['xero_oauth2'])" class="button button-round button-fill color-green">Disconnect</a> -->
        <img slot="media" :src="`${$addonAssetsUrl}xero.png`">
      </f7-list-item>
    </f7-list>
  </f7-page>
</template>
<script>
  // import config from 'tommy-core/src/config'

  export default {
    data() {
      return {
        credentials: {}
      }
    },
    mounted() {
      this.loadCredentials()
    },
    methods: {
      loadCredentials() {
        this.$api.call({
            endpoint: 'credentials',
            cache: false,
            // data: params
          })
          .then(items => {
            items.forEach(x => this.$set(this.credentials, x.provider, x))
            console.log('loaded credentials', this.credentials)
          })
      },
      connectAccount(provider) {
        if (confirm("Are you sure?")) {
          this.$api.call({
              endpoint: 'credentials',
              method: 'POST',
              data: { provider }
            })
            .then(cred => {
              console.log('created credential', cred)
              window.location = `${window.tommy.config.serverUrl}/v1/credentials/${cred.id}/connect?token=${localStorage.token}&redirect_url=${location.href}`
            })
        }
      },
      disconnectAccount(cred) {
        if (confirm("Are you sure?")) {
          this.$api.call({
              endpoint: `credentials/${cred.id}`,
              method: 'DELETE'
            })
            .then(cred => {
              console.log('deleted credential', cred)
              this.$delete(this.credentials, cred.provider)
            })
        }
      }
    },
  }
</script>
