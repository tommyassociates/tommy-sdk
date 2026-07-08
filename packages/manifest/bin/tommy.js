#!/usr/bin/env node
// `tommy` binary — thin entry over src/cli.js. Runs from source (ESM) with zero
// build step, so `node bin/tommy.js manifest validate …` works pre-build.
import { run } from '../src/cli.js';

run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    // run() wraps everything today, but never let an unexpected rejection exit 0.
    console.error(err?.stack ?? err);
    process.exitCode = 2;
  });
