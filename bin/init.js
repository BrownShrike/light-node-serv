#! /usr/bin/env node


const program = require('commander');

program
    .version(require('../package.json').version, '-v, --version')
    .command('single', 'to single');

program.parse(process.argv);

