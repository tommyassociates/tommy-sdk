<template>
  <div class="tag-select tasks__tag-select tasks__list-tags-select">
    <ul>
      <li class="item-divider">{{$t(`tasks.permissions.${data.name}.title`)}}</li>
      <li>
        <a href="#" class="item-link tag-search" @click="openSelector">
          <div class="item-content">
            <div class="item-media"><i class="material-icons md-36">search</i></div>
            <div class="item-inner">
              <div class="item-title">{{$t('tasks.common.search_members_tags', 'Search Members, Tags')}}</div>
            </div>
          </div>
        </a>
      </li>
    </ul>
    <ul class="tag-items">
      <li class="tag-item" v-for="(tag, index) in data.filters" :key="index">
        <div class="item-content">
          <div class="item-inner">
            <div class="item-title">{{tag.name}}</div>
            <div class="item-after"><a style="height: 24px" @click="removeTag(tag)" href="#" class="item-link"><i class="material-icons">close</i></a></div>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>
<script>
  export default {
    props: {
      data: Object,
      listId: [String, Number],
    },
    data() {
      return {
        teamTags: null,
        // sheetOpened: false,
        // popoverOpened: false,
      };
    },
    mounted() {
      const self = this;
      self.$api.getCurrentTeamTags({ cache: true }).then((tagItems) => {
        self.teamTags = tagItems;
      });
    },
    methods: {
      openSelector() {
        const self = this;
        self.$f7router.navigate(`/tasks/list-edit/${self.listId}/tag-select/`, {
          props: {
            filters: self.data.filters,
            pageTitle: self.$t(`tasks.permissions.${self.data.name}.title`),
            teamTags: self.teamTags,
            onChange(tag, selected) {
              if (selected) {
                self.$emit('tagAdd', tag);
              } else {
                self.$emit('tagRemove', tag);
              }
            },
          },
        });
      },
      removeTag(tag) {
        const self = this;
        self.$emit('tagRemove', tag);
      },
    },
  };
</script>