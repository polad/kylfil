CREATE TABLE IF NOT EXISTS events (
  seq INT UNSIGNED NOT NULL AUTO_INCREMENT,
  id BINARY(16) NOT NULL,
  stream_id BINARY(16) NOT NULL,
  version INT NOT NULL,
  type VARCHAR(255) NOT NULL,
  data JSON,
  PRIMARY KEY ( seq ),
  UNIQUE idx_id ( id ),
  UNIQUE idx_stream_id_version ( stream_id, version )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
