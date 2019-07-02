<template>
  <f7-page class="education-page education-course-page">
    <f7-navbar>
      <tommy-nav-back></tommy-nav-back>
      <f7-nav-title>{{course.pageName}}</f7-nav-title>
    </f7-navbar>

    <f7-block no-hairlines strong class="no-margin" v-html="course.pageDescription"></f7-block>

    <a href="#" v-if="!courseCompleted && !courseStarted" @click="openFirstLesson()" class="education-toolbar-button" slot="fixed">{{$t('education.start_button')}}</a>

    <a href="#" v-if="!courseCompleted && courseStarted" @click="openNextLesson()" class="education-toolbar-button" slot="fixed">{{$t('education.resume_button')}}</a>

    <f7-list no-hairlines media-list class="no-margin">
      <f7-list-item v-if="courseCompleted" divider :title="t('certificates_label')" />
      <f7-list-item v-if="courseCompleted" :title="t('certificate_of_completion')">
        <i class="icon education-reward-icon" slot="media"></i>
      </f7-list-item>
      <f7-list-item divider :title="t('courses_label')" />
      <li
        v-for="(lesson, index) in course.lessons"
        :key="index"
        v-if="!lessonCompleted(lesson.id) || (lessonCompleted(lesson.id) && lesson.type === 'video')"
        class="item-content"
        :title="lesson.indexName"
        @click="openClickLesson(lesson)"
      >
        <div class="item-inner">
          <div class="item-title-row">
            <div class="item-title">{{lesson.indexName}}</div>
            <div class="item-after">
              <div class="education-checkbox">
                <input type="checkbox" :checked="lessonCompleted(lesson.id)" disabled>
                <i class="icon"></i>
              </div>
            </div>
          </div>
          <div class="item-text" v-if="lesson.indexDescription" v-html="lesson.indexDescription"></div>
        </div>
      </li>
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
        fragment: API.fragment,
      };
    },
    computed: {
      courseCompleted() {
        const self = this;
        const course = self.course;
        const lessonIds = course.lessons.map(l => l.id);
        const completedLessonsIds = Object.keys(self.fragment.data.completed_lessons);
        let completed = true;
        lessonIds.forEach((id) => {
          if (completedLessonsIds.indexOf(id) < 0) completed = false;
        });
        return completed;
      },
      courseStarted() {
        const self = this;
        const course = self.course;
        const lessonIds = course.lessons.map(l => l.id);
        const completedLessonsIds = Object.keys(self.fragment.data.completed_lessons);
        let started = false;
        lessonIds.forEach((id) => {
          if (completedLessonsIds.indexOf(id) >= 0) started = true;
        });
        return started;
      },
    },
    mounted() {
      this.$events.$on('edication:updatedata', this.updateData);
    },
    beforeDestroy() {
      this.$events.$off('edication:updatedata', this.updateData);
    },
    methods: {
      updateData() {
        this.fragment = API.fragment;
        this.$forceUpdate();
      },
      openFirstLesson() {
        const self = this;
        self.openLesson(self.course.lessons[0]);
      },
      openNextLesson() {
        const self = this;
        const lessons = self.course.lessons;
        let nextLesson;
        lessons.forEach((lesson) => {
          if (nextLesson) return;
          if (!self.lessonCompleted(lesson.id)) {
            nextLesson = lesson;
          }
        });
        if (!nextLesson) return;
        self.openLesson(nextLesson);
      },
      lessonCompleted(id) {
        return !!this.fragment.data.completed_lessons[id];
      },
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
      openClickLesson(lesson) {
        const self = this;
        if (self.lessonCompleted(lesson.id) && lesson.type === 'video') {
          self.openLesson(lesson);
        }
      },
    },
  };
</script>

