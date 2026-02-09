import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isEnabled } from '../generator';

describe('isEnabled', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns false when GENERATE_ENT is not set', () => {
    delete process.env.GENERATE_ENT;
    expect(isEnabled()).toBe(false);
  });

  it('returns false when GENERATE_ENT is empty string', () => {
    process.env.GENERATE_ENT = '';
    expect(isEnabled()).toBe(false);
  });

  it('returns false when GENERATE_ENT is "false"', () => {
    process.env.GENERATE_ENT = 'false';
    expect(isEnabled()).toBe(false);
  });

  it('returns false when GENERATE_ENT is "0"', () => {
    process.env.GENERATE_ENT = '0';
    expect(isEnabled()).toBe(false);
  });

  it('returns true when GENERATE_ENT is "true"', () => {
    process.env.GENERATE_ENT = 'true';
    expect(isEnabled()).toBe(true);
  });

  it('returns true when GENERATE_ENT is "TRUE" (case insensitive)', () => {
    process.env.GENERATE_ENT = 'TRUE';
    expect(isEnabled()).toBe(true);
  });

  it('returns true when GENERATE_ENT is "True" (case insensitive)', () => {
    process.env.GENERATE_ENT = 'True';
    expect(isEnabled()).toBe(true);
  });
});
