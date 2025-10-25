"use strict";

const SqlProvider = require("../lib/SqlProvider");

/* appendResponse :: DbQueryResponse -> Object */
const appendResponse = (response) => ({
  insertId: response?.[0]?.insertId,
  affectedRows: response?.[0]?.affectedRows,
});

/* readResponse :: DbQueryResponse -> Array DbRecord */
const readResponse = (response) => response?.[0] || [];

/* MySqlProvider :: DbConnection -> StoreProvider */
module.exports = SqlProvider({
  appendResponse,
  readResponse,
});
