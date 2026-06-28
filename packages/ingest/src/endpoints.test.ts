import { describe, it, expect } from 'vitest';
import {
  oddsSnapshotUrl,
  statValidationUrl,
  guestStartUrl,
  activateTokenUrl,
} from './endpoints.js';

const BASE = 'https://txline.example.com';

describe('endpoints (confirmed paths)', () => {
  it('builds the guest-start URL', () => {
    expect(guestStartUrl(BASE)).toBe(`${BASE}/auth/guest/start`);
  });

  it('builds the token-activate URL', () => {
    expect(activateTokenUrl(BASE)).toBe(`${BASE}/api/token/activate`);
  });

  it('builds a live odds snapshot URL (no asOf)', () => {
    expect(oddsSnapshotUrl(BASE, 123)).toBe(
      `${BASE}/api/odds/snapshot/123`,
    );
  });

  it('builds a historical odds snapshot URL with asOf query', () => {
    expect(oddsSnapshotUrl(BASE, 123, 1718000000000)).toBe(
      `${BASE}/api/odds/snapshot/123?asOf=1718000000000`,
    );
  });

  it('builds the stat-validation URL with all query params', () => {
    expect(statValidationUrl(BASE, 123, 7, 'score')).toBe(
      `${BASE}/api/scores/stat-validation?fixtureId=123&seq=7&statKey=score`,
    );
  });

  it('tolerates a trailing slash on the base URL', () => {
    expect(oddsSnapshotUrl(`${BASE}/`, 123)).toBe(
      `${BASE}/api/odds/snapshot/123`,
    );
  });
});
