<template>
  <f7-page class="invoicing-feedback">
    <f7-navbar>
      <f7-nav-left v-if="saved">
        <f7-link @click="closeFeedback" icon-f7="close"></f7-link>
      </f7-nav-left>
      <f7-nav-left v-if="!saved && step !== 'step-1' && step !== 'step-4'">
        <f7-link icon="icon-back" @click="stepBack"></f7-link>
      </f7-nav-left>
      <f7-nav-title>{{navTitle}}</f7-nav-title>
    </f7-navbar>
    <div slot="fixed" class="invoicing-feedback-buttons" v-if="step === 'step-1'">
      <a class="invoicing-feedback-button-no" @click="setStep('step-1-2')">{{t('button_no')}}</a>
      <a class="invoicing-feedback-button-yes" @click="setStep('step-2')">{{t('button_yes')}}</a>
    </div>
    <div slot="fixed" class="invoicing-feedback-buttons" v-if="step === 'step-1-2'">
      <a class="invoicing-feedback-button-submit" @click="setStep('step-2')">{{t('button_submit')}}</a>
    </div>
    <div slot="fixed" class="invoicing-feedback-buttons" v-if="step === 'step-2'">
      <a class="invoicing-feedback-button-submit" @click="setStep('step-3')">{{t('button_start')}}</a>
    </div>
    <div slot="fixed" class="invoicing-feedback-buttons" v-if="step === 'step-3'">
      <a class="invoicing-feedback-button-submit" @click="setStep('question-1')">{{t('button_next')}}</a>
    </div>
    <div slot="fixed" class="invoicing-feedback-buttons" v-if="step === 'question-1'">
      <a class="invoicing-feedback-button-no" @click="setStep('question-2', 'no')">{{t('button_no')}}</a>
      <a class="invoicing-feedback-button-yes" @click="setStep('question-2', 'yes')">{{t('button_yes')}}</a>
    </div>
    <div slot="fixed" class="invoicing-feedback-buttons" v-if="step === 'question-2'">
      <a class="invoicing-feedback-button-no" @click="setStep('question-3', 'no')">{{t('button_no')}}</a>
      <a class="invoicing-feedback-button-yes" @click="setStep('question-3', 'yes')">{{t('button_yes')}}</a>
    </div>
    <div slot="fixed" class="invoicing-feedback-buttons" v-if="step === 'question-3'">
      <a class="invoicing-feedback-button-no" @click="setStep('step-4', 'no')">{{t('button_no')}}</a>
      <a class="invoicing-feedback-button-yes" @click="setStep('step-4', 'yes')">{{t('button_yes')}}</a>
    </div>

    <template v-if="step === 'step-1'">
      <div class="invoicing-feedback-confirm-title">{{t('time_confirm_title')}}</div>
      <div class="invoicing-feedback-confirm-time" v-if="orderDuration">{{durationFormatted}} {{t('hours')}}</div>
    </template>
    <template v-if="step === 'step-1-2'">
      <div class="invoicing-feedback-confirm-title">{{t('time_select_title')}}</div>
      <div class="invoicing-feedback-confirm-text" v-html="t('time_select_text')"></div>
      <f7-list>
        <f7-list-input
          :label="t('time_select_start')"
          inline-label
          type="text"
          inputId="start_date"
        />
        <f7-list-input
          :label="t('time_select_end')"
          inline-label
          type="text"
          inputId="end_date"
        />
      </f7-list>
    </template>
    <template v-if="step === 'step-2'">
      <div class="invoicing-feedback-question-text" v-html="t('feedback_start_text')"></div>
    </template>
    <template v-if="step === 'step-3'">
      <div class="invoicing-feedback-question-text" v-html="t('feedback_info_text')"></div>
    </template>
    <template v-if="step === 'question-1'">
      <div class="invoicing-feedback-question-text" v-html="t('feedback_question_1')"></div>
    </template>
    <template v-if="step === 'question-2'">
      <div class="invoicing-feedback-question-text" v-html="t('feedback_question_2')"></div>
    </template>
    <template v-if="step === 'question-3'">
      <div class="invoicing-feedback-question-text" v-html="t('feedback_question_3')"></div>
    </template>
    <template v-if="step === 'step-4'">
      <div class="invoicing-feedback-end-image">
        <img :src="`${$addonAssetsUrl}/feedback-image.svg`" />
      </div>
      <div class="invoicing-feedback-end-title">{{t('feedback_end_title')}}</div>
      <div class="invoicing-feedback-end-text" v-html="t('feedback_end_text')"></div>
    </template>
  </f7-page>
</template>

