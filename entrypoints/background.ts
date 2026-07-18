// NOTE (resolution 1): the brief's `import { defineBackground } from 'wxt/sandbox'`
// does not exist in WXT 0.20.27 (no `./sandbox` export). Task 9 confirmed
// `defineContentScript` is exported from `#imports`; `defineBackground` is exported
// the same way.
import { defineBackground } from '#imports';
import { browser } from 'wxt/browser';
import type { BackgroundMessage, BackgroundResponse } from '@/lib/messages';
import { queryAudibleTabs, setTabMuted } from '@/lib/audible-tabs';
import { getSiteVolume, setSiteVolume } from '@/lib/storage';
import { hasOriginPermission } from '@/lib/permissions';
import { matchPatternForOrigin } from '@/lib/origin';

const CONTENT_JS = 'content-scripts/content.js';

// Reverses `matchPatternForOrigin`: `*://<host>/*` -> `<host>`. Used to turn
// already-granted permission patterns (from `permissions.getAll`) back into
// origins we can re-register content scripts for.
function hostFromOriginPattern(pattern: string): string | null {
  return /^\*:\/\/([^/]+)\/\*$/.exec(pattern)?.[1] ?? null;
}

async function registerOriginScript(origin: string): Promise<void> {
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
}

async function ensureContentScript(origin: string, tabId: number): Promise<void> {
  await registerOriginScript(origin);
  // Inject immediately into the current tab so the slider works without a reload.
  try {
    await browser.scripting.executeScript({ target: { tabId, allFrames: true }, files: [CONTENT_JS] });
  } catch {
    /* tab may be a restricted page */
  }
}

// Extension updates/browser restarts drop `scripting.registerContentScripts`
// registrations but NOT the granted host permissions, so on `onInstalled` we
// re-derive the granted origins from `permissions.getAll` and re-register
// their content scripts (registration only — no tab to inject into yet).
export async function reregisterGrantedOrigins(): Promise<void> {
  const { origins = [] } = await browser.permissions.getAll();
  for (const pattern of origins) {
    const host = hostFromOriginPattern(pattern);
    if (!host) continue;
    try {
      await registerOriginScript(host);
    } catch {
      /* one origin's registration failing shouldn't block the rest */
    }
  }
}

// ROOT CAUSE FIX (field-confirmed bug): the native permission prompt steals
// focus and CLOSES the popup, killing its JS — so the popup's post-grant code
// (grantSite -> register + inject) never runs, leaving a granted-but-dead
// slider. The grant orchestration must live here, in the service worker, which
// survives the popup: when the browser confirms a host permission was added,
// register the origin's content script and inject it into every already-open
// matching tab. `grantSite` stays as an idempotent belt-and-braces path for
// the rare case the popup survives the prompt.
export async function handlePermissionsAdded(perms: chrome.permissions.Permissions): Promise<void> {
  for (const pattern of perms.origins ?? []) {
    const host = hostFromOriginPattern(pattern);
    if (!host) continue;
    try {
      await registerOriginScript(host);
      const tabs = await browser.tabs.query({ url: pattern });
      for (const tab of tabs) {
        if (tab.id == null) continue;
        try {
          await browser.scripting.executeScript({
            target: { tabId: tab.id, allFrames: true },
            files: [CONTENT_JS],
          });
        } catch {
          /* restricted page — mute still works there */
        }
      }
    } catch {
      /* one origin failing shouldn't block the rest */
    }
  }
}

export async function handleCommand(command: string): Promise<void> {
  if (command !== 'toggle-mute-active') return;
  const [active] = await browser.tabs.query({ active: true, currentWindow: true });
  if (active?.id == null) return;
  await setTabMuted(active.id, !(active.mutedInfo?.muted ?? false));
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
      // Toggle semantics: the popup decides the target state (true = mute
      // everything, false = unmute everything).
      const tabs = await queryAudibleTabs();
      await Promise.all(tabs.map((t) => setTabMuted(t.id, msg.muted)));
      return;
    }
    case 'setVolume':
      await setSiteVolume(msg.origin, msg.volume);
      await browser.tabs.sendMessage(msg.tabId, { type: 'applyVolume', volume: msg.volume }).catch(() => {});
      return;
    case 'grantSite': {
      // NOTE: the popup already called `requestOriginPermission` under the
      // click's user gesture (see popup/App.tsx `unlock`). Re-requesting here
      // would run in the service-worker context, which has no user gesture to
      // point to, so Chrome could reject the request even though the
      // permission was in fact just granted. `permissions.contains` carries no
      // gesture requirement, so we just confirm what the popup already did.
      const granted = await hasOriginPermission(msg.origin);
      if (granted) await ensureContentScript(msg.origin, msg.tabId);
      return { granted };
    }
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    handleMessage(msg as BackgroundMessage, sender)
      .then(sendResponse)
      .catch(() => sendResponse(undefined)); // a handler failure must still respond, or the popup's await hangs
    return true; // keep the channel open for the async response
  });
  browser.commands.onCommand.addListener((command) => { handleCommand(command); });
  browser.runtime.onInstalled.addListener(reregisterGrantedOrigins);
  browser.permissions.onAdded.addListener(handlePermissionsAdded);
});
