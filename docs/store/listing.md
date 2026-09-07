# Chrome Web Store listing

Submission copy for the developer dashboard. Paste each block into the matching field.
Name and summary are read from the manifest (`wxt.config.ts`); everything else is typed
into the dashboard by hand.

## Package

```
pnpm build && pnpm zip   # -> .output/tabfader-<version>-chrome.zip
```

The version comes from `package.json`.

## Store listing tab

| Field    | Value                                                                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------- |
| Name     | TabFader: Per-Tab Volume Control (manifest; `short_name` stays TabFader)                                    |
| Summary  | Per-tab audio control: see what's playing, mute any tab, set a volume per site. 100% local, no tracking. (manifest) |
| Category | Accessibility                                                                                               |
| Language | English                                                                                                     |
| Homepage | `https://github.com/orlandogp/tabfader`                                                                                                |
| Support  | `https://github.com/orlandogp/tabfader/issues`                                                                                         |

### Detailed description

Plain text, no markdown. Paste as is.

```
TabFader shows every tab that is playing sound and lets you control each one from a single panel.

WHAT IT DOES
• Playing now: a live list of the tabs currently making sound, with their title and site.
• Mute any tab: one click, instantly, for free. No extra permissions needed.
• Mute all / Unmute all: silence everything and bring it back with one button.
• Per-site volume: set a level from 0% to 100% for a site, and TabFader remembers it the next time you open that site.
• Keyboard shortcut: Alt+Shift+M mutes or unmutes the active tab.
• Follows your browser's light or dark theme. Nothing to configure.

BUILT ON TRUST
• 100% local. Nothing leaves your browser: no servers, no analytics, no accounts, no affiliate links.
• Minimal permissions. Muting works without access to any website. Volume control is unlocked one site at a time, only when you ask for it, and you can revoke it from Chrome at any time.
• Open source. The full code is public so anyone can verify what it does: https://github.com/orlandogp/tabfader
• Free, supported by optional donations.

HONEST LIMITS
• TabFader lowers volume; it does not boost above 100%. Boosting requires capturing the tab's audio, which breaks fullscreen and shows a recording indicator, so it is left out on purpose.
• On DRM-protected players (for example Netflix or Spotify) browsers only allow mute and attenuation, not amplification. TabFader works within that limit, like every extension.
• Chrome shows a "Read your browsing history" warning at install because of the "tabs" permission. TabFader uses it only to list which tabs are playing sound and show their titles. Nothing is recorded or sent anywhere.

HOW VOLUME CONTROL WORKS
When you click "Control volume here" on a site for the first time, Chrome asks you to allow TabFader on that site. Once you accept, a slider appears for that site. The permission is per site and stays under your control in chrome://extensions.
```

### Graphic assets

Generated files live in this folder.

- `pnpm store:graphics` renders the store icon and both promo tiles from `assets/icon.svg`.
  Deterministic; the wordmark is Bricolage Grotesque 700 from Google Fonts.
- `pnpm store:screenshots` opens a real Chromium with the extension loaded, opens YouTube,
  Spotify and SoundCloud with a quiet test tone so Chrome marks them audible, captures the
  actual popup at 2× and composes each capture on a 1280×800 canvas. Screenshot 3 uses
  `wxt build --mode screenshots`, which pre-grants site access so the slider can be shown
  without Chrome's native permission prompt. That build lands in
  `.output/chrome-mv3-screenshots` and is never zipped. Screenshot 4 emulates the dark
  color scheme on the popup page.

| Asset            | File                        | Size      | Notes                                                        |
| ---------------- | --------------------------- | --------- | ------------------------------------------------------------ |
| Store icon       | `icon-128.png`              | 128×128   | 96 px artwork with 16 px transparent padding, per CWS guide  |
| Screenshots      | `screenshot-1.png` … `-4.png` | 1280×800 | Real popup captured at 2× and composed on a branded canvas; 4 is the dark scheme |
| Small promo tile | `promo-440x280.png`         | 440×280   | Required                                                     |
| Marquee tile     | `marquee-1400x560.png`      | 1400×560  | Optional                                                     |

## Privacy practices tab

### Single purpose

```
Control the audio of browser tabs: show which tabs are playing sound, mute or unmute them, and set a per-site volume level.
```

### Permission justifications

**tabs**

```
Needed to list the tabs that are currently playing sound (chrome.tabs.query with audible: true) and show each one's title, favicon and site, and to mute or unmute a tab (chrome.tabs.update with muted). Tab information is only displayed in the popup while it is open. Nothing is stored or transmitted.
```

**storage**

```
Stores the volume level the user chooses for a site, keyed by the site's origin, in chrome.storage.local so it can be reapplied on the next visit. No other data is stored. Nothing is synced or sent anywhere.
```

**scripting**

```
Registers and injects the extension's own small content script, which sets HTMLMediaElement.volume on a page. It only runs on sites where the user has explicitly enabled volume control and never anywhere else.
```

**Host permission (optional_host_permissions: `*://*/*`)**

```
Declared as optional and never requested at install. When the user clicks "Control volume here" on a specific site, the extension requests permission for that origin only (chrome.permissions.request). It is used exclusively to inject the volume-control script on that site. The user can revoke it at any time from chrome://extensions.
```

### Remote code

```
No. All code ships inside the package. Nothing is fetched, loaded or evaluated at runtime.
```

### Data usage

Collected data types: none. Leave every box unchecked.

Certifications (check all three):

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

Privacy policy URL: `https://github.com/orlandogp/tabfader/blob/main/PRIVACY.md`

## Distribution tab

| Field          | Value                                                          |
| -------------- | -------------------------------------------------------------- |
| Payments       | Free                                                           |
| Visibility     | Public                                                         |
| Regions        | All regions                                                    |
| Trader status  | Non-trader (personal project, voluntary donations only)        |

## Test instructions (optional field for reviewers)

```
1. Open any page with audio (for example a YouTube video) and let it play.
2. Click the TabFader toolbar icon: the tab appears under "Playing now".
3. Click the speaker button on the row to mute and unmute that tab.
4. Click "Control volume here" and accept Chrome's permission prompt for that site. A slider appears; moving it changes the tab's volume immediately.
5. Press Alt+Shift+M to mute or unmute the active tab.
```

## Account checklist

Before the first submission the dashboard requires a verified contact email and 2-Step Verification on the Google account. Fill in the developer email shown publicly on the listing.
