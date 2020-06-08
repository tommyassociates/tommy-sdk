<template>
  <f7-page id="credentials__index">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{$t('credentials.index.title')}}</f7-nav-title>
      <f7-nav-right></f7-nav-right>
    </f7-navbar>
    <f7-list media-list class="list-custom">
      <!-- <div>{{credentials}}</div> -->
      <f7-list-item
        title="Xero"
        text="Xero's online accounting software connects you to accountants & bookkeepers, your bank, & helps get you STP compliant."
      >
        <a v-if="!credentials['xero_oauth2']" href="#" @click="connectAccount('xero_oauth2')" class="button button-round button-fill" slot="after">Connect</a>
        <a v-else href="#" @click="disconnectAccount(credentials['xero_oauth2'])" class="button button-round button-fill color-green" slot="after">Disconnect</a>
        <img slot="media" :src="`${$addonAssetsUrl}xero.png`">
      </f7-list-item>
      <!-- link="#" -->
      <!-- <div>zzz</div> -->
      <!-- <f7-list-item
        title="Xero Accounting"
      ></f7-list-item> -->
      <!-- :after="dateRange ? dateRange.join(' - ') : ''" -->
      <!-- Credentials: Date Range Select -->
      <!-- <li class="item-divider">Date Range Select</li>
      <date-range-select
        v-model="dateRange"
        @change="onDateRangeChange"
        @save="onSave"
      ></date-range-select> -->

      <!-- Credentials: Tag Select -->
      <!-- <tag-select
        title="Tag Select"
        v-model="testTags"
        @change="onTagsChange"
        @save="onSave"
      ></tag-select> -->
      <!-- <f7-list-item
        title="Selected Tags"
        :after="testTags.map(x => x.name).join(', ')"
      ></f7-list-item> -->

      <!-- Credentials: Permission Select -->
      <!-- <permission-select
        title="Permission Select: Team Member Access"
        permission-name="addon_access"
        addon-name="credentials"
      ></permission-select> -->
      <!-- <f7-list-item
        title="Selected Date Range"
        :after="dateRange ? dateRange.join(' - ') : ''"
      ></f7-list-item> -->
    </f7-list>
  </f7-page>
</template>
<script>
  import config from 'tommy-core/src/config'

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
              window.location = `${config.serverUrl}/v1/credentials/${cred.id}/connect?token=${localStorage.token}&redirect_url=${location.href}`
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
