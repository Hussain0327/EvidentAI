#!/usr/bin/env node
const { createProgram } = require('../dist/index.js');
const program = createProgram();
program.parseAsync(process.argv).catch((error) => {
  console.error(`\x1b[31m✗ ${error.message}\x1b[0m`);
  process.exit(1);
});
