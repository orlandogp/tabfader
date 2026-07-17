export function isSupportedUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function originKeyFromUrl(url: string): string | null {
  if (!isSupportedUrl(url)) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function matchPatternForOrigin(origin: string): string {
  return `*://${origin}/*`;
}
