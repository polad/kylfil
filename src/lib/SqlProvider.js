"use strict";

const { ReadDirection, StoredEvent, StoreProvider } = require("../");
const { Binary, BinaryUuid, pipe, toUuid } = require("./utils");

/* SqlProvider :: Object -> DbConnection -> StoreProvider */
module.exports = ({
  appendResponse,
  parseStoredEventData,
  placeholderMapper,
  prepareAppendQuery,
  prepareReadQuery,
  readResponse,
}) => {
  /* dbRecordToStoredEvent :: DbRecord -> StoredEvent */
  const dbRecordToStoredEvent = (dbRecord) =>
    StoredEvent({
      seq: dbRecord.seq,
      id: toUuid(Buffer.from(dbRecord.id || "").toString("hex")),
      streamId: Buffer.from(dbRecord.stream_id || "").toString("hex"),
      version: dbRecord.version,
      type: dbRecord.type,
      data: (!!parseStoredEventData ? JSON.parse : (a) => a)(dbRecord.data),
    });

  /* eventToDbRecord :: Event -> Array Any */
  const eventToDbRecord = (event) => [
    BinaryUuid(event.id),
    Binary(event.streamId),
    event.version,
    event.type,
    JSON.stringify(event.data),
  ];

  /* RETURNING :: Boolean -> String */
  const RETURNING = (supportsInsertReturning) =>
    supportsInsertReturning ? "RETURNING *" : "";

  /* defaultPrepareAppendQuery :: StreamParams -> Object -> Object */
  const defaultPrepareAppendQuery =
    (streamParams) =>
    ({ sql, params }) => ({
      sql: `INSERT INTO ${streamParams?.storageName} (id, stream_id, version, type, data) \
              SELECT * FROM (${sql}) __tmp_values_table \
              WHERE ( \
                SELECT COALESCE(max(version)+1, 0) FROM ${streamParams?.storageName} \
                WHERE stream_id=?)>=? ${RETURNING(!appendResponse)}`,
      params: [...params, Binary(streamParams.streamId), params[2]],
    });

  /* VERSION_SQL :: ReadDirection -> Integer -> String */
  const VERSION_SQL = (direction) => (fromVersion) =>
    Number.isInteger(fromVersion) && fromVersion > 0
      ? direction === ReadDirection.FORWARD
        ? "AND version>=?"
        : "AND version<=?"
      : "";

  /* DIRECTION_SQL :: ReadDirection -> String */
  const DIRECTION_SQL = (direction) =>
    direction === ReadDirection.FORWARD ? "ASC" : "DESC";

  /* LIMIT_BY_MAXCOUNT_SQL :: Integer -> String */
  const LIMIT_BY_MAXCOUNT_SQL = (maxCount) =>
    Number.isInteger(maxCount) && maxCount > 0 ? `LIMIT ?` : "";

  /* defaultPrepareReadQuery :: StreamParams -> ReadParams -> Object */
  const defaultPrepareReadQuery = (streamParams) => (readParams) => ({
    sql: `SELECT * FROM ${streamParams?.storageName} \
         WHERE stream_id=? ${VERSION_SQL(readParams?.direction)(readParams?.fromVersion)} \
         ORDER BY seq ${DIRECTION_SQL(readParams?.direction)} \
         ${LIMIT_BY_MAXCOUNT_SQL(readParams?.maxCount)}`,
    params: [
      Binary(streamParams?.streamId),
      ...(readParams?.fromVersion ? [readParams?.fromVersion] : []),
      ...(readParams?.maxCount ? [readParams?.maxCount] : []),
    ],
  });

  /* defaultReadResponse :: DbQueryResponse -> Array DbRecord */
  const defaultReadResponse = (response) => response || [];

  /* dbResponseToStoredEvents :: DbQueryResponse -> Array StoredEvent */
  const dbResponseToStoredEvents = pipe([
    readResponse || defaultReadResponse,
    (dbRecords) => dbRecords.map(dbRecordToStoredEvent),
  ]);

  /* defaultPlaceholderMapper :: Integer -> (Any, Integer) -> String */
  const defaultPlaceholderMapper = (position) => (value, index) => "?";

  /* recordSql :: Integer -> Array Any -> String */
  const recordSql = (position) => (record) =>
    (!position ? "SELECT " : " UNION ALL SELECT ") +
    record
      .map((placeholderMapper || defaultPlaceholderMapper)(position))
      .join(", ");

  /* prepareEvents :: Array Event -> Object */
  const prepareEvents = (events) =>
    events.reduce(
      ({ sql, params }, event, index) =>
        ((record) => ({
          sql: sql + recordSql(params.length)(record),
          params: [...params, ...record],
        }))(eventToDbRecord(event)),
      { sql: "", params: [] },
    );

  /* readEventsById :: DbConnection -> StreamParams -> Array String -> Promise Array StoredEvent */
  const readEventsById = (dbConnection) => (streamParams) => (eventIds) =>
    dbConnection
      .query(
        `SELECT * FROM ${streamParams.storageName} \
         WHERE id IN (:eventIds) ORDER BY seq`,
        { eventIds: eventIds.map(BinaryUuid) },
      )
      .then(dbResponseToStoredEvents);

  /* ifAppendOk :: Integer -> DbQueryResponse -> Boolean */
  const ifAppendOk = (expectedChanges) =>
    pipe([
      appendResponse,
      ({ insertId, affectedRows }) =>
        insertId && affectedRows === expectedChanges,
    ]);

  /* eventIds :: Array Event -> Array String */
  const eventIds = (events) => events.map(({ id }) => id);

  /* append :: dbConnection -> StreamParams -> Array Event -> Promise Array StoredEvent */
  const append = (dbConnection) => (streamParams) => (events) =>
    Array.isArray(events) && events.length
      ? pipe([
          prepareEvents,
          (prepareAppendQuery || defaultPrepareAppendQuery)(streamParams),
          ({ sql, params }) =>
            dbConnection
              .query(sql, params)
              .then((response) =>
                appendResponse
                  ? ifAppendOk(events.length)(response)
                    ? readEventsById(dbConnection)(streamParams)(
                        eventIds(events),
                      )
                    : []
                  : dbResponseToStoredEvents(response),
              ),
        ])(events)
      : Promise.resolve([]);

  /* read :: DbConnection -> StreamParams -> ReadParams -> Promise Array StoredEvent */
  const read = (dbConnection) => (streamParams) => (readParams) =>
    pipe([
      (prepareReadQuery || defaultPrepareReadQuery)(streamParams),
      ({ sql, params }) =>
        dbConnection.query(sql, params).then(dbResponseToStoredEvents),
    ])(readParams);

  return (dbConnection) =>
    StoreProvider({
      append: append(dbConnection),
      read: read(dbConnection),
    });
};
