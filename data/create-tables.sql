CREATE TABLE IF NOT EXISTS `monitors` (
  `user` TEXT,
  `target` TEXT,
  `type` TEXT DEFAULT 'ping',
  `port` INTEGER DEFAULT 0,
  PRIMARY KEY (`user`,`target`,`type`,`port`)
);