#!/usr/bin/env node
import { run } from '../src/cli.js';

run(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    // Never let an unexpected rejection exit 0.
    console.error(err?.stack ?? err);
    process.exitCode = 2;
  });
