'use strict';

var url = require('url');
var util = require('util');
var path = require('path');
var fs = require('fs');
var http = require('http');
var https = require('https');
var ping = require('ping');
var dns = require('dns');
var net = require('net');
var validator = require('validator');
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
	this.postMessage(channel, message, {link_names: false});
}

KnockKnockBot.prototype._onMessage = function (message) {

	var self = this;

    if (message.type === 'message' && message.subtype !== 'bot_message') {

    	if (typeof message.channel === 'string') {

    		var messageText = message.text;

    		if (message.channel[0] === 'C' || message.channel[0] === 'G') {
    			if (!messageText.startsWith('<@' + this.user.id + '>:')) {
    				return;
    			}
    		}

    		// remove mention at beginning
    		messageText = messageText.replace('<@' + this.user.id + '>: ', '');

    		// clear url syntax <http://www.example.org|www.example.org> --> www.example.org
    		messageText = messageText.replace(/<(.*?)\|(.*?)>/g, '$2');

			// clear url syntax <http://www.example.org> --> http://www.example.org
    		messageText = messageText.replace(/<(.*?)>/g, '$1');

    		var parts = messageText.split(' ');
    		var action = parts[0];

    		switch (action) {

    			case 'monitor':

    				var target = parts[1] || null;
    				var type = parts[2] || null;
    				var port = parts[3] || null;

    				var types = ['ping', 'http', 'port'];

    				if (!type || types.indexOf(type) == -1) {
    					self.sendMessage(message.channel, '<@' + message.user + '>: Must provide monitor type. (ping, http, port)');
    					return;
    				}

					if (type == 'http') {
						if (!target || !validator.isURL(target, {protocols: ['http', 'https'], require_protocol: true})) {
							self.sendMessage(message.channel, '<@' + message.user + '>: Must provide valid target url for http monitor.');
    						return;
						}
					}

    				if (type == 'ping' || type == 'port') {
    					if (!target || (!validator.isIP(target) && !validator.isFQDN(target))) {
    						self.sendMessage(message.channel, '<@' + message.user + '>: Must provide valid target hostname for http monitor.');
    						return;
    					}
    				}

    				if (type == 'port') {
    					if (!port || parseInt(port) < 1 || parseInt(port) > 65535) {
    						self.sendMessage(message.channel, '<@' + message.user + '>: Must provide port between 1 and 65535.');
    						return;
    					}
    				}

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
    							self.sendMessage(message.channel, '<@' + message.user + '>: Error adding monitor.');
    							console.log(err);
    						} else {
    							self.sendMessage(message.channel, '<@' + message.user + '>: Monitor added.');
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
    							self.sendMessage(message.channel, '<@' + message.user + '>: Error reading monitors.');
    							console.log(err);
    						} else {
    							if (numRows === 0) {
    								self.sendMessage(message.channel, '<@' + message.user + '>: You have currently no monitors.');
    							} else {

    								if (parts[1] != 'all') {
    									self.sendMessage(message.channel, '<@' + message.user + '>: Here is a list of your monitors in THIS CHANNEL:\n\n' + monitors.join('\n'));
    								} else {
    									self.sendMessage(message.channel, '<@' + message.user + '>: Here is a list of your monitors in ALL CHANNELS:\n\n' + monitors.join('\n'));
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
    						self.sendMessage(message.channel, '<@' + message.user + '>: Unable to delete monitor.');
    						console.log(err);
						} else if (this.changes === 1) {
							self.sendMessage(message.channel, '<@' + message.user + '>: Monitor #' + monitorId + ' deleted.');
						} else {
							self.sendMessage(message.channel, '<@' + message.user + '>: No monitors were affected.');
						}
    				});

    			break;

    			default:
    				self.sendMessage(message.channel, '<@' + message.user + '>: I didn\'t understand you!');
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

					ping.sys.probe(row.target, function(isAlive) {

						if (isAlive) {
							setMonitorState(row, false);
						} else {
							setMonitorState(row, true);
						}
					});

				break;

				case 'port':

					var client = net.connect(row.port, row.target, function() {
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

module.exports = KnockKnockBot;