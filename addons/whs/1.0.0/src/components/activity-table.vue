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
              <th>Generated</th>
              <th>Type</th>
              <th>Scheduled</th>
              <th>Item</th>
              <th>Assignet</th>
              <th>Executed By</th>
              <th>Executed</th>
              <th>Source</th>
              <th>Destination</th>
              <th>Value</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(item, index) in data" :key="'item_'+index">
              <td class="media-cell"></td>
              <td>{{item.generated_id}}</td>
              <td>{{item.activity_type}}</td>
              <td>{{item.scheduled_at !== null ? $moment(item.scheduled_at).format(settings.main.date) : ''}}</td>
              <td>{{item.inventory_item_id}}</td>
              <td>{{/*Assignet*/}}</td>
              <td>{{item.executed_by_id}}</td>
              <td>{{item.executed_at !== null ? $moment(item.executed_at).format(settings.main.date+' '+settings.main.time) : ''}}</td>
              <td>{{item.source_location_id}}</td>
              <td>{{item.destination_location_id}}</td>
              <td>{{item.value}}</td>
              <td>{{item.count}}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <empty-block v-if="data.length === 0" :text="$t('whs.common.no', {text: settings.activity.plural_name})" />
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
                <th>____</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(index) in 12" :key="'skeleton_item_'+index">
                <td class="media-cell">_</td>
                <td>___________</td>
                <td>_____</td>
                <td>____</td>
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

export default {
  components:{
    EmptyBlock
  },
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
      API.getActivities(options).then(data => {
        self.data = data;
        self.loaded = true;
      });

      ///test pagination
      self.$events.$emit("pagination:" + self.parent + ":activity:set", {
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
      "pagination:" + self.parent + ":activity:change",
      self.changePagination
    );
  },
  beforeDestroy() {
    const self = this;
    self.$events.$off(
      "pagination:" + self.parent + ":activity:change",
      self.changePagination
    );
  },
  mounted() {
    self = this;
    self.loadData();
  }
};
</script>