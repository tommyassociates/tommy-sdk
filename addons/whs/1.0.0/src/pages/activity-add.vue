<template>
  <f7-page>
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{title}}</f7-nav-title>
      <f7-nav-right class="whs-navbar-links">
        <f7-link icon-only @click="addActivity">
          <f7-icon f7="check" />
        </f7-link>
      </f7-nav-right>
    </f7-navbar>
    <form class="list" id="add-activity" action="javascript:void(0)" enctype="multipart/form-data">
      <f7-list class="whs-form">
        <ul>
          <!-- Scheduled -->
          <f7-list-item divider>
            <i class="whs-form-icon whs-form-icon-calendar"></i>
            {{$t('whs.common.date_label')}}
          </f7-list-item>
          <f7-list-input
            readonly
            type="text"
            name="scheduled"
            :value="activity.scheduled_at !== null ? $moment(activity.scheduled_at).format(settings.main.date) : $t('whs.common.date_placeholder')"
            @click.native="openScheduledCalendar()"
          />
          <!-- Type -->
          <f7-list-item divider>
            <i class="whs-form-icon whs-form-icon-dot"></i>
            {{$t('whs.common.type_label')}}
          </f7-list-item>

          <f7-list-item
            class="whs-type-selector"
            smart-select
            title=" "
            :smart-select-params="{
              openIn: 'popup',
              pageBackLinkText: '',
              popupCloseLinkText: '',
              closeOnSelect: true,
              pageTitle: $t('whs.common.options_title'),
              valueEl: '.whs-type-selector .item-title',
              cssClass: 'whs-type-options'            
            }"
          >
            <select name="type" @change="activity.activity_type = $event.target.value">
              <option
                value="unspecified"
                :selected="activity.activity_type === 'unspecified'"
              >{{$t('whs.form_add.type_options.unspecified')}}</option>
              <option
                value="pending_out"
                :selected="activity.activity_type === 'pending_out'"
              >{{$t('whs.form_add.type_options.pending_out')}}</option>
              <option
                value="pending_in"
                :selected="activity.activity_type === 'pending_in'"
              >{{$t('whs.form_add.type_options.pending_in')}}</option>
              <option
                value="movement"
                :selected="activity.activity_type === 'movement'"
              >{{$t('whs.form_add.type_options.movement')}}</option>
              <option
                value="stocktake"
                :selected="activity.activity_type === 'stocktake'"
              >{{$t('whs.form_add.type_options.stocktake')}}</option>
            </select>
          </f7-list-item>
          <template v-if="activity.activity_type === 'pending_out' || activity.activity_type === 'pending_in' || activity.activity_type === 'movement' || activity.activity_type === 'stocktake'" >
             <!-- Item -->
            <f7-list-item divider>
              <i class="whs-form-icon whs-form-icon-item"></i>
              {{settings.item.name}}
            </f7-list-item>
            <item-picker :multiply="false" @selected:change="itemChange"/>

            <template v-if="activity.inventory_item_id !== null">
              <!-- Capacity -->
              <f7-list-item divider>
                <i class="whs-form-icon whs-form-icon-1"></i>
                {{$t('whs.common.quantity_label')}}
              </f7-list-item>
              <f7-list-item :title="String(activity.count)">
                <f7-stepper
                  :value="activity.count"
                  :step="1"
                  :autorepeat="true"
                  :autorepeat-dynamic="true"
                  :min="0"
                  :max="999999999999999999"
                  @stepper:change="(value)=>{activity.count = value}"
                  buttons-only
                  color="gray"
                />
              </f7-list-item>
              <!-- Source -->
              <f7-list-item divider>
                <i class="whs-form-icon whs-form-icon-location"></i>
                {{$t('whs.common.source_label')}}
              </f7-list-item>
              <location-picker :multiply="false" @selected:change="sourceChange"/>              
              <!-- Destination -->
              <f7-list-item divider>
                <i class="whs-form-icon whs-form-icon-location"></i>
                {{$t('whs.common.destination_label')}}
              </f7-list-item>
              <location-picker :multiply="false" @selected:change="destinationChange"/>
            </template>
          </template>          
          <!--Assets-->
          <f7-list-item divider>
            <i class="whs-form-icon whs-form-icon-person"></i>
            {{$t('whs.common.assignet_label')}}
          </f7-list-item>
          <assets-picker :multiply="false"/>
          <!--Tags-->
          <f7-list-item divider>
            <i class="whs-form-icon whs-form-icon-hash"></i>
            {{settings.tag.name}}
          </f7-list-item>
          <tags-picker />
          <!-- Executed? -->
          <f7-list-item divider>
            <i class="whs-form-icon whs-form-icon-toggle"></i>
            {{$t('whs.common.executed_label')}}
          </f7-list-item>
          <f7-list-item>
            <f7-toggle
              slot="after"
              :checked="executed"
              @toggle:change="executedChange"
            />
          </f7-list-item>
          <template v-if="executed">
            <!--Assets-->
            <f7-list-item divider>
              <i class="whs-form-icon whs-form-icon-person"></i>
              {{$t('whs.common.executed_by_label')}}
            </f7-list-item>
            <team-picker :multiply="false" @selected:change="executedTeamChange"/>
            <!-- Executed -->
            <f7-list-item divider>
              <i class="whs-form-icon whs-form-icon-calendar"></i>
              {{$t('whs.common.date_executed_label')}}
            </f7-list-item>
            <f7-list-input
              readonly
              type="text"
              name="executed"
              :value="activity.executed_at !== null ? $moment(activity.executed_at).format(settings.main.date+' '+settings.main.time) : $t('whs.common.date_placeholder')"
              @click.native="openExecutedCalendar()"
            />
          </template>
        </ul>
      </f7-list>
    </form>

    <div class="whs-form-delete" v-if="editId">
      <f7-link class="delete" @click="deleteDialog()">{{$t('whs.common.delete')}}</f7-link>
    </div>
  </f7-page>
