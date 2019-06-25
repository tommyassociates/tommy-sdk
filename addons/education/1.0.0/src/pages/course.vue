<template>
  <f7-page class="education-page education-course-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{course.pageName}}</f7-nav-title>
    </f7-navbar>

    <f7-block no-hairlines strong class="no-margin" v-html="course.pageDescription"></f7-block>

    <f7-list no-hairlines media-list class="no-margin">
      <f7-list-item divider :title="t('courses_label')" />
      <f7-list-item
        v-for="(lesson, index) in course.lessons"
        :key="index"
        :title="lesson.indexName"
        @click="openLesson(lesson)"
      >
        <div slot="text" v-if="lesson.indexDescription" v-html="lesson.indexDescription"></div>
      </f7-list-item>

    </f7-list>
  </f7-page>
</template>
<script>
  import API from '../api';
  import courses from '../../courses/index';

  export default {
    props: {
      courseId: String,
    },
    data() {
      return {
        course: courses.filter(c => c.id === this.courseId)[0],
        courses,
      };
    },
    computed: {

    },
    methods: {
      t(key) {
        return this.$t(`education.course.${key}`);
      },
      openLesson(lesson) {
        const self = this;
        self.$f7router.navigate(`/education/lesson-${lesson.type}/`, {
          props: {
            course: self.course,
            lesson,
          },
        });
      },
    },
  };
</script>

