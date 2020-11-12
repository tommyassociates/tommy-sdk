<template>
  <f7-page class="tasks__page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{pageTitle}}</f7-nav-title>
      <f7-subnavbar :inner="false">
        <f7-searchbar
          search-container="#list-edit-tag-select"
          search-in=".item-title"
        ></f7-searchbar>
      </f7-subnavbar>
    </f7-navbar>

    <f7-list id="list-edit-tag-select" class="no-margin no-hairlines tasks__tag-select-tags-list">
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
  </f7-page>
</template>
<script>
  export default {
    props: {
      listId: [String, Number],
      pageTitle: String,
      filters: Array,
      teamTags: Array,
      onChange: Function,
    },
    methods: {
      isTagSelected(tag) {
        const self = this;
        return self.filters.filter(t => t.name === tag.name && t.id === tag.id && t.type === tag.type).length > 0;
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
      toggleTag(tag, selected) {
        const self = this;
        if (self.onChange) {
          self.onChange(tag, selected);
        }
      },
    },
  };
</script>

