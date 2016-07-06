'use strict';

var url = require('url');
var util = require('util');
var path = require('path');
var fs = require('fs');
var http = require('http');
var https = require('https');
var ping = require('net-ping');
var dns = require('dns');
var net = require('net');
var SQLite = require('sqlite3').verbose();
var Bot = require('slackbots');

var KnockKnockBot = function Constructor(settings) {
    this.settings = settings;
    this.settings.name = this.settings.name || 'knockknockbot';
    this.dbPath = settings.dbPath || path.resolve(__dirname, '..', 'data', 'knock-knock-bot.db');

    this.user = null;
    this.db = null;
    this.monitoringInProgress = false;
};

util.inherits(KnockKnockBot, Bot);

KnockKnockBot.prototype.run = function () {
    KnockKnockBot.super_.call(this, this.settings);

    this.on('start', this._onStart);
    this.on('message', this._onMessage);
};

KnockKnockBot.prototype._onStart = function () {
    this._loadBotUser();
    this._connectDb();
    this._startMonitoring();
};

KnockKnockBot.prototype.sendMessage = function (channel, message) {
	this.postMessage(channel, message, {as_user: true});
}

KnockKnockBot.prototype._onMessage = function (message) {

	var self = this;

    if (this._isChatMessage(message)) {

    	if (this._isFromKnockKnockBot(message)) {
    		return;
    	}

    	if (typeof message.channel === 'string') {

    		var messageText = message.text;

    		if (message.channel[0] === 'C' || message.channel[0] === 'G') {
    			if (!messageText.startsWith('<@' + this.user.id + '>:')) {
    				return;
    			}
    		}

    		messageText = messageText.replace('<@' + this.user.id + '>: ', '');

    		var parts = messageText.split(' ');
    		var action = parts[0];

    		switch (action) {

    			case 'monitor':

    				var target = parts[1] || null;
    				var type = parts[2] || 'ping';
    				var port = parts[3] || null;

    				var data = [
						message.user,
						message.channel,
						target,
						type,
						port
					];

    				self.db.run(
    					'INSERT INTO monitors (user, channel, target, type, port) VALUES (?, ?, ?, ?, ?)', data, function(err) {
    						if (err) {
    							self.sendMessage(message.channel, 'Error adding monitor.');
    							console.log(err);
    						} else {
    							self.sendMessage(message.channel, 'Monitor added.');
    							console.log('added monitor: ', data);
    						}
    					}
    				);

    			break;

    			case 'monitors':

    				var monitors = [];

    				var query = 'SELECT * FROM monitors WHERE user = ?';
    				var params = [message.user];

    				if (parts[1] != 'all') {
    					query += ' AND channel = ?';
    					params.push(message.channel);
    				}

    				self.db.each(query, params, function(err, row) {

    						if (err) {
    							console.log(err);
    						} else {

    							var monitorString = '#' + row.id + ' ' + row.target + ' ' + row.type;

    							if (row.port) {
    								monitorString += ' Port: ' + row.port;
    							}

    							if (parts[1] == 'all') {
    								monitorString += ' (Channel: ' + row.channel + ')';
    							}

								monitors.push(monitorString);
    						}

    					}, function(err, numRows) {

    						if (err) {
    							self.sendMessage(message.channel, 'Error reading monitors.');
    							console.log(err);
    						} else {
    							if (numRows === 0) {
    								self.sendMessage(message.channel, 'You have currently no monitors.');
    							} else {

    								if (parts[1] != 'all') {
    									self.sendMessage(message.channel, 'Here is a list of your monitors in THIS CHANNEL:\n\n' + monitors.join('\n'));
    								} else {
    									self.sendMessage(message.channel, 'Here is a list of your monitors in ALL CHANNELS:\n\n' + monitors.join('\n'));
    								}
    							}
    						}

    					}
    				);

    			break;

    			case 'unmonitor':

    				var monitorId = parts[1];

    				self.db.run('DELETE FROM monitors WHERE id = ? AND user = ?', [monitorId, message.user], function(err) {
    					if (err) {
    						self.sendMessage(message.channel, 'Unable to delete monitor.');
    						console.log(err);
						} else if (this.changes === 1) {
							self.sendMessage(message.channel, 'Monitor #' + monitorId + ' deleted.');
						} else {
							self.sendMessage(message.channel, 'No monitors were affected.');
						}
    				});

    			break;

    			default:
    				self.sendMessage(message.channel, 'I didn\'t understand you!');
    		}
    	}
	}
};

