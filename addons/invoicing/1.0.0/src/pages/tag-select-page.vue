<template>
  <f7-page class="invoicing-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{pageTitle}}</f7-nav-title>
      <f7-subnavbar :inner="false">
        <f7-searchbar
          search-container="#list-edit-tag-select"
          search-in=".item-title"
          @searchbar:search="onSearch"
        ></f7-searchbar>
      </f7-subnavbar>
    </f7-navbar>
    <f7-list v-if="query && query.length">
      <f7-list-item
        class="tasks-tag-select-tags-list"
        checkbox
        :title="query"
        @change="toggleTag({context: 'tags', name: query, label: 'Tag'}, $event.target.checked, true)"
      >
        <span class="tag-select-list-icon" slot="media">
          <img :src="contextIconSrc({context: 'tags', name: query, label: 'Tag'})" :srcset="contextIconSrcset({context: 'tags', name: query, label: 'Tag'})">
        </span>
      </f7-list-item>
    </f7-list>

    <f7-list id="list-edit-tag-select" class="no-margin no-hairlines tasks-tag-select-tags-list">
      <f7-list-item
        v-for="(tag, index) in allTags"
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
  </f7-page>
</template>
<script>
  export default {
    props: {
      listId: [String, Number],
      pageTitle: String,
      tags: Array,
      teamTags: Array,
      onChange: Function,
    },
    data() {
      return {
        query: null,
      };
    },
    computed: {
      allTags() {
        const self = this;
        const addTags = [];
        self.tags.forEach((f) => {
          let isTeamTag;
          self.teamTags.forEach((t) => {
            if (isTeamTag) return;
            isTeamTag = f.context === t.context && f.name === t.name && f.label === t.label;
          });
          if (!isTeamTag) addTags.push(f);
        });
        return [...self.teamTags, ...addTags];
      },
    },
    methods: {
      onSearch(sb, query) {
        const self = this;
        self.query = query;
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
      toggleTag(tag, selected, close) {
        const self = this;
        if (self.onChange) {
          self.onChange(tag, selected);
          if (close) {
            self.$f7router.back();
          }
        }
      },
    },
  };
</script>

