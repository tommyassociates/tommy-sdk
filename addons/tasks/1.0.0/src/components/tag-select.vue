<template>
  <div class="tag-select">
    <f7-list media-list class="list-custom participants top-0">
      <f7-list-item :title="$t('tasks.task.participants', 'Participants')" divider></f7-list-item>
      <li class="item-content">
        <div class="item-inner">
          <template v-for="(tag, index) in tags">
            <img v-if="tag.context === 'members'" :key="index" :src="teamMemberIconUrl(tag.user_id)" class="circle item">
            <div v-else :key="index" class="chip item">
              <div class="chip-media">
                <img :src="contextIconSrc(tag)" :srcset="contextIconSrcset(tag)">
              </div>
              <div class="chip-label">{{tag.name}}</div>
            </div>
          </template>
          <a href="#" class="item icon-only tag-search" @click="openSelector">
            <img :src="`${$addonAssetsUrl}slice6.png`" :srcset="`${$addonAssetsUrl}slice6@2x.png 2x,${$addonAssetsUrl}slice6.png 3x`">
          </a>
        </div>
      </li>
    </f7-list>
    <f7-popover id="task-participants-popover" target=".tag-select .item.tag-search" v-if="teamTags" :opened="popoverOpened" @popover:closed="popoverOpened = false">
      <f7-list class="no-margin" no-hairlines>
        <f7-list-item
          v-for="(tag, index) in teamTags"
          :key="index"
          checkbox
          :checked="isTagSelected(tag)"
          :title="tag.name"
          @change="toggleTag(tag, $event.target.checked)"
        >
          <span class="tag-select-list-avatar" :style="`background-image: url(${tag.icon || ''})`" v-if="tag.context === 'members'" slot="media"></span>
          <span v-else class="tag-select-list-icon" slot="media">
            <img :src="contextIconSrc(tag)" :srcset="contextIconSrcset(tag)">
          </span>
        </f7-list-item>
      </f7-list>
    </f7-popover>
    <f7-sheet id="task-participants-sheet" v-if="teamTags" :opened="sheetOpened" @sheet:closed="sheetOpened = false">
      <f7-toolbar>
        <div class="left"></div>
        <div class="right">
          <f7-link @click="sheetOpened = false">Done</f7-link>
        </div>
      </f7-toolbar>
      <div class="page-content">
        <f7-searchbar
          search-container="#task-participants-sheet .list"
          search-in=".item-title"
        ></f7-searchbar>
        <f7-list class="no-margin" no-hairlines>
          <f7-list-item
            v-for="(tag, index) in teamTags"
            :key="index"
            checkbox
            :checked="isTagSelected(tag)"
            :title="tag.name"
            @change="toggleTag(tag, $event.target.checked)"
          >
            <span class="tag-select-list-avatar" :style="`background-image: url(${tag.icon || ''})`" v-if="tag.context === 'members'" slot="media"></span>
            <span v-else class="tag-select-list-icon" slot="media">
              <img :src="contextIconSrc(tag)" :srcset="contextIconSrcset(tag)">
            </span>
          </f7-list-item>
        </f7-list>
      </div>
    </f7-sheet>
  </div>
</template>
<script>
  export default {
    props: {
      tags: Array,
    },
    data() {
      return {
        teamTags: null,
        sheetOpened: false,
        popoverOpened: false,
      };
    },
    mounted() {
      const self = this;
      self.$api.getCurrentTeamTags({ cache: true }).then((tagItems) => {
        self.teamTags = tagItems;
      });
    },
    methods: {
      openSelector(tag) {
        const self = this;
        if (self.$f7.width >= 768) {
          self.popoverOpened = true;
        } else {
          self.sheetOpened = true;
        }
      },
      isTagSelected(tag) {
        const self = this;
        return self.tags.filter(t => t.name === tag.name && t.id === tag.id && t.type === tag.type).length > 0;
      },
      contextIconSrc(tag) {
        const self = this;
        const $addonAssetsUrl = self.$addonAssetsUrl;
        return `${$addonAssetsUrl}icons/${tag.context.slice(0, -1)}.png`;
      },
      contextIconSrcset(tag) {
        const self = this;
        const $addonAssetsUrl = self.$addonAssetsUrl;
        return `${$addonAssetsUrl}icons/${tag.context.slice(0, -1)}@2x.png 2x,${$addonAssetsUrl}icons/${tag.context.slice(0, -1)}@3x.png 3x`;
      },
      teamMemberIconUrl(user_id) {
        const self = this;
        if (!user_id) return '#';
        const path = `${self.$root.$config.apiUrl}team/members/${user_id}/avatar.png?token=${self.$root.token}`;
        return path;
      },
      toggleTag(tag, selected) {
        const self = this;
        if (selected) {
          self.$emit('tagToggle', tag, 'add');
          self.$emit('tagAdd', tag);
        } else {
          self.$emit('tagToggle', tag, 'remove');
          self.$emit('tagRemove', tag);
        }
      },
    },
  };
</script>

