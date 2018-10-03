const path = require('path');
const gulp = require('gulp');
const connect = require('gulp-connect');
const gopen = require('gulp-open');
const buildJs = require('./build/build-js.js');
const buildSass = require('./build/build-sass.js');
const buildImages = require('./build/build-images.js');
const buildFonts = require('./build/build-fonts.js');
const buildAddon = require('./build/build-addon');

gulp.task('js', (cb) => {
  buildJs(cb);
});

gulp.task('scss', (cb) => {
  buildSass(cb);
});

gulp.task('images', (cb) => {
  buildImages(cb);
});

gulp.task('fonts', (cb) => {
  buildFonts(cb);
});

gulp.task('build', ['images', 'fonts', 'js', 'scss']);

gulp.task('watch', () => {
  gulp.watch('./src/**/**/*.js', ['js']);
  gulp.watch('./src/**/**/*.vue', ['js']);
  gulp.watch('./src/**/**/*.scss', ['scss']);
  gulp.watch('./src/i/*.*', ['images']);
  gulp.watch(['./addons/**/*.*'], (data) => {
    const addon = data.path.split(`${__dirname}/addons/`)[1].split('/')[0];
    if (data.path.indexOf('/build/') >= 0) return;
    buildAddon(addon);
  });
});

gulp.task('connect', () => {
  connect.server({
    root: ['./www/'],
    livereload: false,
    port: '5000',
  });
});

gulp.task('open', () => {
  gulp.src('/').pipe(gopen({ uri: 'http://localhost:4002/' }));
});

gulp.task('default', ['build', 'watch', 'open']);
