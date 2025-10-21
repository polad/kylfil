"use strict";

const { ReadDirection } = require("../");
const { Binary, BinaryUuid } = require("./utils");

/* eventToDbRecord :: String -> Event -> Object */
const eventToDbRecord = (prefix) => (event) => ({
  [`${prefix}id`]: BinaryUuid(event.id),
  [`${prefix}stream_id`]: Binary(event.streamId),
  [`${prefix}version`]: event.version,
  [`${prefix}type`]: event.type,
  [`${prefix}data`]: JSON.stringify(event.data),
});

/* eventsNamedParams :: Array Event -> Object */
exports.eventsNamedParams = (events) =>
  ((values) => ({
    sql:
      "SELECT " +
      values
        .map((eventParams, index) =>
          Object.keys(eventParams)
            .map((name) => `:${name}`)
            .join(", "),
        )
        .join(" UNION ALL SELECT "),
    values,
  }))(events.map((event, index) => eventToDbRecord(`event_${index}_`)(event)));

/* DIRECTION_SQL :: ReadDirection -> String */
const DIRECTION_SQL = (direction) =>
  direction === ReadDirection.FORWARD ? "ASC" : "DESC";

/* AND_VERSION_SQL :: ReadDirection -> Integer -> String */
const AND_VERSION_SQL = (direction) => (fromVersion) =>
  Number.isInteger(fromVersion) && fromVersion > 0
    ? direction === ReadDirection.FORWARD
      ? "AND version>=:fromVersion"
      : "AND version<=:fromVersion"
    : "";

/* LIMIT_BY_MAX_COUNT_SQL :: Integer -> String */
const LIMIT_BY_MAX_COUNT_SQL = (maxCount) =>
  Number.isInteger(maxCount) && maxCount > 0 ? "LIMIT :maxCount" : "";

/* ReadSqlParts :: StreamParams -> ReadParams -> ReadSqlParts */
exports.ReadSqlParts = (streamParams) => (readParams) => ({
  storageName: streamParams?.storageName,
  directionSql: DIRECTION_SQL(readParams?.direction),
  andVersionSql: AND_VERSION_SQL(readParams?.direction)(
    readParams?.fromVersion,
  ),
  limitByMaxCountSql: LIMIT_BY_MAX_COUNT_SQL(readParams?.maxCount),
});
