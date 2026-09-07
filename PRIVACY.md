# TabFader Privacy Policy

Last updated: 2026-09-07

TabFader is a browser extension that shows which tabs are playing sound, lets you mute
them, and lets you set a volume level per site. It runs entirely inside your browser.

## What TabFader collects

Nothing. TabFader has no servers, no analytics, no crash reporting, no accounts and no
affiliate links. It makes no network requests of its own.

## What TabFader stores on your device

- The volume level you choose for a site, keyed by that site's origin (for example
  `https://www.youtube.com`). It is saved with `chrome.storage.local`, stays on your
  device, is not synced, and is removed when you uninstall the extension.
- Nothing else. Mute state is handled by the browser itself and is not stored by TabFader.

## What TabFader reads

- Which tabs are currently playing sound, with their title, icon and site, so it can list
  them in the popup. This is read from the browser only while the popup is open and is
  never stored or sent anywhere.
- On sites where you explicitly enabled volume control, TabFader's content script adjusts
  the volume of the media elements on the page. It does not read page content, form data
  or anything else.

## Permissions, in plain words

- `tabs`: list the tabs that are playing sound and mute or unmute them. Chrome labels this
  permission "Read your browsing history"; TabFader does not record or transmit any
  history.
- `storage`: remember your per-site volume levels locally.
- `scripting`: inject TabFader's own volume-control script on the sites you have enabled.
- Optional site access (`*://*/*`, requested one site at a time): only when you click
  "Control volume here" on a site, and only for that site. You can revoke it at any time
  from `chrome://extensions`.

## Third parties

The popup contains a "Buy me a coffee" link to a donation page operated by Buy Me a
Coffee. Nothing is shared with them unless you click the link and use their site, which
is governed by their own privacy policy.

## Changes

If this policy changes, the new version is published in this repository with an updated
date above. The extension keeps working the same way: local only.

## Contact

Open an issue at https://github.com/orlandogp/tabfader/issues.
