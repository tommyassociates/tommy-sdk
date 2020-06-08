<template lang="pug">
.no-data-message.text-center.my-5.py-5 Connecting, please wait...
</template>

<script>
export default {
  name: 'credentials__oauth-callback',
  mounted () {

    // We perform the oauthCallback on the client side so we have access to the
    // cached `returnUrl` and also to free up server resources.
    this.$root.oauthCallback(this.$route.params.provider, this.$route.query)
  },


  // oauthCallback (provider, params, redirect = true) {
  //   if (params.error_code) {
  //     this.$toast.error(this.$t('flash.authentication_failed'))
  //     this.$router.push('/login') //this.returnUrl()
  //     return
  //   }
  //   console.log('oauth login: starting', provider, params, redirect)
  //   return this.$api.fetch(`/v1/auth/${provider}/callback`, params)
  //     .then(response => {
  //       if (!response.headers.authorization) {
  //         console.log('oauth login: debug no headers', response)
  //         throw 'Authorization header not available'
  //       }
  //       const token = response.headers.authorization.replace('Bearer ', '')
  //       console.log('oauth login: success response', response, token)
  //       this.$toast.info(this.$t('flash.hello', {name: response.data.first_name}))
  //       return this.initSession(response.data, token, redirect)
  //       // return response
  //     })
  //     .catch(error => {
  //       console.log('oauth login: error response', error)
  //       this.$toast.error(ajaxError(error, this.$t('flash.authentication_failed')))
  //       // this.$router.push(this.returnUrl())
  //     })
  // },
}
</script>
