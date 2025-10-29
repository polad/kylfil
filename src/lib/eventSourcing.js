"use strict";

const { read } = require("../");
const { pipe, promised } = require("./utils");

/* noFold :: Array Event -> Event -> Array Event */
const noFold = (state) => (event) => [...(state || []), event];

/* AggregateParams :: Object -> AggregateParams */
const AggregateParams = (params) => ({
  evolve: params?.evolve || noFold,
  initialState: params?.initialState || [],
  version: params?.version,
});

/* aggregate :: AggregateParams -> EventStream -> Promise (Integer, State) */
const aggregate = pipe([
  AggregateParams,
  ({ evolve, initialState, version }) =>
    pipe([
      read({ fromVersion: version + 1 || 0 }),
      promised((events) =>
        (events || []).reduce(
          ([_, state], event) => [event.version, evolve(state)(event)],
          [version, initialState],
        ),
      ),
    ]),
]);

/* noopEvolve :: State -> Event -> State */
const noopEvolve = (state) => () => state;

/* evolveWith :: StrMap (State -> Event -> State) -> State -> Event -> State */
const evolveWith = (evolvers) => (state) => (event) =>
  (evolvers?.[event?.type] || noopEvolve)(state)(event);

exports.aggregate = aggregate;
exports.evolveWith = evolveWith;
