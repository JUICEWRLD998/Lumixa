/**
 * @lumixa/replay — deterministic virtual-clock replay of the recorded corpus.
 *
 * The demo backbone: real World Cup matches end before judging, so the agent is
 * driven offline by replaying captured streams. A {@link createReplaySource}
 * implements the SAME `EventSource` interface as the live feed, so engine /
 * trader / store code is identical in both modes (the Phase-1 exit criterion).
 *
 *  - clock:  `loadCorpusEvents` / `eventsFromLines` — corpus ⇒ ordered events
 *  - source: `createReplaySource` / `createReplaySourceFromFiles` — the clock
 */
export * from './clock.js';
export * from './source.js';
