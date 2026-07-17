import { describe, it, expect } from 'vitest';
import { originKeyFromUrl, isSupportedUrl, matchPatternForOrigin } from './origin';

describe('originKeyFromUrl', () => {
  it('returns the host for https URLs', () => {
    expect(originKeyFromUrl('https://www.youtube.com/watch?v=x')).toBe('www.youtube.com');
  });
  it('returns the host for http URLs', () => {
    expect(originKeyFromUrl('http://example.com:8080/a')).toBe('example.com');
  });
  it('returns null for chrome:// and invalid URLs', () => {
    expect(originKeyFromUrl('chrome://extensions')).toBeNull();
    expect(originKeyFromUrl('not a url')).toBeNull();
  });
});

describe('isSupportedUrl', () => {
  it('accepts http/https and rejects the rest', () => {
    expect(isSupportedUrl('https://a.com')).toBe(true);
    expect(isSupportedUrl('chrome://newtab')).toBe(false);
    expect(isSupportedUrl('about:blank')).toBe(false);
  });
});

describe('matchPatternForOrigin', () => {
  it('builds a host match pattern', () => {
    expect(matchPatternForOrigin('twitch.tv')).toBe('*://twitch.tv/*');
  });
});
