const gulp = require('gulp')
const nodemon = require('gulp-nodemon')
const sass = require('gulp-ruby-sass')
const babel = require("gulp-babel")
const es2015 = require('babel-preset-es2015')
const sourcemaps = require('gulp-sourcemaps')
const concat = require('gulp-concat')
const uglify = require('gulp-uglify')
const browserify = require('browserify');
const babelify = require('babelify');
const source = require('vinyl-source-stream');
const rename = require('gulp-rename');
const streamify = require('gulp-streamify');
const browserSync = require('browser-sync')
const fs = require('fs')
const junk = require('junk')
const path = require('path')
const reload = browserSync.reload;

const getFilteredFiles = ((folder, package) => {
  let files = fs.readdirSync(folder, package);
  files = files.filter(junk.not);
  return files;
});

// Get all addons
const addons = (() => {
  const addons = [];
  let packages = getFilteredFiles(path.join(__dirname, 'addons'));
  for (let i = 0; i < packages.length; i++) {
    addons.push(`${packages[i]}/${getFilteredFiles(path.join(__dirname, 'addons', packages[i]))}`)
  }
  return addons
})()


// Addon specific tasks
for (const addon of addons) {
  const viewdir = `./addons/${addon}/views/`
  const outdir = `./addons/${addon}/views/build`
  console.log('Registering addon tasks', addon)

  if (fs.existsSync(`${viewdir}stylesheets/index.scss`)) {
    gulp.task(`addon-scss-${addon}`, () => {
      return sass(`${viewdir}stylesheets/index.scss`)
        .on('error', sass.logError)
        .pipe(concat('bundle.css'))
        .pipe(gulp.dest(outdir))
    })
  }

  if (fs.existsSync(`${viewdir}javascripts/index.js`)) {
    gulp.task(`addon-js-${addon}`, () => {
      return browserify(`${viewdir}javascripts/index.js`)
        .transform(babelify, {presets: [es2015]})
        .bundle()
        .pipe(source('bundle.js'))
        .pipe(gulp.dest(`${viewdir}build`))
        .pipe(rename('bundle.min.js'))
        .pipe(streamify(concat('bundle.min.js')))
        .pipe(streamify(uglify()))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest(outdir))
    })
  }

  if (fs.existsSync(`${viewdir}templates/`)) {
    gulp.task(`addon-tpl-${addon}`, () => {
      return gulp.src(`${viewdir}templates/*.tpl.html`)
        .pipe(concat('bundle.tpl.html'))
        .pipe(gulp.dest(outdir))
    })
  }
}

// gulp.task('stylesheets', function () {
//   return gulp.src('./public/css/*.scss')
//     .pipe(sass().on('error', sass.logError))
//     .pipe(gulp.dest('./public/css'))
// })

gulp.task('browser-sync', ['nodemon'], () => {
  browserSync({
    proxy: 'localhost:4002',  // local node app address
    port: 5000,  // use *different* port than above
    notify: true
  })
})

gulp.task('nodemon', cb => {
  let called = false;
  return nodemon({
    script: 'sdk.js',
    ignore: [
      'gulpfile.js',
      'node_modules/'
    ]
  })
  .on('start', () => {
    if (!called) {
      called = true;
      cb()
    }
  })
  .on('restart', () => {
    setTimeout(() => {
      reload({ stream: false })
    }, 1000)
  })
})

gulp.task('default', ['browser-sync'], () => {
  for (const addon of addons) {
    gulp.watch([`./addons/${addon}/views/stylesheets/*.scss`], [`addon-scss-${addon}`, reload])
    gulp.watch([`./addons/${addon}/views/javascripts/**/*.js`], [`addon-js-${addon}`, reload])
    gulp.watch([`./addons/${addon}/views/templates/*.tpl.html`], [`addon-tpl-${addon}`, reload])
  }

  gulp.watch(['addons/**/*.html'], reload)
  gulp.watch(['public/*.html'], reload)
})
