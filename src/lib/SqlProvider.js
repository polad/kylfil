"use strict";

const { OccError, ReadDirection, StoredEvent, StoreProvider } = require("../");
const { Binary, BinaryUuid, pipe, promised, toUuid } = require("./utils");

/* SqlProvider :: Object -> DbConnection -> StoreProvider */
module.exports = ({
  appendResponse,
  isOccError,
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

  const supportsInsertReturning = !appendResponse;

  const RETURNING_SQL = supportsInsertReturning ? "RETURNING *" : "";

  /* defaultPrepareAppendQuery :: StreamParams -> Object -> Object */
  const defaultPrepareAppendQuery =
    (streamParams) =>
    ({ sql, params }) => ({
      sql: `INSERT INTO ${streamParams?.storageName} (id, stream_id, version, type, data) \
              SELECT * FROM (${sql}) __tmp_values_table \
              WHERE ( \
                SELECT COALESCE(max(version)+1, 0) FROM ${streamParams?.storageName} \
                WHERE stream_id=?)>=? ${RETURNING_SQL}`,
      params: [...params, Binary(streamParams.streamId), params[2]],
    });

  /* VERSION_SQL :: ReadDirection -> Integer -> String */
  const VERSION_SQL = (direction) => (fromVersion) =>
    Number.isInteger(fromVersion) && fromVersion > 0
      ? direction === ReadDirection.BACKWARD
        ? "AND version<=?"
        : "AND version>=?"
      : "";

  /* DIRECTION_SQL :: ReadDirection -> String */
  const DIRECTION_SQL = (direction) =>
    direction === ReadDirection.BACKWARD ? "DESC" : "ASC";

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

  const toPlaceholders = placeholderMapper || defaultPlaceholderMapper;

  /* recordSql :: Integer -> Array Any -> String */
  const recordSql = (position) => (record) =>
    (!position ? "SELECT " : " UNION ALL SELECT ") +
    record.map(toPlaceholders(position)).join(", ");

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

  /* isAppendOk :: Integer -> DbQueryResponse -> Boolean */
  const isAppendOk = (expectedChanges) =>
    pipe([
      appendResponse,
      ({ insertId, affectedRows }) =>
        insertId && affectedRows === expectedChanges,
    ]);

  /* eventIds :: Array Event -> Array String */
  const eventIds = (events) => events.map(({ id }) => id);

  /* readStreamVersion :: DbConnection -> StreamParams -> Promise Integer */
  const readStreamVersion = (dbConnection) => (streamParams) =>
    ((streamIdPlaceholder) =>
      dbConnection
        .query(
          `SELECT MAX(version) AS version \
           FROM ${streamParams.storageName} \
           WHERE stream_id=${streamIdPlaceholder}`,
          [Binary(streamParams?.streamId)],
        )
        .then(
          pipe([
            readResponse || defaultReadResponse,
            (res) => res?.[0]?.version,
          ]),
        ))(toPlaceholders(-1)("", 1));

  /* hasItems :: a -> Boolean */
  const hasItems = (a) => Array.isArray(a) && a.length;

  /* append :: DbConnection -> StreamParams -> Array Event -> Promise Array StoredEvent */
  const append = (dbConnection) => (streamParams) => (events) =>
    !hasItems(events)
      ? Promise.resolve([])
      : pipe([
          prepareEvents,
          (prepareAppendQuery || defaultPrepareAppendQuery)(streamParams),
          ({ sql, params }) =>
            dbConnection
              .query(sql, params)
              .then((response) =>
                supportsInsertReturning
                  ? dbResponseToStoredEvents(response)
                  : isAppendOk(events.length)(response)
                    ? readEventsById(dbConnection)(streamParams)(
                        eventIds(events),
                      )
                    : [],
              )
              .catch(async (err) => {
                throw isOccError && isOccError(err)
                  ? await pipe([
                      readStreamVersion(dbConnection),
                      promised(OccError(err)),
                    ])(streamParams)
                  : err;
              }),
        ])(events);

  /* read :: DbConnection -> StreamParams -> ReadParams -> Promise Array StoredEvent */
  const read = (dbConnection) => (streamParams) => (readParams) =>
    pipe([
      (prepareReadQuery || defaultPrepareReadQuery)(streamParams),
      ({ sql, params }) => dbConnection.query(sql, params),
      promised(dbResponseToStoredEvents),
    ])(readParams);

  return (dbConnection) =>
    StoreProvider({
      append: append(dbConnection),
      read: read(dbConnection),
    });
};
