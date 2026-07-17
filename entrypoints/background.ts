// NOTE (resolution 1): the brief's `import { defineBackground } from 'wxt/sandbox'`
// does not exist in WXT 0.20.27 (no `./sandbox` export). Task 9 confirmed
// `defineContentScript` is exported from `#imports`; `defineBackground` is exported
// the same way.
import { defineBackground } from '#imports';
import { browser } from 'wxt/browser';
import type { BackgroundMessage, BackgroundResponse } from '@/lib/messages';
import { queryAudibleTabs, setTabMuted } from '@/lib/audible-tabs';
import { getSiteVolume, setSiteVolume } from '@/lib/storage';
import { requestOriginPermission } from '@/lib/permissions';
import { matchPatternForOrigin } from '@/lib/origin';

const CONTENT_JS = 'content-scripts/content.js';

async function ensureContentScript(origin: string, tabId: number): Promise<void> {
  const id = `tabtune-${origin}`;
  const pattern = matchPatternForOrigin(origin);
  // Register for future loads (idempotent: unregister-if-exists then register).
  try {
    await browser.scripting.unregisterContentScripts({ ids: [id] });
  } catch {
    /* not registered yet */
  }
  await browser.scripting.registerContentScripts([
    { id, js: [CONTENT_JS], matches: [pattern], runAt: 'document_start', allFrames: true },
  ]);
  // Inject immediately into the current tab so the slider works without a reload.
  try {
    await browser.scripting.executeScript({ target: { tabId, allFrames: true }, files: [CONTENT_JS] });
  } catch {
    /* tab may be a restricted page */
  }
}

export async function handleMessage(
  msg: BackgroundMessage,
  _sender: chrome.runtime.MessageSender,
): Promise<BackgroundResponse> {
  switch (msg.type) {
    case 'list':
      return queryAudibleTabs();
    case 'toggleMute':
      await setTabMuted(msg.tabId, msg.muted);
      return;
    case 'muteAll': {
      const tabs = await queryAudibleTabs();
      await Promise.all(tabs.map((t) => setTabMuted(t.id, true)));
      return;
    }
    case 'setVolume':
      await setSiteVolume(msg.origin, msg.volume);
      await browser.tabs.sendMessage(msg.tabId, { type: 'applyVolume', volume: msg.volume }).catch(() => {});
      return;
    case 'grantSite': {
      const granted = await requestOriginPermission(msg.origin);
      if (granted) await ensureContentScript(msg.origin, msg.tabId);
      return { granted };
    }
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    handleMessage(msg as BackgroundMessage, sender).then(sendResponse);
    return true; // keep the channel open for the async response
  });
});
