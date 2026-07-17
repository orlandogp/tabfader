export interface AudibleTab {
  id: number;
  title: string;
  url: string;
  origin: string;
  favIconUrl?: string;
  muted: boolean;
}

export interface SitePref {
  /** Unit gain, 0.0–1.0. */
  volume: number;
}
