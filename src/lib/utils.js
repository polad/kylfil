"use strict";

/* Binary :: String -> Buffer */
const Binary = (str) => Buffer.from(str, "hex");
exports.Binary = Binary;

/* BinaryUuid :: String -> Buffer */
exports.BinaryUuid = (uuid) => Binary(uuid.replace(/-/g, ""));

/* isString :: a -> Boolean */
exports.isString = (a) => typeof a === "string" || a instanceof String;

/* log :: String -> a -> a */
exports.log = (message) => (value) => {
  console.log(message, value);
  return value;
};

/* pipe :: Array (Any -> Any) -> a -> b */
exports.pipe = (functions) => (value) =>
  functions.reduce((result, fn) => fn(result), value);

/* set :: String -> a -> Object -> Object */
exports.set = (prop) => (value) => (obj) => ({ ...obj, [prop]: value });

/* throwError :: Throwing Error (String -> ()) */
exports.throwError = (message) => {
  throw new Error(message);
};

/* toUuid :: String -> String */
exports.toUuid = (str) =>
  `${str.substring(0, 8)}-${str.substring(8, 12)}-${str.substring(12, 16)}-${str.substring(16, 20)}-${str.substring(20, 32)}`;
