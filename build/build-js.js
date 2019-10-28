/* eslint no-console: off */
/* eslint global-require: off */
const gulp = require('gulp');
const gulpif = require('gulp-if');
const rollup = require('rollup');
const buble = require('rollup-plugin-buble');
const replace = require('rollup-plugin-replace');
const resolve = require('rollup-plugin-node-resolve');
const commonjs = require('rollup-plugin-commonjs');
const vue = require('rollup-plugin-vue');
const sourcemaps = require('gulp-sourcemaps');
const uglify = require('gulp-uglify');
const rename = require('gulp-rename');
const clean = require('gulp-clean');

// let cache;
function build(cb) {
  const env = process.env.NODE_ENV || 'development';
  const target = process.env.TARGET || 'web';
  const outPath = './www';

  const stream = gulp
    .src([
      `${outPath}/js/*.js`,
      `${outPath}/js/*.js.map`,
    ])
    .pipe(clean({ force: true }));

  stream.on('finish', () => {
    rollup.rollup({
      input: './src/sdk.js',
      // cache,
      onwarn(warning, warn) {
        const ignore = ['CIRCULAR_DEPENDENCY', 'EVAL'];
        if (warning.code === 'CIRCULAR_DEPENDENCY' && warning.message.indexOf('/moment/') >= 0) {
          return;
        }
        if (ignore.indexOf(warning.code) >= 0) {
          return;
        }
        warn(warning);
      },
      plugins: [
        vue(),
        replace({
          'process.env.NODE_ENV': JSON.stringify(env), // or 'production'
          'process.env.TARGET': JSON.stringify(target), // or 'production'
        }),
        //resolve({ jsnext: true, browser: true }),
        resolve({ 
          mainFields: ['module', 'main', 'jsnext', 'browser']
        }),
        commonjs(),
        buble({
          objectAssign: 'Object.assign',
        }),
      ],
    }).then((bundle) => { // eslint-disable-line
      // cache = bundle;
      return bundle.write({
        format: 'iife',
        name: 'tommy',
        strict: false,
        sourcemap: false,
        file: `${outPath}/js/sdk.js`,
      });
    }).then(() => {
      if (env === 'development') {
        if (cb) cb();
        return;
      }
      // Minified version
      gulp.src(`${outPath}/js/sdk.js`)
        .pipe(gulpif(target === 'web', sourcemaps.init()))
        .pipe(uglify({ keep_fnames: true }))
        .pipe(rename((filePath) => {
          /* eslint no-param-reassign: ["error", { "props": false }] */
          filePath.basename += '.min';
        }))
        .pipe(gulpif(target === 'web', sourcemaps.write('./')))
        .pipe(gulp.dest(`${outPath}/js/`))
        .on('end', () => {
          if (cb) cb();
        });
    }).catch((err) => {
      if (cb) cb();
      console.log(err);
    });
  });
}

module.exports = build;
