"use strict";

const { ReadDirection } = require("../");
const SqlProvider = require("../lib/SqlProvider");
const { Binary, pipe } = require("../lib/utils");

/* readResponse :: DbQueryResponse -> Array DbRecord */
const readResponse = (response) => response?.rows || [];

const COLUMN_TYPES = ["uuid", "bytea", "int", "text", "jsonb"];

const isOccError = (err) => err.code === "23505";

/* placeholderMapper :: Integer -> (Any, Integer) -> String */
const placeholderMapper = (position) => (value, index) =>
  `$${position + index + 1}::${COLUMN_TYPES[index]}`;

/* prepareAppendQuery :: StreamParams -> Object -> Object */
const prepareAppendQuery =
  (streamParams) =>
  ({ sql, params }) => ({
    sql: `INSERT INTO ${streamParams?.storageName} (id, stream_id, version, type, data) \
              SELECT * FROM (${sql}) __tmp_values_table \
              WHERE ( \
                SELECT COALESCE(max(version)+1, 0) FROM ${streamParams?.storageName} \
                WHERE stream_id=$${params.length + 1})>=$${params.length + 2} RETURNING *`,
    params: [...params, Binary(streamParams.streamId), params[2]],
  });

/* VERSION_SQL :: ReadDirection -> Integer -> String */
const VERSION_SQL = (direction) => (fromVersion) =>
  Number.isInteger(fromVersion) && fromVersion > 0
    ? direction === ReadDirection.FORWARD
      ? "AND version>=$2"
      : "AND version<=$2"
    : "";

/* DIRECTION_SQL :: ReadDirection -> String */
const DIRECTION_SQL = (direction) =>
  direction === ReadDirection.FORWARD ? "ASC" : "DESC";

/* LIMIT_BY_MAXCOUNT_SQL :: Integer -> Integer -> String */
const LIMIT_BY_MAXCOUNT_SQL = (position) => (maxCount) =>
  Number.isInteger(maxCount) && maxCount > 0 ? `LIMIT $${position}` : "";

/* prepareReadQuery :: StreamParams -> ReadParams -> Object */
const prepareReadQuery = (streamParams) => (readParams) =>
  pipe([
    VERSION_SQL(readParams?.direction),
    (versionSql) => ({
      sql: `SELECT * FROM ${streamParams?.storageName} \
         WHERE stream_id=$1 ${versionSql} \
         ORDER BY seq ${DIRECTION_SQL(readParams?.direction)} \
         ${LIMIT_BY_MAXCOUNT_SQL(!!versionSql ? 3 : 2)(readParams?.maxCount)}`,
      params: [
        Binary(streamParams?.streamId),
        ...(readParams?.fromVersion ? [readParams?.fromVersion] : []),
        ...(readParams?.maxCount ? [readParams?.maxCount] : []),
      ],
    }),
  ])(readParams?.fromVersion);

/* PostgresProvider :: DbConnection -> StoreProvider */
module.exports = SqlProvider({
  isOccError,
  placeholderMapper,
  prepareAppendQuery,
  prepareReadQuery,
  readResponse,
});
