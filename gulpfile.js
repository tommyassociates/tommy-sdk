const path = require("path");
const gulp = require("gulp");
const gopen = require("gulp-open");
const buildJs = require("./build/build-js.js");
const buildSass = require("./build/build-sass.js");
const buildImages = require("./build/build-images.js");
const buildFonts = require("./build/build-fonts.js");
const buildAddon = require("./build/build-addon");

gulp.task("js", cb => {
  buildJs(cb);
});

gulp.task("scss", cb => {
  buildSass(cb);
});

gulp.task("images", cb => {
  buildImages(cb);
});

gulp.task("fonts", cb => {
  buildFonts(cb);
});

gulp.task("build", gulp.series(["images", "fonts", "js", "scss"]));

gulp.task("watch", () => {
  gulp.watch("./src/**/**/*.js", gulp.series(["js"]));
  gulp.watch("./src/**/**/*.vue", gulp.series(["js"]));
  gulp.watch("./src/**/**/*.scss", gulp.series(["scss"]));
  gulp.watch("./src/i/*.*", gulp.series(["images"]));
  gulp
    .watch(["./addons/**/*.*"], { events: ["change"] })
    .on("change", changedPath => {
      const patchSeparator = path.sep;
      if (changedPath.indexOf(`${patchSeparator}build${patchSeparator}`) >= 0)
        return;
      const addon = changedPath
        .split(`addons${patchSeparator}`)[1]
        .split(patchSeparator)[0];
      buildAddon(addon);
    });
});

gulp.task("open", () => {
  gulp.src("/").pipe(gopen({ uri: "http://localhost:4002/" }));
});

gulp.task("server", gulp.parallel(["build", "watch", "open"]));
