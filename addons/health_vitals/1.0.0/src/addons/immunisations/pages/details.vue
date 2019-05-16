<template>
  <f7-page id="vitals_element__add" :class="`vitals-element-manual-add-page vitals-${vitalsElement}-manual-add-page vitals-${vitalsElement}-details-page`">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{tDetails('title')}}</f7-nav-title>
    </f7-navbar>

    <f7-list no-hairlines class="no-margin">
      <f7-list-item
        :title="tDetails('vaccine_label')"
        :after="name"
      />
      <f7-list-item
        :title="tDetails('date_label')"
        :after="$moment(scheduledDate).format('DD MMM, YYYY')"
      />
      <f7-list-item
        :title="tDetails('status_label')"
        :after="statusText()"
      />
      <f7-list-item
        v-if="injected && injectedDate"
        :title="tDetails('injection_date_label')"
        :after="$moment(injectedDate).format('DD MMM, YYYY')"
      />
      <f7-list-item divider :title="tDetails('prevent_disease_title')" />
      <f7-list-item>{{prevent}}</f7-list-item>
      <f7-list-item divider :title="tDetails('precautions_title')" />
      <f7-list-item>{{precautions}}</f7-list-item>
    </f7-list>
    <div class="immunisations-details-buttons" v-if="!archived">
      <a href="#" class="immunisations-details-button-red" @click="injectVaccine" v-if="!injected && isOverDue()">{{tDetails('confirm_injection_button')}}</a>
      <a href="#" @click="archiveVaccine">{{tDetails('archive_button')}}</a>
    </div>
    <div class="immunisations-details-buttons" v-if="archived">
      <a href="#" class="immunisations-details-button-red" @click="deleteVaccine">{{$t('health_vitals.immunisations.archive.delete_button')}}</a>
    </div>
  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    props: {
      vitalsElement: String,
      vaccine: Object,
    },
    data() {
      const {
        name,
        prevent,
        precautions,
        scheduledDate,
        sheduledDate,
        injected,
        injectedDate,
        archived,
      } = this.vaccine.data;
      return {
        id: this.vaccine.id,
        name,
        prevent,
        precautions,
        scheduledDate: scheduledDate || sheduledDate,
        injected,
        injectedDate,
        archived,
      };
    },
    mounted() {
      const self = this;
      self.$f7.calendar.create({
        inputEl: self.$el.querySelector('#date-input'),
        value: [self.scheduledDate],
        closeOnSelect: true,
        on: {
          change(c, v) {
            self.scheduledDate = new Date(v[0]);
            self.scheduledDate.setHours(0, 0, 0, 0);
          },
        },
      });
    },
    methods: {
      tAdd(v, d) {
        return this.$t(`health_vitals.${this.vitalsElement}.add_vaccine.${v}`, d);
      },
      tDetails(v, d) {
        return this.$t(`health_vitals.${this.vitalsElement}.immunisation_details.${v}`, d);
      },
      statusText() {
        const self = this;
        if (self.injected) return self.tDetails('status_options.1');
        if (self.isOverDue()) return self.tDetails('status_options.0');
        return self.tDetails('status_options.2');
      },
      isOverDue() {
        const self = this;
        if (self.injected) return false;
        const d = new Date();
        const needDate = new Date(self.scheduledDate || self.sheduledDate);
        return d.getTime() >= needDate.getTime();
      },
      archiveVaccine() {
        const self = this;
        const {
          name,
          prevent,
          precautions,
          scheduledDate,
          injected,
          injectedDate,
        } = self;
        self.$f7.dialog.confirm(self.$t('health_vitals.immunisations.archive_delete_confirm_prompt.text'), () => {
          API.updateVaccine(self.$root.user, self.id, {
            name,
            prevent,
            precautions,
            scheduledDate,
            injected,
            injectedDate,
            archived: true,
          }).then(() => {
            self.$events.$emit(`${self.vitalsElement}:updateRecords`);
            self.$f7router.back();
          });
        });
      },
      deleteVaccine() {
        const self = this;
        self.$f7.dialog.confirm(self.$t('health_vitals.immunisations.archive_delete_confirm_prompt.text'), () => {
          API.deleteVaccine(self.$root.user, self.id).then(() => {
            self.$events.$emit(`${self.vitalsElement}:updateRecords`);
            self.$f7router.back();
          });
        });
      },
      injectVaccine() {
        const self = this;
        let calendar;
        function inject() {
          self.injected = true;
          self.injectedDate = calendar.value[0];
          const {
            name,
            prevent,
            precautions,
            scheduledDate,
            injected,
            injectedDate,
            archived,
          } = self;
          API.updateVaccine(self.$root.user, self.id, {
            name,
            prevent,
            precautions,
            scheduledDate,
            injected,
            injectedDate: injectedDate.toJSON(),
            archived,
          }).then(() => {
            self.$events.$emit(`${self.vitalsElement}:updateRecords`);
            self.$f7router.back();
          });
        }
        const dialog = self.$f7.dialog.create({
          title: self.$t('health_vitals.immunisations.injection_confirm.date_label'),
          text: '<div class="immunisations-dialog-calendar"></div>',
          buttons: [
            {
              text: self.$t('health_vitals.immunisations.injection_confirm.cancel_button'),
            },
            {
              text: self.$t('health_vitals.immunisations.injection_confirm.confirm_button'),
              bold: true,
              onClick() {
                inject();
              },
            },
          ],
        });
        dialog.open();
        calendar = self.$f7.calendar.create({
          containerEl: dialog.$el.find('.immunisations-dialog-calendar'),
          value: [new Date()],
        });
      },
      save() {
        const self = this;
        const { name, scheduledDate, prevent, precautions } = self;
        API.addVaccine(
          self.$root.user,
          {
            name,
            scheduledDate: new Date(scheduledDate).toJSON(),
            prevent,
            precautions,
          }
        ).then(() => {
          self.$events.$emit(`${self.vitalsElement}:updateRecords`);
          self.$f7router.back();
        });
      },
    },
  };
</script>

