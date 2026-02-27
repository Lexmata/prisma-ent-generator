import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isEnabled } from '../generator';

describe('isEnabled', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns false when config value is undefined', () => {
    expect(isEnabled(undefined)).toBe(false);
  });

  it('returns false when config value is empty string', () => {
    expect(isEnabled('')).toBe(false);
  });

  it('returns false when config value is "false"', () => {
    expect(isEnabled('false')).toBe(false);
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

  it('resolves env var name when config value is not true/false', () => {
    process.env.GENERATE_ENT = 'true';
    expect(isEnabled('GENERATE_ENT')).toBe(true);
  });

  it('resolves env var name to false when env var is not true', () => {
    process.env.GENERATE_ENT = 'false';
    expect(isEnabled('GENERATE_ENT')).toBe(false);
  });

  it('resolves env var name to false when env var is unset', () => {
    delete process.env.MY_CUSTOM_VAR;
    expect(isEnabled('MY_CUSTOM_VAR')).toBe(false);
  });

  it('resolves env var name case-insensitively', () => {
    process.env.ENT_ENABLED = 'True';
    expect(isEnabled('ENT_ENABLED')).toBe(true);
  });
});
