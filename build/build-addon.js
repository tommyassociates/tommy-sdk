/* eslint no-console: off */
const gulp = require("gulp");
const rollup = require("rollup");
const buble = require("rollup-plugin-buble");
const rollupResolve = require("rollup-plugin-node-resolve");
const commonjs = require("rollup-plugin-commonjs");
const vue = require("rollup-plugin-vue");
const uglify = require("gulp-uglify");
const sass = require("gulp-sass");
const autoprefixer = require("gulp-autoprefixer");
const cleanCSS = require("gulp-clean-css");
const inlineImage = require("gulp-inline-image");

function buildAddonJs(addonFolder) {
  const path = `./addons/${addonFolder}/1.0.0`;
  return new Promise((resolve, reject) => {
    rollup
      .rollup({
        input: `${path}/src/addon.js`,
        plugins: [
          vue(),
          rollupResolve({
            mainFields: ["module", "main", "jsnext", "browser"]
          }),
          commonjs(),
          buble({
            objectAssign: "Object.assign"
          })
        ]
      })
      .then(bundle => {
        // eslint-disable-line
        // cache = bundle;
        return bundle.write({
          format: "iife",
          name: "addon",
          strict: false,
          sourcemap: false,
          file: `${path}/build/addon.js`
        });
      })
      .then(() => {
        // Minified version
        gulp
          .src(`${path}/build/addon.js`)
          .pipe(uglify({ keep_fnames: true }))
          .pipe(gulp.dest(`${path}/build/`))
          .on("end", () => {
            resolve();
          });
      })
      .catch(err => {
        console.log(err);
        reject(err);
      });
  });
}
function buildAddonScss(addonFolder) {
  const path = `./addons/${addonFolder}/1.0.0`;
  return new Promise((resolve, reject) => {
    gulp
      .src(`${path}/src/addon.scss`)
      .pipe(sass())
      // .pipe(importCss())
      .on("error", err => {
        console.log(err.toString());
        reject(err);
      })
      .pipe(inlineImage())
      .pipe(
        autoprefixer({
          cascade: false
        })
      )
      .on("error", err => {
        console.log(err.toString());
        reject(err);
      })
      .pipe(gulp.dest(`${path}/build`))
      .on("end", () => {
        gulp
          .src(`${path}/build/addon.css`)
          .pipe(
            cleanCSS({
              advanced: false,
              aggressiveMerging: false
            })
          )
          .pipe(gulp.dest(`${path}/build/`))
          .on("end", () => {
            resolve();
          });
      });
  });
}
function buildAddon(addonFolder) {
  console.log(`Building addon "${addonFolder}"`);
  return new Promise((resolve, reject) => {
    Promise.all([buildAddonJs(addonFolder), buildAddonScss(addonFolder)])
      .then(() => {
        console.log(`Done addon "${addonFolder}"`);
        resolve();
      })
      .catch(err => {
        console.log(`Error addon "${addonFolder}"`, err);
        reject(err);
      });
  });
}

module.exports = buildAddon;
