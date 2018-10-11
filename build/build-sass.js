/* eslint import/no-extraneous-dependencies: ["error", {"devDependencies": true}] */
/* eslint no-console: "off" */
/* eslint import/no-unresolved: "off" */
/* eslint global-require: "off" */
/* eslint no-param-reassign: ["error", { "props": false }] */
const gulp = require('gulp');
const sass = require('gulp-sass');
const autoprefixer = require('gulp-autoprefixer');
const rename = require('gulp-rename');
const cleanCSS = require('gulp-clean-css');
const clean = require('gulp-clean');

function build(cb) {
  const env = process.env.NODE_ENV || 'development';
  const target = process.env.TARGET || 'web';
  const outPath = './www';

  const stream = gulp
    .src(`${outPath}/css/*.css`)
    .pipe(clean({ force: true }));

  stream.on('finish', () => {
    gulp.src('./src/sdk.scss')
      .pipe(sass())
      // .pipe(importCss())
      .on('error', (err) => {
        if (cb) cb();
        console.log(err.toString());
      })
      .pipe(autoprefixer({
        cascade: false,
      }))
      .on('error', (err) => {
        if (cb) cb();
        console.log(err.toString());
      })
      .pipe(gulp.dest(`${outPath}/css/`))
      .on('end', () => {
        if (env === 'development') {
          if (cb) cb();
          return;
        }
        gulp.src(`${outPath}/css/sdk.css`)
          .pipe(cleanCSS({
            advanced: false,
            aggressiveMerging: false,
          }))
          .pipe(rename((filePath) => {
            filePath.basename += '.min';
          }))
          .pipe(gulp.dest(`${outPath}/css/`))
          .on('end', () => {
            if (cb) cb();
          });
      });
  });
}

module.exports = build;
