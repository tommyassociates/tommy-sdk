<template>
  <div class="whs-table-container">
    <template v-if="loaded">
      <div class="whs-table" v-if="data.length > 0">
        <table>
          <thead>
            <tr>
              <th class="sort-cell">
                <a class="link">
                  <i class="whs-icon whs-icon-sort-black"></i>
                </a>
              </th>
              <th>{{settings.tag.plural_name}}</th>
              <th>{{settings.item.plural_name}}</th>
              <th>{{settings.location.plural_name}}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in data" :key="'item_'+index">
              <td class="media-cell media-cell-image" :style="[item.image ? {'background-image': `url(${item.image})`}: tagStyle]" ></td>
              <td>{{item.name}}</td>
              <td></td>
              <td></td>              
            </tr>
          </tbody>
        </table>
      </div>
      <empty-block v-if="data.length === 0" :text="$t('whs.common.no', {text: settings.tag.plural_name})" />
    </template>
    <template v-if="!loaded">
      <div style="background: #fff;">
        <div class="whs-table skeleton-text skeleton-effect-blink">
          <table>
            <thead>
              <tr>
                <th class="sort-cell">
                  <a class="link">
                    <i class="whs-icon whs-icon-sort-black"></i>
                  </a>
                </th>
                <th>________</th>
                <th>______</th>
                <th>____</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(index) in 12" :key="'skeleton_item_'+index">
                <td class="media-cell media-cell-image"></td>
                <td>___________</td>
                <td>_____</td>
                <td>____</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
import API from "../api";
import EmptyBlock from "../components/empty-block.vue";
import ListStyles from "../mixins/list-styles.vue";


export default {
  components:{
    EmptyBlock
  },
  mixins: [ListStyles],
  props: {
    loadId: Number,
    loadIdName: String,
    parent: String
  },
  data() {
    return {
      data: [],
      settings: API.main_page.$data.settings,
      page: 1,
      loaded: false
    };
  },
  methods: {
    loadData(page = 1) {
      const self = this;
      const options = {};
      options[self.loadIdName] = self.loadId;
      API.getTags(options).then(data => {
        self.data = data;
        self.loaded = true;
      });

      ///test pagination
      self.$events.$emit("pagination:" + self.parent + ":tag:set", {
        total: 12,
        rows: 39
      });
    },
    changePagination(page) {
      const self = this;
      self.loaded = false;
      self.loadData(page);
    }
  },
  created() {
    const self = this;
    self.$events.$on(
      "pagination:" + self.parent + ":tag:change",
      self.changePagination
    );
  },
  beforeDestroy() {
    const self = this;
    self.$events.$off(
      "pagination:" + self.parent + ":tag:change",
      self.changePagination
    );
  },
  mounted() {
    self = this;
    self.loadData();
  }
};
</script>