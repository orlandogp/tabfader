interface Props {
  /** Rendered size in CSS px; the mark is square. */
  size?: number;
  /** `tile` is the brand mark (blue tile, white fader); `glyph` is the bare fader in currentColor for inline use. */
  variant?: 'tile' | 'glyph';
}

// NOTE: geometry mirrors assets/icon.svg on purpose so the popup shows the exact mark
// that ships as the extension icon; FaderMark.test.tsx fails if the two drift apart.
export function FaderMark({ size = 18, variant = 'tile' }: Props) {
  const tile = variant === 'tile';
  const ink = tile ? '#fff' : 'currentColor';
  return (
    <svg class="fader-mark" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      {tile && <rect width="16" height="16" rx="3.5" fill="#2f6fed" />}
      <rect x="7" y="2.5" width="2" height="11" rx="1" fill={ink} opacity=".45" />
      <rect x="4" y="9" width="8" height="3" rx="1.5" fill={ink} />
    </svg>
  );
}
