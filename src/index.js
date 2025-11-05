"use strict";

const { randomUUID } = require("node:crypto");
const { isString, pipe, set, throwError } = require("./lib/utils");

const ReadDirection = {
  FORWARD: Symbol("FORWARD"),
  BACKWARD: Symbol("BACKWARD"),
};

/* OccError :: Error -> Integer -> OccError */
const OccError = (err) => (streamVersion) =>
  ((occErr) => {
    occErr.name = "OccError";
    occErr.streamVersion = streamVersion;
    return occErr;
  })(new Error("OccError", { cause: err }));

/* StoredEvent :: Object -> StoredEvent */
const StoredEvent = (props) => ({
  seq: Number.parseInt(props?.seq),
  id: props?.id,
  streamId: props?.streamId,
  type: props?.type,
  version: Number.parseInt(props?.version),
  data: props?.data,
});

/* validateEvent :: Event -> Event */
const validateEvent = (event) =>
  !event.id
    ? throwError("Event id is not provided!")
    : !event.type
      ? throwError("Event type is not provided!")
      : !(Number.isInteger(event.version) && event.version >= 0)
        ? throwError("Event version is not provided!")
        : event;

/* Event :: Object -> Event */
const Event = (props) =>
  validateEvent({
    id: props?.id,
    type: props?.type,
    version: Number.parseInt(props?.version),
    data: props?.data,
  });

/* toArray :: a | Array b -> Array a | Array b */
const toArray = (a) => (Array.isArray(a) ? a : a ? [a] : []);

/* prepareEvents :: Event | Array Event -> Array Event */
const prepareEvents = pipe([
  toArray,
  (events) =>
    events.map((event, index) =>
      Event({
        ...event,
        version: (events[0].version || 0) + index,
      }),
    ),
]);

/* append :: Event | Array Event -> EventStream -> Promise Array StoredEvent */
const append = pipe([
  prepareEvents,
  (events) => (eventStream) =>
    events.length
      ? eventStream(
          (streamParams) => (store) =>
            store
              .append(events.map(set("streamId")(streamParams.streamId)))
              .then((results) => (results || []).map(StoredEvent)),
        )
      : Promise.resolve([]),
]);

/* defaultStringParam :: String -> String | Object -> String */
const defaultStringParam = (name) => (params) =>
  params && isString(params)
    ? params
    : params?.[name] || throwError(`${name} is not provided!`);

/* EventParams :: String | Object -> EventParams */
const EventParams = (params) => ({
  idGenerator: params?.idGenerator || (() => randomUUID()),
  type: defaultStringParam("type")(params),
  version: Number.parseInt(params?.version) || 0,
});

/* createEvent :: String | EventParams -> a -> Event */
const createEvent = pipe([
  EventParams,
  ({ idGenerator, type, version }) =>
    (eventData) => ({
      id: idGenerator(eventData),
      type,
      version,
      data: eventData,
    }),
]);

/* isDirection :: a -> Boolean */
const isDirection = (a) => Object.values(ReadDirection).includes(a);

/* ReadParams :: Object -> ReadParams */
const ReadParams = (params) => ({
  direction: isDirection(params?.direction)
    ? params?.direction
    : ReadDirection.FORWARD,
  fromVersion: params?.fromVersion || 0,
  maxCount: params?.maxCount,
});

/* read :: ReadParams -> EventStream -> Promise Array StoredEvent */
const read = (readParams) => (eventStream) =>
  eventStream(
    (streamParams) => (store) =>
      store
        .read(ReadParams(readParams))
        .then((results) => (results || []).map(StoredEvent)),
  );

/* StreamParams :: String | Object -> StreamParams */
const StreamParams = (params) => ({
  storageName: params?.storageName || "events",
  streamId: defaultStringParam("streamId")(params),
});

/* StoreProvider :: Store -> StoreProvider */
const StoreProvider = (store) => ({
  append: store.append,
  read: store.read,
});

const wireStoreProvider = (streamParams) => (storeProvider) => ({
  append: storeProvider.append(streamParams),
  read: storeProvider.read(streamParams),
});

/* stream :: String | StreamParams -> StoreProvider -> EventStream */
const stream = pipe([
  StreamParams,
  (streamParams) =>
    pipe([
      wireStoreProvider(streamParams),
      (store) => (cb) => cb(streamParams)(store),
    ]),
]);

exports.append = append;
exports.createEvent = createEvent;
exports.OccError = OccError;
exports.read = read;
exports.ReadDirection = ReadDirection;
exports.StoredEvent = StoredEvent;
exports.StoreProvider = StoreProvider;
exports.stream = stream;
