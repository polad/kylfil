"use strict";

const SqlProvider = require("../lib/SqlProvider");

/* appendResponse :: DbQueryResponse -> Object */
const appendResponse = (response) => ({
  insertId: response?.[0]?.insertId,
  affectedRows: response?.[0]?.affectedRows,
});

const isOccError = (err) => err.errno === 1062;

/* readResponse :: DbQueryResponse -> Array DbRecord */
const readResponse = (response) => response?.[0] || [];

/* MySqlProvider :: DbConnection -> StoreProvider */
module.exports = SqlProvider({
  appendResponse,
  isOccError,
  readResponse,
});
