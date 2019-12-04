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
            <select name="type" @change="activity.kind = $event.target.value; validate_errors.kind = true;">
              <option
                value="unspecified"
                :selected="activity.kind === 'unspecified'"
              >{{$t('whs.form_add.type_options.unspecified')}}</option>
              <option
                value="pending_out"
                :selected="activity.kind === 'pending_out'"
              >{{$t('whs.form_add.type_options.pending_out')}}</option>
              <option
                value="pending_in"
                :selected="activity.kind === 'pending_in'"
              >{{$t('whs.form_add.type_options.pending_in')}}</option>
              <option
                value="movement"
                :selected="activity.kind === 'movement'"
              >{{$t('whs.form_add.type_options.movement')}}</option>
              <option
                value="stocktake"
                :selected="activity.kind === 'stocktake'"
              >{{$t('whs.form_add.type_options.stocktake')}}</option>
            </select>
          </f7-list-item>
          <f7-list-item divider class="whs-validate error" v-if="!validate_errors.kind">
            {{$t('whs.form_add.validate.required')}}
          </f7-list-item>
          <template
            v-if="activity.kind === 'pending_out' || activity.kind === 'pending_in' || activity.kind === 'movement'"
          >
            <!-- Item -->
            <f7-list-item divider>
              <i class="whs-form-icon whs-form-icon-item"></i>
              {{settings.item.name}}
            </f7-list-item>
            <item-picker :multiply="false" @selected:change="itemChange" />

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
                  :max="total.available"
                  @stepper:change="(value)=>{activity.count = value}"
                  buttons-only
                  color="gray"
                  ref="stepper_qauntity"
                />
              </f7-list-item>
              <f7-list-item divider :class="[activity.count == 0 ? 'error':'', 'whs-validate']">
                {{$t('whs.form_add.validate.available',{ count: activity.count, total:total.available})}}
                <f7-link @click="clickAvailableAll()">{{$t('whs.form_add.validate.available_all')}}</f7-link>       
              </f7-list-item>
              <!-- Source -->
              <f7-list-item divider>
                <i class="whs-form-icon whs-form-icon-location"></i>
                {{$t('whs.common.source_label')}}
              </f7-list-item>
              <location-picker :multiply="false" @selected:change="sourceChange" />
              <!-- Destination -->
              <f7-list-item divider>
                <i class="whs-form-icon whs-form-icon-location"></i>
                {{$t('whs.common.destination_label')}}
              </f7-list-item>
              <location-picker :multiply="false" @selected:change="destinationChange" />
            </template>
          </template>
          <!--Stocktake template -->
          <template
            v-if="activity.kind === 'stocktake'"
          >
            <!-- Item -->
            <f7-list-item divider>
              <i class="whs-form-icon whs-form-icon-item"></i>
              {{settings.item.name}}
            </f7-list-item>
            <item-picker :multiply="false" @selected:change="itemChange" />
            <template v-if="activity.inventory_item_id !== null">
              <!-- Destination -->
              <f7-list-item divider>
                <i class="whs-form-icon whs-form-icon-location"></i>
                {{$t('whs.common.destination_label')}}
              </f7-list-item>
              <location-picker :multiply="false" @selected:change="currentLocationChange" />
            </template>
          </template>
          <!--Assets-->
          <f7-list-item divider>
            <i class="whs-form-icon whs-form-icon-person"></i>
            {{$t('whs.common.assignet_label')}}
          </f7-list-item>
          <assets-picker :multiply="false" @selected:change="assetChange"/>
          <f7-list-item divider class="whs-validate error" v-if="!validate_errors.assign">
            {{$t('whs.form_add.validate.required')}}
          </f7-list-item>
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
            <f7-toggle slot="after" :checked="executed" @toggle:change="executedChange" />
          </f7-list-item>
          <template v-if="executed">
            <!--Executed by-->
            <f7-list-item divider>
              <i class="whs-form-icon whs-form-icon-person"></i>
              {{$t('whs.common.executed_by_label')}}
            </f7-list-item>
            <team-picker :multiply="false" @selected:change="executedTeamChange" />
            <f7-list-item divider class="whs-validate error" v-if="!validate_errors.executed_by_id">
              {{$t('whs.form_add.validate.required')}}
            </f7-list-item>
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
            <f7-list-item divider class="whs-validate error" v-if="!validate_errors.executed_at">
              {{$t('whs.form_add.validate.required')}}
            </f7-list-item>
            <f7-list-item divider class="whs-validate error" v-if="!validate_errors.executed_at_time">
              {{$t('whs.form_add.validate.scheduled')}}
            </f7-list-item>
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
import API from "../../api";
import TagsPicker from "../../components/picker/tags.vue";
import AssetsPicker from "../../components/picker/assets.vue";
import TeamPicker from "../../components/picker/team.vue";
import ItemPicker from "../../components/picker/item.vue";
import LocationPicker from "../../components/picker/location.vue";
import Dialog from "../../mixins/dialog.vue";

