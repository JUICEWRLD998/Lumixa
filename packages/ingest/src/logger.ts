import pino from 'pino';

/**
 * Shared `pino` logger for the ingest package. Named `ingest` so log lines are
 * attributable when multiple packages log into the same process (e.g. the
 * `record-live` script and the agent server).
 */
export const logger = pino({ name: 'ingest' });
