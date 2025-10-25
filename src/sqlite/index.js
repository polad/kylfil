"use strict";

const SqlProvider = require("../lib/SqlProvider");
const { pipe } = require("../lib/utils");

/* asyncSqlite :: DbConnection -> AsyncDbConnection */
const asyncSqlite = (dbConnection) => ({
  query: async (sql, params) => dbConnection.prepare(sql).all(...params),
});

/* SqliteProvider :: DbConnection -> StoreProvider */
module.exports = pipe([
  asyncSqlite,
  SqlProvider({ parseStoredEventData: true }),
]);
