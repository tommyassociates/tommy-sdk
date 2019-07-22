<template>
  <f7-page class="education-page education-lesson-quiz-page">
    <f7-navbar>
      <tommy-nav-back />
      <f7-nav-title>{{lesson.pageName}}</f7-nav-title>
    </f7-navbar>
    <a href="#" @click="checkAnswer" v-if="!answer || (answer && !wrong)" class="education-toolbar-button" :class="{'education-toolbar-button-disabled': !answer}" slot="fixed">{{$t('education.next_button')}}</a>
    <a href="#" @click="openPreviousLesson" v-if="answer && wrong" class="education-toolbar-button" slot="fixed">{{$t('education.back_button')}}</a>
    <div class="education-progressbar">
      <span :style="`width: ${(current + 1) / total * 100}%`"></span>
    </div>
    <div class="education-progressbar-label">{{current + 1}}/{{total}}</div>
    <div class="education-lesson-quiz-description" v-if="lesson.pageDescription" v-html="lesson.pageDescription"></div>

    <div class="education-lesson-quiz-question" v-html="questionHtml"></div>
    <div class="education-lesson-quiz-options" v-if="!wrong">
      <span
        v-for="(option, index) in question.options"
        :key="index"
        :class="{selected: answer === option}"
        @click="answer = option"
      >{{option}}</span>
    </div>
    <div class="education-lesson-quiz-wrong" v-if="wrong">
      <i></i>
      <div v-html="question.wrongText"></div>
    </div>
  </f7-page>
</template>
<script>
  import API from '../api';

  export default {
    props: {
      course: Object,
      lesson: Object,
    },
    data() {
      const self = this;
      const currentLesson = self.course.lessons.filter(l => l.id === self.lesson.id)[0];
      const currentLessonIndex = self.course.lessons.indexOf(currentLesson);
      const previousLesson = self.course.lessons[currentLessonIndex - 1];
      const nextLesson = self.course.lessons[currentLessonIndex + 1];
      return {
        startTime: null,
        minimumStayReached: false,
        showContinueButton: false,
        previousLesson,
        nextLesson,
        current: 0,
        total: self.lesson.questions.length,
        answer: null,
        wrong: false,
      };
    },
    computed: {
      question() {
        const self = this;
        return self.lesson.questions[self.current];
      },
      questionHtml() {
        const self = this;
        if (self.answer) {
          return self.question.question.replace('$$$', `<span class="question-answer">${self.answer}</span>`);
        }
        return self.question.question.replace('$$$', '<span class="question-placeholder"></span>');
      },
    },
    methods: {
      t(key) {
        return this.$t(`education.lesson_quiz.${key}`);
      },
      checkAnswer() {
        const self = this;
        if (self.answer !== self.question.correct) {
          self.wrong = true;
        } else {
          const hasNextQuestion = self.current < (self.total - 1);
          if (hasNextQuestion) {
            self.answer = null;
            self.wrong = false;
            self.current += 1;
          } else {
            // TODO: save correct quiz
            API.completeLesson(self.$root.user.id, self.lesson.id).then((f) => {
              API.fragment = f;
              self.$events.$emit('edication:updatedata');
              self.openNextLesson();
            });
          }
        }
      },
      openNextLesson() {
        const self = this;
        if (!self.nextLesson) {
          const course = self.course;
          const lessonIds = course.lessons.map(l => l.id);
          const completedLessonsIds = Object.keys(API.fragment.data.completed_lessons);
          let completed = true;
          lessonIds.forEach((id) => {
            if (completedLessonsIds.indexOf(id) < 0) completed = false;
          });
          if (!completed) {
            self.$f7router.back();
            return;
          }
          self.$f7router.navigate('/education/certificate/', {
            reloadCurrent: true,
            props: {
              course: self.course,
            },
          });
          return;
        }
        self.$f7router.navigate(`/education/lesson-${self.nextLesson.type}/`, {
          reloadCurrent: true,
          props: {
            course: self.course,
            lesson: self.nextLesson,
          },
        });
      },
      openPreviousLesson() {
        const self = this;
        if (!self.previousLesson) return;
        self.$f7router.navigate(`/education/lesson-${self.previousLesson.type}/`, {
          reloadCurrent: true,
          props: {
            course: self.course,
            lesson: self.previousLesson,
          },
        });
      },
    },
  };
</script>

