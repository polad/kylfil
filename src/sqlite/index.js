"use string";

const { StoredEvent, StoreProvider } = require("../");
const { eventsNamedParams, ReadSqlParts } = require("../lib/sql");
const { Binary, toUuid } = require("../lib/utils");

/* dbRecordToStoredEvent :: DbRecord -> StoredEvent */
const dbRecordToStoredEvent = (dbRecord) =>
  StoredEvent({
    seq: dbRecord.seq,
    id: toUuid(Buffer.from(dbRecord.id || "").toString("hex")),
    streamId: Buffer.from(dbRecord.stream_id || "").toString("hex"),
    version: dbRecord.version,
    type: dbRecord.type,
    data: JSON.parse(dbRecord.data),
  });

/* dbResponseToStoredEvents :: DbQueryResponse -> Array StoredEvent */
const dbResponseToStoredEvents = (response) =>
  (response || []).map(dbRecordToStoredEvent);

/* append :: dbConnection -> StreamParams -> Array Event -> Promise Array StoredEvent */
const append = (dbConnection) => (streamParams) => (events) =>
  Array.isArray(events) && events.length
    ? ((eventsParams) =>
        dbConnection
          .query(
            `INSERT INTO ${streamParams?.storageName} (id, stream_id, version, type, data) \
             SELECT * FROM (${eventsParams.sql}) __tmp_values_table \
             WHERE ( \
               SELECT COALESCE(max(version)+1, 0) FROM ${streamParams?.storageName} \
               WHERE stream_id=:streamId)>=:version RETURNING *`,
            {
              ...Object.assign(...eventsParams.values),
              streamId: Binary(streamParams.streamId),
              version: events[0].version,
            },
          )
          .then(dbResponseToStoredEvents))(eventsNamedParams(events))
    : Promise.resolve([]);

/* read :: DbConnection -> StreamParams -> ReadParams -> Promise Array StoredEvent */
const read = (dbConnection) => (streamParams) => (readParams) =>
  (({ storageName, directionSql, andVersionSql, limitByMaxCountSql }) =>
    dbConnection.query(
      `SELECT * FROM ${storageName} \
         WHERE stream_id=:streamId ${andVersionSql} \
         ORDER BY seq ${directionSql} \
         ${limitByMaxCountSql}`,
      {
        streamId: Binary(streamParams?.streamId),
        ...(readParams?.fromVersion
          ? { fromVersion: readParams.fromVersion }
          : {}),
        ...(readParams?.maxCount ? { maxCount: readParams.maxCount } : {}),
      },
    ))(ReadSqlParts(streamParams)(readParams)).then(dbResponseToStoredEvents);

/* asyncSqlite :: DbConnection -> AsyncDbConnection */
const asyncSqlite = (dbConnection) => ({
  query: async (sql, params) => dbConnection.prepare(sql).all(params),
});

/* SqliteProvider :: DbConnection -> StoreProvider */
module.exports = (dbConnection) =>
  ((asyncDbConnection) =>
    StoreProvider({
      append: append(asyncDbConnection),
      read: read(asyncDbConnection),
    }))(asyncSqlite(dbConnection));
