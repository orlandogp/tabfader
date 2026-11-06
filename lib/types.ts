export interface AudibleTab {
  id: number;
  title: string;
  url: string;
  origin: string;
  favIconUrl?: string;
  muted: boolean;
  /** Producing sound right now (Chrome clears it ~2.5s after the sound stops). */
  audible: boolean;
}

export interface SitePref {
  /** Unit gain, 0.0–1.0. */
  volume: number;
}
