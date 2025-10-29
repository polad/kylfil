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
const pipe = (functions) => (value) =>
  functions.reduce((result, fn) => fn(result), value);
exports.pipe = pipe;

/* promised :: (a -> b) -> Promise a -> Promise b */
const promised = (fn) => (p) => p.then(fn);
exports.promised = promised;

/* promisedPipe :: Array (Any -> Promise Any) -> Promise a -> Promise b */
exports.promisedPipe = (functions) => pipe(functions.map(promised));

/* set :: String -> a -> Object -> Object */
exports.set = (prop) => (value) => (obj) => ({ ...obj, [prop]: value });

/* throwError :: Throwing Error (String -> ()) */
exports.throwError = (message) => {
  throw new Error(message);
};

/* toUuid :: String -> String */
exports.toUuid = (str) =>
  `${str.substring(0, 8)}-${str.substring(8, 12)}-${str.substring(12, 16)}-${str.substring(16, 20)}-${str.substring(20, 32)}`;

/* uncurry2 :: (a -> b -> c) -> (a, b) -> c */
exports.uncurry2 = (fn) => (a, b) => fn(a)(b);
