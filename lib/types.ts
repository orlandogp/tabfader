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

export interface Settings {
  shortcutsEnabled: boolean;
  donationDismissed: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  shortcutsEnabled: true,
  donationDismissed: false,
};
