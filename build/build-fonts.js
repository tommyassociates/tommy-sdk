/* eslint import/no-extraneous-dependencies: ["error", {"devDependencies": true}] */
/* eslint no-console: "off" */
/* eslint import/no-unresolved: "off" */
/* eslint global-require: "off" */
/* eslint no-param-reassign: ["error", { "props": false }] */

const gulp = require('gulp');

function build(cb) {
  const target = process.env.TARGET || 'web';
  const outPath = './www';

  gulp.src(['./src/fonts/**/*.*'])
    .pipe(gulp.dest(`${outPath}/fonts/`))
    .on('end', () => {
      if (cb) cb();
    });
}

module.exports = build;
