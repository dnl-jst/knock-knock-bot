'use strict';

var path = require('path');
var fs = require('fs');
var sqlite3 = require('sqlite3').verbose();

var outputFile = process.argv[2] || path.resolve(__dirname, 'knock-knock-bot.db');
var db = new sqlite3.Database(outputFile);

db.serialize();
db.run(fs.readFileSync(path.resolve(__dirname, 'create-tables.sql')).toString(), {}, function(err) {
	if (err) {
		console.log(err);
	}
});