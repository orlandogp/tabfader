import { browser } from 'wxt/browser';
import type { AudibleTab } from './types';

export type BackgroundMessage =
  | { type: 'list' }
  | { type: 'toggleMute'; tabId: number; muted: boolean }
  | { type: 'muteAll'; muted: boolean }
  | { type: 'setVolume'; tabId: number; origin: string; volume: number }
  | { type: 'grantSite'; tabId: number; origin: string };

export type BackgroundResponse =
  | AudibleTab[]           // for 'list'
  | { granted: boolean }   // for 'grantSite'
  | void;                  // for the rest

export type ContentMessage = { type: 'applyVolume'; volume: number };

export async function sendToBackground(msg: BackgroundMessage): Promise<BackgroundResponse> {
  return browser.runtime.sendMessage(msg);
}

export async function sendToTab(tabId: number, msg: ContentMessage): Promise<void> {
  try {
    await browser.tabs.sendMessage(tabId, msg);
  } catch {
    // No content script in the tab yet (e.g. not granted / not injected). Caller handles.
  }
}
