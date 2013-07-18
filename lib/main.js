#!/usr/bin/env node
(function() {
  var cedict = require('./cedict');
  cedict.start(process.argv);
}).call(this);