<script>
  export default {
    props: {
      order: Object,
      orderDuration: Number,
    },
    data() {
      return {
        navTitle: this.t('confirm_title'),
        step: 'step-1',
        q1: null,
        q2: null,
        q3: null,
        saved: false,
        start_date: null,
        end_date: null,
      };
    },
    computed: {
      durationFormatted() {
        return Math.floor(this.orderDuration / 60 * 10) / 10;
      },
    },
    mounted() {
      const self = this;
      self.$f7.navbar.size(self.$el.querySelector('.navbar'));
    },
    methods: {
      t(s, data) {
        return this.$t(`invoicing.order_feedback.${s}`, data);
      },
      stepBack() {
        const self = this;
        const step = self.step;
        if (step === 'step-1-2') {
          self.start_date = null;
          self.end_date = null;
          self.step = 'step-1';
        }
        if (step === 'step-2' && self.start_date) {
          self.step = 'step-1-2';
          self.$nextTick(() => {
            self.initTimePickers();
          });
        } else if (step === 'step-2') {
          self.step = 'step-1';
        }
        if (step === 'step-3') {
          self.step = 'step-2';
        }
        if (step === 'question-1') {
          self.step = 'step-3';
        }
        if (step === 'question-2') {
          self.step = 'question-1';
        }
        if (step === 'question-3') {
          self.step = 'question-2';
        }
      },
      setStep(step, data) {
        const self = this;
        if (step === 'step-1-2') {
          self.step = step;
          self.$nextTick(() => {
            self.initTimePickers();
          });
        }
        if (step === 'step-2') {
          self.step = step;
        }
        if (step === 'step-3') {
          self.step = step;
        }
        if (step === 'question-1') {
          self.step = step;
        }
        if (step === 'question-2') {
          self.step = step;
          self.q1 = data;
        }
        if (step === 'question-3') {
          self.step = step;
          self.q2 = data;
        }
        if (step === 'step-4') {
          self.step = step;
          self.q3 = data;
          self.saveFeedback();
        }
      },
      initTimePickers() {
        const self = this;
        const orderDate = new Date(parseInt(self.order.data.date, 10));
        const minDate = orderDate.getTime() - 10 * 24 * 60 * 60 * 1000;
        const dates = [];
        for (let i = 0; i < 21; i += 1) {
          dates.push(minDate + i * 24 * 60 * 60 * 1000);
        }
        const hours = [];
        for (let i = 0; i < 24; i += 1) {
          hours.push(i < 10 ? `0${i}` : i);
        }
        const minutes = [];
        for (let i = 0; i < 60; i += 1) {
          minutes.push(i < 10 ? `0${i}` : i);
        }
        let orderHours = orderDate.getHours();
        if (orderHours < 10) orderHours = `0${orderHours}`;

        let orderMinutes = orderDate.getMinutes();
        if (orderMinutes < 10) orderMinutes = `0${orderMinutes}`;

        self.$f7.picker.create({
          inputEl: self.$el.querySelector('#start_date'),
          openIn: 'popover',
          value: [orderDate.getTime(), orderHours, orderMinutes],
          cols: [
            {
              values: dates,
              displayValues: dates.map(d => self.$moment(d).format('ddd, DD MMM')),
            },
            { values: hours },
            { divider: true, content: ':' },
            { values: minutes },
          ],
          formatValue(values, displayValues) {
            return `${displayValues[0]} ${displayValues[1]}:${displayValues[2]}`;
          },
          on: {
            change(p, value) {
              const d = new Date(parseInt(value[0], 10));
              d.setHours(parseInt(value[1], 10), parseInt(value[2], 10), 0, 0);
              self.start_date = d;
            },
          },
        });

        const endDate = new Date(orderDate.getTime() + self.orderDuration * 60 * 1000);
        let endHours = endDate.getHours();
        if (endHours < 10) endHours = `0${endHours}`;

        let endMinutes = endDate.getMinutes();
        if (endMinutes < 10) endMinutes = `0${endMinutes}`;

        self.$f7.picker.create({
          inputEl: self.$el.querySelector('#end_date'),
          openIn: 'popover',
          value: [orderDate.getTime(), endHours, endMinutes],
          cols: [
            {
              values: dates,
              displayValues: dates.map(d => self.$moment(d).format('ddd, DD MMM')),
            },
            { values: hours },
            { divider: true, content: ':' },
            { values: minutes },
          ],
          formatValue(values, displayValues) {
            return `${displayValues[0]} ${displayValues[1]}:${displayValues[2]}`;
          },
          on: {
            change(p, value) {
              const d = new Date(parseInt(value[0], 10));
              d.setHours(parseInt(value[1], 10), parseInt(value[2], 10), 0, 0);
              self.end_date = d;
            },
          },
        });
      },
      saveFeedback() {
        const self = this;
        self.$emit('feedbackComplete', {
          feedback: {
            question1: self.q1,
            question2: self.q2,
            question3: self.q2,
            start_date: self.start_date ? self.start_date.toJSON() : null,
            end_date: self.end_date ? self.end_date.toJSON() : null,
          },
          callback() {
            self.saved = true;
          },
        });
      },
      closeFeedback() {
        const self = this;
        self.$emit('close');
      },
    },
  };
</script>
