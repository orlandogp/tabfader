import { browser } from 'wxt/browser';
import type { AudibleTab } from './types';

export type BackgroundMessage =
  /** `keep`: tab ids the open popup already shows; listed while they still exist. */
  | { type: 'list'; keep?: number[] }
  | { type: 'toggleMute'; tabId: number; muted: boolean }
  /** `keep`: the rows the popup shows, so silent ones it still lists are reached too. */
  | { type: 'muteAll'; muted: boolean; keep?: number[] }
  | { type: 'setVolume'; tabId: number; origin: string; volume: number }
  | { type: 'grantSite'; tabId: number; origin: string };

export type BackgroundResponse =
  | AudibleTab[]           // for 'list'
  | { granted: boolean }   // for 'grantSite'
  | void;                  // for the rest

export type ContentMessage =
  | { type: 'applyVolume'; volume: number }
  /** Answered with the page's own current volume (number) or null when it has no media. */
  | { type: 'readVolume' };

export async function sendToBackground(msg: BackgroundMessage): Promise<BackgroundResponse> {
  return browser.runtime.sendMessage(msg);
}

/** The page volume a granted tab reports, or null if it can't (no script yet, no media). */
export async function readTabVolume(tabId: number): Promise<number | null> {
  try {
    const volume = await browser.tabs.sendMessage(tabId, { type: 'readVolume' } satisfies ContentMessage);
    return typeof volume === 'number' ? volume : null;
  } catch {
    return null;
  }
}

export async function sendToTab(tabId: number, msg: ContentMessage): Promise<void> {
  try {
    await browser.tabs.sendMessage(tabId, msg);
  } catch {
    // No content script in the tab yet (e.g. not granted / not injected). Caller handles.
  }
}
