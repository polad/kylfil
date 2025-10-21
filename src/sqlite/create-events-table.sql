CREATE TABLE IF NOT EXISTS events (
  seq INTEGER,
  id BLOB NOT NULL,
  stream_id BLOB NOT NULL,
  version INTEGER NOT NULL,
  type TEXT NOT NULL,
  data TEXT,
  PRIMARY KEY ( seq ),
  UNIQUE ( id ),
  UNIQUE ( stream_id, version )
) STRICT
