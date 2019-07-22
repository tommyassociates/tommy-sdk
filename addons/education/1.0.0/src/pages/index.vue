/* eslint-disable no-console */
<template>
  <f7-page class="education-page education-home-page">
    <f7-navbar>
      <tommy-nav-menu></tommy-nav-menu>
      <f7-nav-title>{{$t('education.index.title')}}</f7-nav-title>
    </f7-navbar>

    <template v-if="fragment">
      <a href="#" v-if="!currentCourse.locked" @click="openCourse(currentCourse)" class="education-toolbar-button"
        slot="fixed">{{$t('education.continue_button')}}</a>

      <f7-swiper class="education-swiper" :params="{slidesPerView: 'auto', touchMoveStopPropagation: false}">
        <f7-swiper-slide v-for="(course, index) in courses" :key="index" class="education-swiper-slide" :class="{
            'education-swiper-slide-active': currentCourseId === course.id,
            'education-swiper-slide-locked': course.locked
          }">
          <div class="education-swiper-slide-icon" @click="currentCourseId = course.id">
            <img :src="`${$addonAssetsUrl}courses-icons/${course.icon}`">
          </div>
          <div class="education-swiper-slide-name">{{course.indexName}}</div>
        </f7-swiper-slide>
      </f7-swiper>

      <div class="education-course-content">
        <div class="education-course-content-name">{{currentCourse.indexName}}</div>
        <div class="education-course-content-description" v-html="currentCourse.indexDescription"></div>
      </div>
      <f7-list class="no-margin-top no-hairline-top">
        <f7-list-item :title="t('price_label')"
          :after="!currentCourse.price ? t('free_label') : `¥${currentCourse.price}`" />
        <f7-list-item :title="t('duration_label')" :after="`${currentCourse.duration} ${t('hours_label')}`" />
        <f7-list-item :title="t('outcome_label')" :after="currentCourse.outcome" />
        <f7-list-item :title="t('estimate_data_label')" :after="`${currentCourse.estimate_data} ${t('mb_label')}`" />
        <template v-if="requiredCourses && requiredCourses.length">
          <f7-list-item divider :title="t('required_label')"></f7-list-item>
          <f7-list-item v-for="(required, index) in requiredCourses" :key="index" :title="required.indexName" />
        </template>
      </f7-list>
    </template>

  </f7-page>
</template>
<script>
import API from '../api';
import courses from '../../courses/index';

export default {
  data() {
    const actorId = this.$f7route.query.actor_id
      ? parseInt(this.$f7route.query.actor_id, 10)
      : undefined;
    API.actorId = actorId;
    return {
      courses,
      currentCourseId: courses[0].id,
      actorId,
      fragment: API.fragment,
    };
  },
  computed: {
    currentCourse() {
      return this.courses.filter(c => c.id === this.currentCourseId)[0];
    },
    requiredCourses() {
      return this.courses.filter(
        c => this.currentCourse.required.indexOf(c.id) >= 0
      );
    },
  },
  mounted() {
    this.getData();
    this.$events.$on('edication:updatedata', this.getData);
  },
  beforeDestroy() {
    this.$events.$off('edication:updatedata', this.getData);
  },
  methods: {
    t(key) {
      return this.$t(`education.index.${key}`);
    },
    openCourse(course) {
      const self = this;
      self.$f7router.navigate(`/education/course/${course.id}/`);
    },
    getData() {
      const self = this;
      API.getData(self.$root.user.id).then((fragments) => {
        if (!fragments.length) {
          self.fragment = {
            data: {
              completed_lessons: {},
            },
          };
          API.fragment = self.fragment;
        } else {
          self.fragment = fragments[0];
          API.fragment = self.fragment;
        }
      });
    },
  },
};
</script>