KnockKnockBot.prototype._loadBotUser = function () {
    var self = this;
    this.user = this.users.filter(function (user) {
        return user.name === self.name;
    })[0];
};

KnockKnockBot.prototype._connectDb = function () {

	var self = this;

    if (!fs.existsSync(self.dbPath)) {

    	console.log('creating new database');

    	self.db = new SQLite.Database(self.dbPath);

		self.db.run(fs.readFileSync(path.resolve(__dirname, '..', 'create-tables.sql')).toString(), {}, function(err) {
			if (err) {
				console.log(err);
			} else {
				console.log('database created');
			}
		});

    } else {

		self.db = new SQLite.Database(self.dbPath);

    }
};

KnockKnockBot.prototype._startMonitoring = function () {

	var self = this;

	setInterval(function() {

		// avoid race conditions
		if (self.monitoringInProgress) {
			return;
		}

		self.monitoringInProgress = true;

		self.db.each('SELECT * FROM monitors', function(err, row) {

			if (!row.target || !row.type) {
				return;
			}

			var monitorString = row.target + ' ' + row.type.toUpperCase() + ((row.port) ? ' ' + row.port : '');
			var recoveryMessage = '<@' + row.user + '>: RECOVERY: ' + monitorString;
			var failedMessage = '<@' + row.user + '>: FAILED: ' + monitorString;

			var setMonitorState = function(row, failed, info) {

				if (failed && row.last_state_failed != 1) {

					var message = failedMessage;

					if (info) {
						message += ': ' + info;
					}

					self.db.run('UPDATE monitors SET last_state_failed = 1 WHERE id = ?', row.id);
					self.sendMessage(row.channel, message);

				} else if (!failed && row.last_state_failed == 1) {

					var message = recoveryMessage;

					if (info) {
						message += ': ' + info;
					}

					self.db.run('UPDATE monitors SET last_state_failed = 0 WHERE id = ?', row.id);
					self.sendMessage(row.channel, message);
				}
			}

			switch (row.type) {

				case 'http':

					var target = row.target.substring(1, row.target.length - 1);
					var parsedUrl = url.parse(target);

					if (!parsedUrl) {
						return;
					}

					if (parsedUrl.protocol == 'http:') {

						http.get(target, (res) => {
							if (res.statusCode === 500) {
								setMonitorState(row, true, 'response code 500');
							} else {
								setMonitorState(row, false);
							}
						}).on('error', (e) => {
							setMonitorState(row, true, e.message);
						});

					} else if (parsedUrl.protocol == 'https:') {

						https.get(target, (res) => {
							if (res.statusCode === 500) {
								setMonitorState(row, true, 'response code 500');
							} else {
								setMonitorState(row, false);
							}
						}).on('error', (e) => {
							setMonitorState(row, true, e.message);
						});
					} else {
						return;
					}

				break;

				case 'ping':

					var pingSession = ping.createSession();

					var target = row.target.substring(1, row.target.length - 1).split('|')[1];

					dns.resolve(target, 'A', function(err, addresses) {

						if (err) {
							setMonitorState(row, true, err.toString());
							console.log(err);
							return;
						}

						if (addresses) {
							pingSession.pingHost(addresses[0], function(err, target) {

							if (err) {
								setMonitorState(row, true, err.toString());
							} else {
								setMonitorState(row, false);
							}
						});

						}
					});

				break;

				case 'port':

					var target = row.target.substring(1, row.target.length - 1).split('|')[1];

					var client = net.connect(row.port, target, function() {
						setMonitorState(row, false);
						client.end();
					}).on('error', function(err) {
						setMonitorState(row, true, err.toString());
					});

				break;

				default:
					console.log('Unknown monitor type: ' + row.type);

			}

		}, function(err, numRows) {

			console.log('checked ' + numRows + ' monitors');

			self.monitoringInProgress = false;
		});

	}, 60000);

}

KnockKnockBot.prototype._isChatMessage = function (message) {
    return message.type === 'message' && Boolean(message.text);
};

KnockKnockBot.prototype._isFromKnockKnockBot = function (message) {
    return message.user === this.user.id;
};

module.exports = KnockKnockBot;