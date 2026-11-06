function parseWebUrl(url: string): URL | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
  } catch {
    return null;
  }
}

export function isSupportedUrl(url: string): boolean {
  return parseWebUrl(url) !== null;
}

export function originKeyFromUrl(url: string): string | null {
  return parseWebUrl(url)?.hostname ?? null;
}

export function matchPatternForOrigin(origin: string): string {
  return `*://${origin}/*`;
}
