<template>
  <f7-page id="vitals_element__add" :class="`vitals-element-manual-add-page vitals-${vitalsElement}-manual-add-page`">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{tAdd('title')}}</f7-nav-title>
      <f7-nav-right>
        <f7-link href="#" icon-only v-if="allowSave" @click="save">
          <i class="icon f7-icons">check</i>
        </f7-link>
      </f7-nav-right>
    </f7-navbar>

    <f7-list no-hairlines class="no-margin">
      <f7-list-input
        type="text"
        inline-label
        :value="name"
        @input="name = $event.target.value"
        :label="tAdd('vaccine_label')"
      />
      <f7-list-input
        type="text"
        inline-label
        input-id="date-input"
        :label="tAdd('date_label')"
      />
      <f7-list-item divider :title="tDetails('prevent_disease_title')" />
      <f7-list-input
        type="text"
        inputStyle="text-align: left"
        :value="prevent"
        @input="prevent = $event.target.value"
        :placeholder="tDetails('prevent_disease_title')"
      />
      <f7-list-item divider :title="tDetails('precautions_title')" />
      <f7-list-input
        type="textarea"
        resizable
        inputStyle="text-align: left"
        :value="precautions"
        @input="precautions = $event.target.value"
        :placeholder="tDetails('precautions_title')"
      />

    </f7-list>
  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    props: {
      vitalsElement: String,
    },
    data() {
      return {
        name: '',
        prevent: '',
        precautions: '',
        scheduledDate: new Date(),
      };
    },
    computed: {
      allowSave() {
        const self = this;
        return self.name && self.name.length > 0;
      },
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

