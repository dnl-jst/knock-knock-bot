CREATE TABLE IF NOT EXISTS `monitors` (
  `id` INTEGER PRIMARY KEY AUTOINCREMENT,
  `user` TEXT,
  `channel` TEXT,
  `target` TEXT,
  `type` TEXT DEFAULT 'ping',
  `port` INTEGER DEFAULT 0,
  `last_state_failed` INTEGER DEFAULT 0
);