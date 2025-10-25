"use strict";

const assert = require("node:assert");
const mysql = require("mysql2/promise");
const { append, createEvent, ReadDirection, read, stream } = require("../");
const { log } = require("../lib/utils");

const pool = mysql.createPool({
  connectionLimit: 10,
  user: "accuser",
  password: "accpass",
  database: "acc_sales",
  namedPlaceholders: true,
});

const DBConnection = (dbConnection) => ({
  query: (sql, params) =>
    dbConnection.query(
      log(">> QUERY SQL")(sql),
      log(">> QUERY PARAMS")(params),
    ),
});

const db = require("./")(DBConnection(pool));

console.log(">> DB", db);

const myStream = stream("be2ed21cad4b412f69c558510112262f")(db);

const sale = {
  airline: "Air Canada",
  tkt: "7712935657218",
  pax: "MRS HAZEL NUTT",
  saleDate: "2025-08-17",
};

const main = async (dbConnection) => {
  const event1 = createEvent("AirTicketSold")(sale);
  console.log(">> EVENT 1", event1);
  assert.deepEqual(
    event1,
    {
      id: event1.id,
      type: "AirTicketSold",
      version: 0,
      data: sale,
    },
    "Event 1 not created properly",
  );

  const [storedEvent1] = await append(event1)(myStream);

  const readLast5 = read({ direction: ReadDirection.BACKWARD, maxCount: 5 });

  assert.deepEqual(
    await readLast5(myStream),
    [storedEvent1],
    "Event1 not stored",
  );

  const event2 = createEvent({ type: "AirTicketSold", version: 1 })({
    ...event1.data,
    price: "500.00",
  });
  const event3 = createEvent({ type: "AirTicketSold", version: 2 })({
    ...event2.data,
    tax: "90.00",
  });

  const [storedEvent2, storedEvent3] = await append([event2, event3])(myStream);
  const latestEvents = await readLast5(myStream);
  console.log(">> LATEST EVENTS", latestEvents);
  assert.deepEqual(
    latestEvents,
    [storedEvent3, storedEvent2, storedEvent1],
    "Not all events stored",
  );

  await dbConnection.end();
};

main(pool);
