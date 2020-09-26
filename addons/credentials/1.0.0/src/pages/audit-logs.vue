<template>
  <f7-page name="credentials__audit-logs" id="credentials__audit-logs">
    <f7-navbar>
      <!-- <tommy-nav-menu></tommy-nav-menu> -->
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>Audit Logs</f7-nav-title>
      <f7-nav-right></f7-nav-right>
    </f7-navbar>
    <f7-list v-if="!loading && items.length" media-list>
      <!-- <li class="tag-item" v-for="(tag, index) in data.filters" :key="index"> -->
      <!-- <div>{{items}}</div> -->
      <f7-list-item
        v-for="(log, index) in items" :key="index"
        :title="log.name"
        :text="logMessage(log)"
        :after="formatDate(log.created_at, 'D/M/YY hh:mm:ss')"
      >
      </f7-list-item>
    </f7-list>
    <div v-else class="text-align-center" style="font-size: 18px; color: #999;">No items to display</div>
  </f7-page>
</template>
<script>
  import config from 'tommy-core/src/config'
  import formatDate from 'tommy-core/src/utils/format-date';

  export default {
    data() {
      return {
        items: [],
        loading: true
      }
    },
    mounted() {
      this.loadLogs()
    },
    methods: {
      formatDate,
      logMessage(log) {
        let msg = log.message
        if (log.error) {
          msg += ': ' + log.error
        }
        return msg
      },
      loadLogs() {
        this.$api.call({
            endpoint: `audit_logs?realm=${this.$f7route.params.realm}`,
            cache: false,
          })
          .then(items => {
            this.items = items
            this.loading = false
            // items.forEach(x => this.$set(this.credentials, x.provider, x))
            console.log('loaded audit logs', this.items)
          })
      }
    },
  }
</script>
