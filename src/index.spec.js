"use strict";

const { append, createEvent, ReadDirection, read, stream } = require("./");
const events = require("../data/test_events.json");

describe("kylfil", () => {
  const streamId = "my-stream";

  const storeProvider = {
    append: jest.fn(),
    read: jest.fn(),
  };
  const eventStream = (cb) => cb({ streamId })(storeProvider);

  beforeEach(() => {
    storeProvider.append.mockReset();
    storeProvider.read.mockReset();
  });

  describe("append()", () => {
    it("should set streamId in event prior to calling StoreProvider", async () => {
      // Given
      const newEvent = events[0];
      const storedEvent = { ...events[0], seq: 57, streamId };
      const response = [storedEvent];
      storeProvider.append.mockReturnValue(Promise.resolve(response));

      // When
      const result = await append(newEvent)(eventStream);

      // Then
      expect(storeProvider.append).toHaveBeenCalledWith([
        { ...newEvent, streamId },
      ]);
      expect(result).toEqual(response);
    });

    it("should not call StoreProvider if no events passed", async () => {
      // When
      await append([])(eventStream);

      // Then
      expect(storeProvider.append).not.toHaveBeenCalled();
    });

    it("should throw if invalid event is passed", () => {
      // Given
      const eventWithNoId = { type: "SomethingHappened", version: 0 };
      const eventWithNoType = { id: "some-id", version: 0 };

      // Then
      expect(() => append(eventWithNoId)).toThrow(/id is not provided/g);
      expect(() => append(eventWithNoType)).toThrow(/type is not provided/g);
      expect(storeProvider.append).not.toHaveBeenCalled();
    });
  });

  describe("createEvent()", () => {
    it("should create event of a specified type", () => {
      // Given
      const eventType = "SomethingHappened";

      // When
      const event = createEvent(eventType)();

      // Then
      expect(event).toMatchObject({
        type: eventType,
        version: 0,
        data: undefined,
      });
    });

    it("should create event with given params", () => {
      // Given
      const eventParams = {
        idGenerator: ({ code, name }) => `${code}::${name}`,
        type: "SomethingHappened",
        version: 777,
      };
      const eventData = {
        code: "4D1BF",
        name: "VERY-IMPORTANT-STUFF",
      };

      // When
      const event = createEvent(eventParams)(eventData);

      // Then
      expect(event).toEqual({
        id: "4D1BF::VERY-IMPORTANT-STUFF",
        type: "SomethingHappened",
        version: 777,
        data: eventData,
      });
    });

    it("should throw if event type is not provided", () => {
      expect(() => createEvent()("event data")).toThrow(/type is not provided/);

      expect(() => createEvent({ version: 777 })("event data")).toThrow(
        /type is not provided/,
      );
    });
  });

  describe("read()", () => {
    it("should pass the read params to StoreProvider and return streamed events", async () => {
      // Given
      const params = {
        direction: ReadDirection.BACKWARD,
        fromVersion: 3,
        maxCount: 10,
        redundantProp: "not-passed",
      };

      const storedEvent = { ...events[0], seq: 57, streamId };
      const response = [storedEvent];
      storeProvider.read.mockReturnValue(Promise.resolve(response));

      // When
      const result = await read(params)(eventStream);

      // Then
      expect(result).toEqual(response);
      expect(storeProvider.read).toHaveBeenCalledWith({
        direction: ReadDirection.BACKWARD,
        fromVersion: 3,
        maxCount: 10,
      });
    });
  });

  describe("stream()", () => {
    it("should return EventStream for a streamId", () => {
      // Given
      const someStuff = "some-stuff";

      // When
      stream(someStuff)(storeProvider)(({ streamId }) => () => {
        // Then
        expect(streamId).toBe("some-stuff");
      });
    });

    it("should return EventStream for given params", () => {
      // Given
      const streamParams = {
        storageName: "some_table",
        streamId: "some-stuff",
      };

      // When
      stream(streamParams)(storeProvider)(({ storageName, streamId }) => () => {
        // Then
        expect(storageName).toBe("some_table");
        expect(streamId).toBe("some-stuff");
      });
    });

    it("should throw if streamId is not provided", () => {
      expect(() => stream()(storeProvider)).toThrow(/streamId is not provided/);

      expect(() =>
        stream({ storageName: "some_table" })(storeProvider),
      ).toThrow(/streamId is not provided/);
    });
  });
});
