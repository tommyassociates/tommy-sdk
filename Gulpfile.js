var gulp = require('gulp');
var nodemon = require('gulp-nodemon');
var sass = require('gulp-ruby-sass');
var browserSync = require('browser-sync');
var reload = browserSync.reload;

/**
 * Gulp Tasks
 */

gulp.task('stylesheets', function () {
  return gulp.src('./public/css/*.scss')
    .pipe(sass().on('error', sass.logError))
    .pipe(gulp.dest('./public/css'));
});

gulp.task('browser-sync', ['nodemon'], function() {
  browserSync({
    proxy: 'localhost:4001',  // local node app address
    port: 5000,  // use *different* port than above
    notify: true
  });
});

gulp.task('nodemon', function (cb) {
  var called = false;
  return nodemon({
    script: 'sdk.js',
    ignore: [
      'gulpfile.js',
      'node_modules/'
    ]
  })
  .on('start', function () {
    if (!called) {
      called = true;
      cb();
    }
  })
  .on('restart', function () {
    setTimeout(function () {
      reload({ stream: false });
    }, 1000);
  });
});

gulp.task('default', ['browser-sync'], function () {
  // gulp.watch(['public/js/**/*.js'], ['scripts', reload]);
  // gulp.watch(['public/css/**/*.scss'], ['styles', reload]);
  gulp.watch(['public/*.html'], reload);
});
