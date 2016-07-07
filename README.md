# knock-knock-bot

[![Travis](https://img.shields.io/travis/dnl-jst/knock-knock-bot.svg)](https://travis-ci.org/dnl-jst/knock-knock-bot) [![David](https://img.shields.io/david/dnl-jst/knock-knock-bot.svg)](https://david-dm.org/dnl-jst/knock-knock-bot)

knock-knock-bot allows you to create server monitoring from within slack.

## features

- create monitors for http-requests, pings and port-connects
- each user can create his own monitors and notifications will be put where he created the monitor: in direct contact with knock-knock-bot, in a public channel oder in a private group
- this allows users to create monitors that will alert a whole group when a monitor fails

## installation

first you need to create a slack bot integration. when done so you will get an api-key that you need when starting the knock-knock-bot.

### run as docker container

Pull latest docker image:

    docker pull dnljst/knock-knock-bot

Start your machine:

    docker run -d -e "BOT_API_KEY=<YOUR_BOT_API_KEY>" -e "BOT_DB_PATH=/data/kkb.db" -v /data --name my-knock-knock-bot dnljst/knock-knock-bot

## how-to use

### in direct message dialog with the knock-knock-bot

	@knockknockbot: monitor http://www.google.de http

will monitor the url http://www.google.de and notify the user directly if the request fails

### in a public or private channel:

	@knockknockbot: monitor http://www.google.de http

will monitor the url http://www.google.de and notify the whole channel if the request fails

## add a monitor

	@knockknockbot: monitor http://www.google.de http

## list monitors

### of current channel

	@knockknockbot: monitors

### of all channels

	@knockknockbot: monitors all

## remove monitor

remove monitor. you can find it's id in the monitor list.

	@knockknockbox: unmonitor <monitor-id>

## monitoring options

### http check

send get request to given url, check availability

	@knockknockbot: monitor http://www.google.de http

	@knockknockbot: monitor https://www.google.de http

### ping check

ping hosts

	@knockknockbot: monitor www.google.de ping

	@knockknockbot: monitor www.heise.de ping

### port check

check google mx on port 25

	@knockknockbot: monitor aspmx.l.google.com port 25