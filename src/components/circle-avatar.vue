<template>
  <span class="avatar-circle" :class="{'avatar-circle-small': small}" :style="style">
    <span
      v-if="onlineBadge"
      class="badge"
      :class="(!!online ? 'online' : 'offline')"
      :data-online-state="user_id"
    >&nbsp;</span>
    <span
      v-if="notificationBadge"
      class="badge"
      :class="(!!notification_count ? '' : 'hide')"
    >{{notification_count}}</span>
    <span class="initials">{{initials}}</span>
    <span
      class="avatar-circle-image"
      v-if="icon_url"
      :style="`background-image: url(${icon_url})`"
      :class="{ 'current-avatar' : current }"
    />
  </span>
</template>
<script>
  import nameToInitials from '../utils/name-to-initials';

  export default {
    props: {
      small: Boolean,
      size: Number,
      url: String,
      data: Object,
      onlineBadge: Boolean,
      isOnline: Boolean,
      notificationBadge: Boolean,
    },
    computed: {
      style() {
        const self = this;
        const { size } = self;
        if (size) {
          return `width: ${size}px; height: ${size}px; line-height: ${size}px;`;
        }
        return '';
      },
      initials() {
        const self = this;
        const { data } = self;
        if (data.first_name) {
          return data.first_name[0] + data.last_name[0];
        }
        if (data.name) {
          return nameToInitials(data.name);
        }
        if (data.sender) {
          return nameToInitials(data.chat.title);
        }
        if (data.chat_title) {
          return data.chat_title[0] + data.chat_title[1];
        }
        return 'TO'; // Tommy?
      },
      user_id() {
        const self = this;
        const { data } = self;
        if (data.first_name || data.name) return data.user_id;
        return null;
      },
      online() {
        const self = this;
        const { data } = self;
        return self.isOnline || data.online;
      },
      notification_count() {
        const self = this;
        const { data } = self;
        if (data.first_name || data.name) return data.notification_count;
        return null;
      },
      icon_url() {
        const self = this;
        const { data, url } = self;
        if (url) return url;
        if (data.icon_url) return data.icon_url;
        if (data.first_name || data.name) return data.icon_url;
        if (data.sender) return data.chat.icon_url;
        return '';
      },
    },
  };
</script>