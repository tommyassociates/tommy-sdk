import Splash from './pages/splash.vue';
import Index from './pages/index.vue';
import Course from './pages/course.vue';
import LessonVideo from './pages/lesson-video.vue';
import LessonQuiz from './pages/lesson-quiz.vue';
import Certificate from './pages/certificate.vue';

const routes = [
  {
    path: '/education/index/',
    component: Index,
  },
  {
    path: '/education/',
    async(to, from, resolve) {
      if (localStorage.getItem('education.splash')) {
        resolve({
          component: Index,
        });
      } else {
        localStorage.setItem('education.splash', true);
        resolve({
          component: Splash,
        });
      }
    },
  },
  {
    path: '/education/course/:courseId/',
    component: Course,
  },
  {
    path: '/education/lesson-video/',
    component: LessonVideo,
  },
  {
    path: '/education/lesson-quiz/',
    component: LessonQuiz,
  },
  {
    path: '/education/certificate/',
    component: Certificate,
  },
];
export default routes;
