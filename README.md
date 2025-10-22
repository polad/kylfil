# KylFil

All killer. No filler.\
A tiny database-agnostic Event Store&mdash;clever by design, minimal by choice.

- Optimistic Concurrency Control (OCC): no resource locks required.
- Simple Functional API: for great composition and expressive code.
- Atomic Guarantees: append multiple events in a single-transaction.
- Storage Agnostic: supports virtually any Database or KV Store via a simple `StoreProvider` interface requiring only two functions: `append()` and `read()`.
- Reference Implementations for SQLite & MySQL: provides out-of-the-box support for some popular databases also serves as example for integrating with other storage engines.
- Lazy DB Connection & Deferred Query Execution: improves performance by avoiding premature resource allocation.
- Flexible Querying: read events in any direction or from a specific version.
- Immutable Operations: all functions return new objects without modifying original objects.
- Flexible Event Payload: it's your event, put anything you want inside.

### Contents
- [How to use](#how-to-use)
- [Simple API](#simple-api)
  - [stream ( )](#stream--streamparams---storeprovider-)
  - [createEvent ( )](#createevent--eventparams---eventdata-)
  - [append ( )](#append--events---stream-)
  - [read ( )](#read--readparams---stream-)
- [Concurrency with append() and read()](#concurrency-with-append-and-read)
- [StoreProvider Interface](#storeprovider-interface)
  - [append ( )](#append-streamparams-events)
  - [read ( )](#read-streamparams-readparams)

## How to use:

```js
const { append, createEvent, read, stream } = require("kylfil");
const sqlite = require("kylfil/sqlite")(dbConnection);

const myStream = stream ("be2ed21cad4b412f69c558510112262f") (sqlite);

const sale = {
  airline: "Air Canada",
  tkt: "7712935657218",
  pax: "MRS HAZEL NUTT",
  saleDate: "2025-08-17",
};

const newEvent = createEvent ("AirTicketSold") (sale);
  
(async () => {
  const storedEvents = await append (newEvent) (myStream);

  const events = await read ({ maxCount: 5 }) (myStream);
})()
```
The `append()` function above will return an array with the newly appended event that now has a `streamId`, `version` at `0`, since it's the 1st event in the stream and a sequence number `seq` indicating _(Nth)_ position in the global event log:
```js
[{
  seq: 15,
  id: "e2befa9a-141d-46fa-8f70-8fc48a7a7bbc",
  type: "AirTicketSold",
  streamId: "be2ed21cad4b412f69c558510112262f",
  version: 0,
  data: {
    airline: "AC",
    tkt: "7712935657218",
    pax: "MRS HAZEL NUTT",
    saleDate: "2025-08-17"
  }
}]
```

## Simple API:

### stream ( streamParams ) ( storeProvider )
`stream :: String | StreamParams -> StoreProvider -> EventStream`

Use this function to get a hold of a specific `EventStream` which can be supplied to other functions like `append()` or `read()` to work with events in a given stream.

#### Arguments:

- **streamParams** argument can be either a `String` indicating a `streamId` or a `StreamParams` object with the following properties:

  | Name | Type | Default | Description |
  | ---- |:----:|:-------:| ----------- |
  | `storageName` | String | "events" | Indicates where events are stored. For RDBMS can be used as a table name. For Key-Value stores can be used as a key prefix. |
  | `streamId` | String | N/A | Unique stream ID |

- **storeProvider** is an implementation of the `StoreProvider` interface for working with the underlying persistence storage engine.

#### Returns:
An instance of the `EventStream` function which accepts a single callback and invokes it with the following arguments:
```js
(cb) => cb (StreamParams) (StoreProvider)
```

### Examples:
1\. Return a stream by a given ID:
```js
stream("be2ed21cad4b412f69c558510112262f")
```
2\. For streams that are stored in dedicated DB tables for example `order_events` and `sales_events` you can do the following:
```js
const orderStream = stream({ 
  storageName: "order_events",
  streamId: "766b8aa93d71e3f460b0f2524e1d271c"
}) 

const saleStream = stream({ 
  storageName: "sale_events",
  streamId: "d1c61832169d7e053a96969e90f6b54b"
})
```

### createEvent ( eventParams ) ( eventData )
`createEvent :: String | EventParams -> a -> Event`

This function creates events with a proper structure, suitable for appending to any stream in the event store.

#### Arguments:

- **eventParams** can be a `String` indicating the `eventType` or an `EventParams` object with the following properties:
  
  | Name | Type | Default | Description |
  | ---- |:----:|:-------:| ----------- |
  | `idGenerator` | eventData -> String | randomUUID() | Function to generate event ID that receives `eventData` is an argument |
  | `type` | String | N/A | Event type |
  | `version` | Integer | `0` | Stream version |

- **eventData** payload for the event data can be of any type.

#### Returns:
An `Event` object.

#### Examples:
1\. Create an event representing airline ticket sale:
```js
const event = createEvent ("AirTicketSold")({
  airline: "AC",
  tkt: "7712935657218",
  pax: "MRS HAZEL NUTT",
  saleDate: "2025-08-17"
})

// event will be:
{
  id: "6675e754-6dd9-4ac8-bfef-56532bfc9505",
  type: "AirTicketSold",
  version: 0,
  data: {
    airline: "AC",
    tkt: "7712935657218",
    pax: "MRS HAZEL NUTT",
    saleDate: "2025-08-17"
  }
}
```
2\. Create an event at version 3 using a custom ID generator:
```js
const event = createEvent ({
  idGenerator: ({ airline, tkt }) => `${airline}-${tkt}`,
  type: "AirTicketSold",
  version: 3
})({
  airline: "AC",
  tkt: "7712935657218",
  pax: "MRS HAZEL NUTT",
  saleDate: "2025-08-17"
})

// event will be:
{
  id: "AC-7712935657218",
  type: "AirTicketSold",
  version: 3,
  data: {
    airline: "AC",
    tkt: "7712935657218",
    pax: "MRS HAZEL NUTT",
    saleDate: "2025-08-17"
  }
}
```
3\. Generate sequence of events for one sale:
```js
[
  { type: "ProductSold", version: 0 },
  { type: "ReceiptPrinted", version: 1 },
  { type: "ProductShipped", version: 2 }
].map(params => createEvent(params)(sale))

```
4\. Generate a list of a certain event type for a list of entities:
```js
sales.map(createEvent("ProductSold"))
```

### append ( events ) ( stream )
`append :: Event | Array Event -> EventStream -> Promise Array StoredEvent`

Use this function to append events to a given stream.

#### Arguments:

- **events** can be either a single `Event` object or an `Array` of `Event` objects to append to a stream.
- **stream** is an `EventStream` to append events to.

> **&#128712; NOTE:** This function will store the events using the ID of the **stream** regardless of the `streamId` of the events. The original event objects won't be changed because the library performs all operations immutably.

Optimistic Concurrency Control will not allow the same event to be appended to a stream more than once. If two events have the same event `id` or the same compound key of `(streamId + version)` it should return an `Error("Duplicate entry")`. Because SQLite & MySQL reference implementations provided with this library use "multi-value" inserts, they act as a single transaction commit. If one of the events fails for any reason none of the events will be stored. Following example shows the difference:
```js
// no events will be stored due to Duplicate Entry error
await append ([ sameEvent, sameEvent ]) (myStream)

// here the first append will succeed 
await append (sameEvent) (myStream)
// the second will fail due to Duplicate Entry error
await append (sameEvent) (myStream)
```

#### Returns:
A `Promise` containing an array of `StoredEvent` objects with the following properties.
  
  | Name | Type | Description |
  | ---- |:----:| ----------- |
  | `seq` | Integer | Event's position in the global event log |
  | `id` | String | Event ID |
  | `type` | String  | Event type |
  | `streamId` | String | Stream ID |
  | `version` | Integer | Stream version |
  | `data` | Any | Event payload |

#### Examples:
1\. Append two events to the stream:
```js
const [storedEvent1, storedEvent2] = await append ([ event1, event2 ]) (myStream)
```
2\. Append same events to multiple streams concurrently:
```js
const [eventsInMyStream, eventsInYourStream] = await Promise.all(
  [myStream, andYourStream].map( append ([ event1, event2 ]) )
)
```

### read ( readParams ) ( stream )
`read :: ReadParams -> EventStream -> Promise Array StoredEvent`

Use this function to read events from a stream in any direction and/or from a specific version. You can also set the max number of events to return.

#### Arguments

- **readParams** is of type `ReadParams` with the following properties:

  | Name | Type | Default | Description |
  | ---- |:----:|:-------:| ----------- |
  | `direction` | ReadDirection | FORWARD | Indicates the direction of the read operation. Can be `FORWARD` or `BACKWARD` |
  | `fromVersion` | Integer >= `0` | `0` | Indicates an inclusive version number of the events to read from. |
  | `maxCount` | Integer > `0` | N/A | Indicates the max number of events to return from stream |

- **stream** is an `EventStream` to read events from.

#### Returns:
A `Promise` containing an array of `StoredEvent` objects with the following properties.
  
  | Name | Type | Description |
  | ---- |:----:| ----------- |
  | `seq` | Integer | Event's position in the global event log |
  | `id` | String | Event ID |
  | `type` | String  | Event type |
  | `streamId` | String | Stream ID |
  | `version` | Integer | Stream version |
  | `data` | Any | Event payload |

> **&#x26A1; TIP:** Partial application of `read()` function creates reusable readers that can be applied to many streams

#### Examples:
1\. Read all events from a stream:
```js
const results = await read () (myStream)
// results will be:
[
  {
    seq: 15,
    id: "e2befa9a-141d-46fa-8f70-8fc48a7a7bbc",
    type: "AirTicketSold",
    streamId: "be2ed21cad4b412f69c558510112262f",
    version: 0,
    data: {
      airline: "AC",
      tkt: "7712935657218",
      pax: "MRS HAZEL NUTT",
      saleDate: "2025-08-17"
    }
  }
  ... // other events in this stream
]
```
2\. Read events after version 12 _(inclusive)_:
```js
await read ({ fromVersion: 12 }) (myStream)
```
3\. Read latest 5 events from the stream:
```js
await read ({ direction: ReadDirection.BACKWARD, maxCount: 5 }) (myStream)
```
4\. Create reusable readers via partial application to read events from different streams concurrently:
```js
const readLast5 = read ({
  direction: ReadDirection.BACKWARD,
  maxCount: 5
})

const [ myEvents, andYourEvents ] = await Promise.all(
  [myStream, andYourStream].map(readLast5)
)
```

## Concurrency with append() and read()

- Calling `append()` or `read()` concurrently can consume multiple DB connections, depending on how you provide these connections to the `StoreProvider`.
- If you're using a `StoreProvider` implementation that supports a connection `Pool` make sure you have set a conection limit.
- When the connection pool limit is reached, concurrent calls to `append()` or `read()` are processed sequentially.

## StoreProvider Interface

### append (streamParams) (events)
`append :: StreamParams -> Array Event -> Promise Array StoredEvent`

This function stores events in the underlying storage engine. It's partially applied by the library, deferring the database connection and query execution until the main `append()` function of the library is invoked. This helps to avoid premature resource allocation.

#### Arguments:
- **streamParams** is of type `StreamParams` and supplied by the `stream()` function of the library.
- **events** is an `Array` of events and provided by the `append()` function of the library.

#### Returns:
A `Promise` containing an array of `StoredEvent` objects.

### read (streamParams) (readParams)
`read :: StreamParams -> ReadParams -> Promise Array StoredEvent`

This function retrieves events from the underlying storage engine. It's partially applied by the library deferring the database connection and query execution until the main `read()` function of the library is called. This helps to avoid premature resource allocation.

#### Arguments:
- **streamParams** is of type `StreamParams` and supplied by the `stream()` function of the library.
- **readParams** is of type `ReadParams` and provided by the `read()` function of the library.

#### Returns
A `Promise` containing an array of `StoredEvent` objects.