</template>
<script>
import API from "../api";
import TagsPicker from "../components/tags-picker.vue";
import AssetsPicker from "../components/assets-picker.vue";
import TeamPicker from "../components/team-picker.vue";
import ItemPicker from "../components/item-picker.vue";
import LocationPicker from "../components/location-picker.vue";
import Dialog from "../mixins/dialog.vue";

///Inventory item can't be blank. Source location can't be blank. Destination location can't be blank
export default {
  components: {
    TagsPicker,
    AssetsPicker,
    TeamPicker,
    ItemPicker,
    LocationPicker,
  },
  mixins: [Dialog],
  created() {
    if (
      this.$f7route.query.edit_id !== null &&
      this.$f7route.query.edit_id !== undefined
    ) {
      this.editId = this.$f7route.query.edit_id;
      this.indexEdit = this.$f7route.query.index;
      ///load activity from maim activitys and clone
      //this.activity = Object.assign({}, API.main_page.$data.activitys[this.indexEdit]);
      //this.executed = this.activity.executed_by_id !=== null
    }
  },
  computed: {
    title() {
      if (this.editId) {
        return this.$t("whs.form_add.title_edit", {
          text: this.settings.activity.name
        });
      } else {
        return this.$t("whs.form_add.title", {
          text: this.settings.activity.name
        });
      }
    },
  },
  methods: {
    addActivity() {
      self = this;
      if (this.$f7.$("#add-activity")[0].checkValidity() && self.checkValidity()) {
        if (this.editId) {
          this.activity = this.setDefaults(this.activity);
          API.editActivity(this.activity, this.editId).then(() => {
            self.$events.$emit("activity:updated", this.activity);
            self.$f7router.back();
            API.toast(
              self.$t("whs.toast.edit", { text: this.settings.activity.name })
            );
          });
        } else {
          this.activity = API.removeEmpty(this.activity);
          API.createActivity(this.activity).then(() => {
            self.$events.$emit("activity:aded", this.activity);
            self.$f7router.back();
            API.toast(
              self.$t("whs.toast.add", { text: this.settings.activity.name })
            );
          });
        }
      } else {
        this.alertDialog(
          this.$t("whs.alert_form.title"),
          this.$t("whs.alert_form.text")+". Inventory item can't be blank. Source location can't be blank. Destination location can't be blank",
          this.$t("whs.alert_form.ok")
        );
      }
    },
    checkValidity(){
      self = this;
      if(self.activity.inventory_item_id === null) return false;
      if(self.activity.source_location_id === null) return false;
      if(self.activity.destination_location_id === null) return false;
      return true;      
    },
    deleteActivity() {
      API.deleteActivity(this.editId).then(() => {
        self.$events.$emit("activity:deleted", this.item);
        self.$f7router.back("/whs/", { force: true });
        API.toast(
          self.$t("whs.toast.delete", { text: this.settings.activity.name })
        );
      });
    },
    deleteDialog() {
      this.confirmDialog(
        this.$t("whs.alert_form.delete_title"),
        this.$t("whs.alert_form.delete_text"),
        this.$t("whs.alert_form.confirm"),
        this.$t("whs.alert_form.cancel"),
        this.deleteActivity
      );
    },
    setDefaults(item) {
      self = this;
      for (key in self.default_item) {
        if (item[key] === null || item[key] === "")
          item[key] = self.default_item[key];
      }
      return item;
    },
    openScheduledCalendar() {
      const self = this;
      self.calendarScheduled.open();
    },
    createScheduledCalendar() {
      const self = this;
      let date = new Date();
      if (self.activity.scheduled_at) date = new Date(self.activity.scheduled_at);
      self.calendarScheduled = self.$f7.calendar.create({
        value: [date],
        openIn: "customModal",
        backdrop: true,
        closeOnSelect: true,
        on: {
          change(cal, val) {            
            if(self.calendar_first_change.scheduled){
              self.activity.scheduled_at = val[0];
            }else{
              self.calendar_first_change.scheduled = true;
            }
          }
        }
      });
    },
    openExecutedCalendar() {
      const self = this;
      self.calendarExecuted.open();
    },
    createExecutedCalendar() {
      const self = this;
      let date = new Date();
      if (self.activity.executed_at) date = new Date(self.activity.executed_at);
      self.calendarExecuted = self.$f7.calendar.create({
        value: [date],
        openIn: "customModal",
        backdrop: true,
        closeOnSelect: true,
        on: {
          change(cal, val) {
            if(self.calendar_first_change.executed){
              self.activity.executed_at = val[0];
            }else{
              self.calendar_first_change.executed = true;
            }
          }
        }
      });
    },
    executedChange(value){
      self = this;
      self.executed = value;
      if(!value){
        self.activity.executed_at = null;
        self.activity.executed_by_id = null;
      }
    },
    itemChange(target){
      self = this;
      if(target.length > 0 ){
        self.activity.inventory_item_id = target[0].id        
      }else{
        self.activity.inventory_item_id = null;
      }
    },
    executedTeamChange(target){
      self = this;
      if(target.length > 0 ){
        self.activity.executed_by_id = target[0].id        
      }else{
        self.activity.executed_by_id = null;
      }
    },     
    sourceChange(target){
      self = this;
      if(target.length > 0 ){
        self.activity.source_location_id = target[0].id        
      }else{
        self.activity.source_location_id = null;
      }
    },
    destinationChange(target){
      self = this;
      if(target.length > 0 ){
        self.activity.destination_location_id = target[0].id        
      }else{
        self.activity.destination_location_id = null;
      }
    },
  },
  beforeDestroy() {
    const self = this;
  },
  mounted() {
    const self = this;
    self.createScheduledCalendar();
    self.createExecutedCalendar();
  },
  data() {
    self = this;
    return {
      activity: {
        scheduled_at: null,
        executed_at: new Date(),
        activity_type: null,
        executed_at: null,
        executed_by_id: null,
        count: 0,
        inventory_item_id: null,
        destination_location_id: null,

      },
      editId: null,
      indexEdit: null,
      executed: false,
      default_activity: {},
      settings: API.main_page.$data.settings,
      calendar_first_change:{
        executed: false,
        scheduled: false,
      }
    };
  }
};
</script>
