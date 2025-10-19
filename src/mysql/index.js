"use strict";

const { ReadDirection, StoredEvent, StoreProvider } = require("../");
const { Binary, BinaryUuid } = require("../lib/utils");

/* eventToDbRecord :: Event -> Array a */
const eventToDbRecord = (event) => [
  BinaryUuid(event.id),
  Binary(event.streamId),
  event.version,
  event.type,
  JSON.stringify(event.data),
];

/* toUuid :: String -> String */
const toUuid = (str) =>
  `${str.substring(0, 8)}-${str.substring(8, 12)}-${str.substring(12, 16)}-${str.substring(16, 20)}-${str.substring(20, 32)}`;

/* dbRecordToStoredEvent :: DbRecord -> StoredEvent */
const dbRecordToStoredEvent = (dbRecord) =>
  StoredEvent({
    seq: dbRecord.seq,
    id: toUuid(Buffer.from(dbRecord.id || "").toString("hex")),
    streamId: Buffer.from(dbRecord.stream_id || "").toString("hex"),
    version: dbRecord.version,
    type: dbRecord.type,
    data: dbRecord.data,
  });

/* dbResponseToStoredEvents :: DbQueryResponse -> Array StoredEvent */
const dbResponseToStoredEvents = (response) =>
  (response?.[0] || []).map(dbRecordToStoredEvent);

/* readEventsById :: DbConnection -> StreamParams -> Array String -> Promise Array StoredEvent */
const readEventsById = (dbConnection) => (streamParams) => (eventIds) =>
  dbConnection
    .query(
      `SELECT * FROM ${streamParams.storageName} WHERE id IN (:eventIds) ORDER BY seq`,
      { eventIds: eventIds.map(BinaryUuid) },
    )
    .then(dbResponseToStoredEvents);

/* ifAppendOk :: (Array Event -> Promise Array a) -> DbQueryResponse -> Array Event -> Promise Array a */
const ifAppendOk = (cb) => (events) => (response) =>
  (({ affectedRows, insertId }) =>
    insertId && affectedRows === events.length
      ? cb(events)
      : Promise.resolve([]))(response?.[0] || {});

/* selectNamedParams :: Object -> String */
const selectNamedParams = (eventQueryParams) =>
  "SELECT " +
  Object.keys(eventQueryParams)
    .map((name) => `:${name}`)
    .join(" UNION ALL SELECT ");

/* queryParams :: Array Event -> Object */
const queryParams = (events) =>
  events.reduce(
    (all, event, index) => ({
      ...all,
      [`event_${index}`]: eventToDbRecord(event),
    }),
    {},
  );

/* append :: dbConnection -> StreamParams -> Array Event -> Promise Array StoredEvent */
const append = (dbConnection) => (streamParams) => (events) =>
  Array.isArray(events) && events.length
    ? ((eventQueryParams) =>
        dbConnection
          .query(
            `INSERT INTO ${streamParams?.storageName} (id, stream_id, version, type, data) \
             SELECT * FROM (${selectNamedParams(eventQueryParams)}) __tmp_values_table \
             WHERE ( \
               SELECT COALESCE(max(version)+1, 0) FROM ${streamParams?.storageName} \
               WHERE stream_id=:streamId)>=:version`,
            {
              ...eventQueryParams,
              streamId: Binary(streamParams.streamId),
              version: events[0].version,
            },
          )
          .then(
            ifAppendOk(readEventsById(dbConnection)(streamParams))(
              events.map(({ id }) => id),
            ),
          ))(queryParams(events))
    : Promise.resolve([]);

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
const ReadSqlParts = (streamParams) => (readParams) => ({
  storageName: streamParams?.storageName,
  directionSql: DIRECTION_SQL(readParams?.direction),
  andVersionSql: AND_VERSION_SQL(readParams?.direction)(
    readParams?.fromVersion,
  ),
  limitByMaxCountSql: LIMIT_BY_MAX_COUNT_SQL(readParams?.maxCount),
});

/* read :: DbConnection -> StreamParams -> ReadParams -> Promise Array StoredEvent */
const read = (dbConnection) => (streamParams) => (readParams) =>
  (({ storageName, directionSql, andVersionSql, limitByMaxCountSql }) =>
    dbConnection.query(
      `SELECT * FROM ${storageName} \
         WHERE stream_id=:streamId ${andVersionSql} \
         ORDER BY seq ${directionSql} \
         ${limitByMaxCountSql}`,
      {
        streamId: Buffer.from(streamParams?.streamId, "hex"),
        fromVersion: readParams?.fromVersion,
        maxCount: readParams?.maxCount,
      },
    ))(ReadSqlParts(streamParams)(readParams)).then(dbResponseToStoredEvents);

/* MySqlProvider :: DbConnection -> StoreProvider */
module.exports = (dbConnection) =>
  StoreProvider({
    append: append(dbConnection),
    read: read(dbConnection),
  });
