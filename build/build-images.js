/* eslint import/no-extraneous-dependencies: ["error", {"devDependencies": true}] */
/* eslint no-console: "off" */
/* eslint import/no-unresolved: "off" */
/* eslint global-require: "off" */
/* eslint no-param-reassign: ["error", { "props": false }] */

const gulp = require('gulp');

function build(cb) {
  const target = process.env.TARGET || 'web';
  const outPath = './www';
  gulp.src(['./src/i/**/*.*'])
    .on('error', (err) => {
      if (cb) cb();
      console.log(err.toString());
    })
    .pipe(gulp.dest(`${outPath}/i`))
    .on('end', () => {
      if (cb) cb();
    });
}

module.exports = build;
