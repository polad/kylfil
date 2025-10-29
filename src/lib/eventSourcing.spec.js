"use strict";

const { read } = require("../");
const { aggregate, evolveWith } = require("./eventSourcing");
const { uncurry2 } = require("./utils");

jest.mock("../");

const events = [
  {
    type: "OrderCreated",
    version: 0,
    streamId: "my-order",
    id: "my-order-created-id",
    seq: 120,
    data: { id: "my-order", createdDate: "2025-04-01" },
  },
  {
    type: "OrderItemAdded",
    version: 1,
    streamId: "my-order",
    id: "my-order-item-1-added",
    seq: 121,
    data: { id: "some-item-id", name: "some item" },
  },
  {
    type: "OrderItemAdded",
    version: 2,
    streamId: "my-order",
    id: "my-order-item-2-added",
    seq: 122,
    data: { id: "another-item-id", name: "another item" },
  },
  {
    type: "OrderItemRemoved",
    version: 3,
    streamId: "my-order",
    id: "my-order-item-1-removed",
    seq: 123,
    data: { id: "some-item-id", name: "some item" },
  },
];

describe("lib/eventSourcing", () => {
  describe("aggregate()", () => {
    beforeEach(() => {
      read.mockReset();
    });

    const evolve = (order) => (event) =>
      event?.type === "OrderCreated"
        ? { ...event?.data }
        : event?.type === "OrderItemAdded"
          ? { ...order, items: [...(order?.items || []), event?.data] }
          : order;

    it("should apply all events from version 0", async () => {
      // Given
      read.mockReturnValue(() => Promise.resolve(events.slice(0, 2)));

      const initialState = { items: [] };

      // When
      const [version, order] = await aggregate({ evolve, initialState })(
        "some stream",
      );

      // Then
      expect(order).toEqual({
        id: "my-order",
        createdDate: "2025-04-01",
        items: [{ id: "some-item-id", name: "some item" }],
      });
    });

    it("should apply events from version 1", async () => {
      // Given
      read.mockReturnValue(() => Promise.resolve(events.slice(1, 3)));

      const initialState = { id: "my-order", createdDate: "2025-04-01" };

      // When
      const [version, order] = await aggregate({
        evolve,
        initialState,
        version: 1,
      })("some stream");

      // Then
      expect(order).toEqual({
        id: "my-order",
        createdDate: "2025-04-01",
        items: [
          { id: "some-item-id", name: "some item" },
          { id: "another-item-id", name: "another item" },
        ],
      });
    });

    it("should return initial state as is if there are no events", async () => {
      // Given
      const initialState = {
        id: "my-order",
        createdDate: "2025-04-01",
      };

      read.mockReturnValue(() => Promise.resolve([]));

      // When
      const [version, order] = await aggregate({
        initialState,
        version: 0,
      })("some stream");

      // Then
      expect(version).toBe(0);
      expect(order).toBe(initialState);
    });
  });

  describe("evolveWith()", () => {
    it("should create evolve given the evolvers StrMap by event type", () => {
      // Given
      const evolveMap = {
        OrderCreated: (order) => (event) => ({
          ...event?.data,
        }),
        OrderItemAdded: (order) => (event) => ({
          ...order,
          items: [...(order?.items || []), event?.data],
        }),
        OrderItemRemoved: (order) => (event) => ({
          ...order,
          items: (order?.items || []).filter(
            ({ id }) => id !== event?.data?.id,
          ),
        }),
      };

      // When
      const evolve = evolveWith(evolveMap);

      // Then
      const order = events.reduce((state, event) => evolve(state)(event), {});
      expect(order).toEqual({
        id: "my-order",
        createdDate: "2025-04-01",
        items: [{ id: "another-item-id", name: "another item" }],
      });
    });

    it("should be able to use an evolve function to handle various event types", () => {
      // Given
      const reusableAdd = (order) => (event) => ({
        ...order,
        items: [...(order?.items || []), event?.data],
      });

      const reusableRemove = (order) => (event) => ({
        ...order,
        items: (order?.items || []).filter(({ id }) => id !== event?.data?.id),
      });

      const evolveMap = {
        // other evolve function here
        OrderItemAdded: reusableAdd,
        AddedToBasket: (order) => (event) => ({
          ...reusableAdd({
            ...order,
            basketId: event?.data?.basketId,
          })(event),
        }),
        OrderItemRemoved: reusableRemove,
        OrderItemDeleted: reusableRemove,
      };

      const someEvents = events.slice(3);

      const state = {
        id: "my-order",
        createdDate: "2025-04-01",
        items: [
          { id: "some-item-id", name: "some item" },
          { id: "another-item-id", name: "another item" },
        ],
      };

      // When
      const evolve = evolveWith(evolveMap);

      // Then
      const order = someEvents.reduce(uncurry2(evolve), state);
      expect(order).toEqual({
        id: "my-order",
        createdDate: "2025-04-01",
        items: [{ id: "another-item-id", name: "another item" }],
      });
    });

    it("should return state as is if unknown event type", () => {
      // Given
      const unknownEvent = { type: "SomethingHappened" };

      const evolveMap = {};

      const state = { id: "my-order", createdDate: "2025-04-01" };

      // When
      const newState = evolveWith(evolveMap)(state)(unknownEvent);

      // Then
      expect(newState).toEqual(state);
    });
  });
});
