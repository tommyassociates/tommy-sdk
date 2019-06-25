<template>
  <f7-page class="education-page education-lesson-video-page">
    <f7-navbar>
      <f7-nav-left>
        <a href="#" @click="exit" class="link icon-only"><i class="material-icons md-36">keyboard_arrow_left</i></a>
      </f7-nav-left>
      <f7-nav-title>{{lesson.pageName}}</f7-nav-title>
    </f7-navbar>
    <a href="#" v-if="showContinueButton && nextLesson" @click="openNextLesson()" class="education-toolbar-button" slot="fixed">{{$t('education.continue_button')}}</a>
    <video
      :src="`${$addonAssetsUrl}courses-videos/${lesson.video}`"
      class="no-fastclick"
      controls
      @playing="onVideoStart"
    ></video>
    <f7-block strong no-hairlines class="no-margin">
      <p><b>{{lesson.pageName}}</b></p>
      <div v-if="lesson.pageDescription" v-html="lesson.pageDescription"></div>
    </f7-block>
  </f7-page>
</template>
<script>
  function formatDuration(t) {
    let minutes = Math.floor(t / 60);
    let seconds = Math.floor(t - minutes * 60);
    if (minutes < 10) minutes = `0${minutes}`;
    if (seconds < 10) seconds = `0${seconds}`;
    return `${minutes}:${seconds}`;
  }
  export default {
    props: {
      course: Object,
      lesson: Object,
    },
    data() {
      const self = this;
      const currentLesson = self.course.lessons.filter(l => l.id === self.lesson.id)[0];
      const currentLessonIndex = self.course.lessons.indexOf(currentLesson);
      const nextLesson = self.course.lessons[currentLessonIndex + 1];
      return {
        startTime: null,
        minimumStayReached: false,
        showContinueButton: false,
        nextLesson,
      };
    },
    beforeDestroy() {
      const self = this;
      clearTimeout(self.timeout);
    },
    methods: {
      t(key) {
        return this.$t(`education.lesson_video.${key}`);
      },
      exit() {
        const self = this;
        if (self.startTime && !self.minimumStayReached) {
          const dialog = self.$f7.dialog.create({
            text: self.$t('education.lesson.exit_confirm_text', {
              required: formatDuration(self.lesson.minimumStay),
              current: formatDuration((new Date().getTime() - self.startTime) / 1000),
            }),
            buttons: [
              {
                text: self.$t('education.lesson.dismiss_button'),
                bold: true,
              },
            ],
          });
          dialog.open();
          return;
        }
        self.$f7router.back();
      },
      openNextLesson() {
        const self = this;
        if (!self.nextLesson) return;
        self.$f7router.navigate(`/education/lesson-${self.nextLesson.type}/`, {
          reloadCurrent: true,
          props: {
            course: self.course,
            lesson: self.nextLesson,
          },
        });
      },
      showContinueDialog() {
        const self = this;
        if (!self.nextLesson) return;
        const dialog = self.$f7.dialog.create({
          text: self.$t('education.lesson.video_complete_text'),
          buttons: [
            {
              text: self.$t('label.no'),
            },
            {
              text: self.$t('label.yes'),
              bold: true,
              onClick() {
                self.openNextLesson();
              },
            },
          ],
        });
        dialog.open();
      },
      onVideoStart() {
        const self = this;
        if (self.startTime) return;
        // TODO: check if it is already certified
        self.startTime = new Date().getTime();
        self.timeout = setTimeout(() => {
          // TODO: save correct lesson
          self.minimumStayReached = true;
          self.showContinueButton = true;
          self.showContinueDialog();
        }, self.lesson.minimumStay * 1000);
      },
    },
  };
</script>