///Inventory item can't be blank. Source location can't be blank. Destination location can't be blank
export default {
  props:{
    item_link: Object
  },
  components: {
    TagsPicker,
    AssetsPicker,
    TeamPicker,
    ItemPicker,
    LocationPicker
  },
  mixins: [Dialog],
  created() {
    if (this.item_link) {
      this.editId = this.item_link.id;
      this.activity = Object.assign({}, this.item_link);
      this.activity.user_id = this.$root.user.id;
      
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
    }
  },
  watch:{
    filters(newFilter) { 
      const self = this;
      if(newFilter.length > 0){
        self.activity.filters = JSON.stringify(newFilter);
        self.activity.with_filters = true;
      }else{
        self.$delete(self.activity, 'filters');
        self.$delete(self.activity, 'with_filters');
      }
    }
  },
  methods: {
    addActivity() {
      self = this;
      if (
        this.$f7.$("#add-activity")[0].checkValidity() &&
        self.checkValidity()
      ) {
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
          this.$t("whs.alert_form.text") + self.validate_message,
          this.$t("whs.alert_form.ok"),
          "whs-alert"
        );
      }
    },
    checkValidity() {
      self = this;
      self.validate_message = "";
      let validate = true;
      if(self.executed){
        if(self.activity.executed_by_id === null){
          validate = false;
          self.validate_message += "\nPlease select executed.";
          self.validate_errors.executed_by_id = false;
        }
        if(self.activity.executed_at === null){
          validate = false;
          self.validate_message += "\nPlease select executed time.";
          self.validate_errors.executed_at = false;
        }
      }
      if(self.activity.scheduled_at !== null && self.activity.executed_at !== null){
        if(self.activity.executed_at  < self.activity.scheduled_at){
          validate = false;
          self.validate_message += "\n"+self.$t("whs.form_add.validate.scheduled_full")+".";
          self.validate_errors.executed_at_time = false;
        }
      }
      if(self.activity.kind === null || self.activity.kind === 'unspecified'){
        validate = false;
        self.validate_message += "\nPlease select activity type.";
        self.validate_errors.kind = false;
      }
      if(self.activity.kind === 'pending_out' || self.activity.kind === 'pending_in' || self.activity.kind === 'movement'){
        if (self.activity.inventory_item_id === null) {
          validate = false;
          self.validate_message += "\nInventory item can't be blank.";
          self.validate_errors.inventory_item_id = false;
        }
        if (self.activity.source_location_id === null) {
          validate = false;
          self.validate_message += "\nSource location can't be blank.";
          self.validate_errors.source_location_id = false;
        }
        if (self.activity.destination_location_id === null) {
          validate = false;
          self.validate_message += "\nDestination location can't be blank.";
          self.validate_errors.destination_location_id  = false;
        }
      }
      if(self.activity.kind === 'stocktake'){
        if (self.activity.current_location_id === null) {
          validate = false;
          self.validate_message += "\nCurrent location can't be blank.";
          self.validate_errors.current_location_id = false;
        }
      }
      if(self.filters.findIndex(e => e.context === 'members' || e.context === 'roles') < 0){
        validate = false;
        self.validate_message += "\nAssignet can't be blank.";
        self.validate_errors.assign = false;
      }
      return validate;
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
      if (self.activity.scheduled_at)
        date = new Date(self.activity.scheduled_at);
      self.calendarScheduled = self.$f7.calendar.create({
        value: [date],
        openIn: "customModal",
        backdrop: true,
        closeOnSelect: true,
        on: {
          change(cal, val) {
            if (self.calendar_first_change.scheduled) {
              self.activity.scheduled_at = val[0];
            } else {
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
            self.validate_errors.executed_at = true;
            if (self.calendar_first_change.executed) {
              self.activity.executed_at = val[0];
            } else {
              self.calendar_first_change.executed = true;
            }
            //check time
            if(self.activity.scheduled_at !== null && self.activity.executed_at !== null && self.calendar_first_change.executed){
              console.log("TCL: change -> self.activity.scheduled_at", self.activity.scheduled_at)
              if(self.activity.executed_at >= self.activity.scheduled_at){
                self.validate_errors.executed_at_time = true;
              }else{
                self.validate_errors.executed_at_time = false;
              }
            }

          }
        }
      });
    },
    executedChange(value) {
      self = this;
      self.executed = value;
      self.validate_errors.executed_at = true;
      self.validate_errors.executed_by_id = true;      
      if (!value) {
        self.activity.executed_at = null;
        self.activity.executed_by_id = null;
      }
    },
    itemChange(target) {
      self = this;
      if (target.length > 0) {
        self.activity.inventory_item_id = target[0].id;
        self.total.available = target[0].quantity;
      } else {
        self.activity.count = 0;
        self.total.available = 0;        
        self.activity.inventory_item_id = null;
      }
    },
    executedTeamChange(target) {
      self = this;
      self.validate_errors.executed_by_id = true;    
      if (target.length > 0) {
        self.activity.executed_by_id = target[0].id;
      } else {
        self.activity.executed_by_id = null;
      }
    },
    assetChange(target){
      self = this;
      self.validate_errors.assign = true;
      //clean old assign
      self.filters.forEach(function(item, index, object) {
        if (item.context === "members" || item.context === "roles") {
          object.splice(index, 1);
        }
      });
      if (target.length > 0) {
        self.filters = self.filters.concat(target);
      } 
    },
    sourceChange(target) {
      self = this;
      if (target.length > 0) {
        self.activity.source_location_id = target[0].id;
      } else {
        self.activity.source_location_id = null;
      }
    },
    destinationChange(target) {
      self = this;
      if (target.length > 0) {
        self.activity.destination_location_id = target[0].id;
      } else {
        self.activity.destination_location_id = null;
      }
    },
    currentLocationChange(target) {
      self = this;
      if (target.length > 0) {
        self.activity.current_location_id = target[0].id;
      } else {
        self.activity.current_location_id = null;
      }
    },
    clickAvailableAll(){
      self = this;
      self.activity.count = self.total.available;
      self.$refs.stepper_qauntity.setValue(self.total.available);
    }    
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
        user_id: self.$root.user.id,
        scheduled_at: null,
        executed_at: null,
        kind: null,
        executed_at: null,
        executed_by_id: null,
        count: 0,
        inventory_item_id: null,
        destination_location_id: null,
        source_location_id: null,
        current_location_id: null,
      },
      editId: null,
      indexEdit: null,
      executed: false,
      default_activity: {},
      settings: API.main_page.$data.settings,
      calendar_first_change: {
        executed: false,
        scheduled: false
      },
      validate_errors:{
        kind: true,
        inventory_item_id: true, 
        source_location_id: true,
        destination_location_id: true,
        current_location_id: true,
        executed_at: true,
        executed_at_time: true,
        executed_by_id: true,
        assign: true,
      },
      total:{
        available: 0,
        selected: 0,
      },
      filters:[],
    };
  }
};
</script>
