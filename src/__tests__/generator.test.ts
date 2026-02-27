import { describe, it, expect } from 'vitest';
import { isEnabled } from '../generator';

describe('isEnabled', () => {
  it('returns false when config value is undefined', () => {
    expect(isEnabled(undefined)).toBe(false);
  });

  it('returns false when config value is empty string', () => {
    expect(isEnabled('')).toBe(false);
  });

  it('returns false when config value is "false"', () => {
    expect(isEnabled('false')).toBe(false);
  });

  it('returns false when config value is "0"', () => {
    expect(isEnabled('0')).toBe(false);
  });

  it('returns true when config value is "true"', () => {
    expect(isEnabled('true')).toBe(true);
  });

  it('returns true when config value is "TRUE" (case insensitive)', () => {
    expect(isEnabled('TRUE')).toBe(true);
  });

  it('returns true when config value is "True" (case insensitive)', () => {
    expect(isEnabled('True')).toBe(true);
  });
});
