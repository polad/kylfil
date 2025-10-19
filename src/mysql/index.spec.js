"use strict";

const events = require("../../data/test_events.json");
const { Binary, BinaryUuid } = require("../lib/utils");
const MySqlProvider = require("./");

describe("kylfil/mysql", () => {
  const dbConnection = {
    query: jest.fn(),
  };
  const streamId = "be2ed21cad4b412f69c558510112262f";
  const streamParams = { streamId, storageName: "events" };
  const { append, read } = MySqlProvider(dbConnection);

  beforeEach(() => {
    dbConnection.query.mockReset();
  });

  describe("append()", () => {
    it("should execute DB query to store events in the table", async () => {
      // Given
      const eventsToAppend = [
        { ...events[0], streamId },
        { ...events[1], streamId },
      ];

      const insertId = 15;
      queryResponse = [{ insertId, affectedRows: eventsToAppend.length }];
      dbConnection.query.mockResolvedValueOnce(queryResponse);

      const readEventsByIdResponse = eventsToAppend.map(
        ({ streamId, id, ...event }, index) => ({
          ...event,
          seq: insertId + index,
          id: BinaryUuid(id),
          stream_id: Binary(streamId),
        }),
      );
      dbConnection.query.mockResolvedValueOnce([readEventsByIdResponse]);

      // When
      const storedEvents = await append(streamParams)(eventsToAppend);

      // Then
      expect(storedEvents).toEqual([
        { ...eventsToAppend[0], seq: 15, streamId },
        { ...eventsToAppend[1], seq: 16, streamId },
      ]);
    });

    it("should not execute DB query if no events provided", async () => {
      // When
      const storedEvents = await append(streamParams)([]);

      // Then
      expect(storedEvents).toEqual([]);
      expect(dbConnection.query).not.toHaveBeenCalled();
    });
  });

  describe("read()", () => {
    it("should execute DB query to read events for a stream", async () => {
      // Given
      const readParams = {};

      const seq = 15;
      const dbResponse = events.slice(0, 2).map((event, index) => ({
        ...event,
        seq: seq + index,
        id: BinaryUuid(event.id),
        stream_id: Binary(streamId),
      }));
      dbConnection.query.mockResolvedValue([dbResponse]);

      // When
      const storedEvents = await read(streamParams)(readParams);

      // Then
      expect(storedEvents).toEqual([
        { ...events[0], seq: 15, streamId },
        { ...events[1], seq: 16, streamId },
      ]);
    });
  });
});
