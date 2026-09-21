import { render } from 'preact';
import { browser } from 'wxt/browser';
import { App } from './App';

const DONATE_URL = 'https://buymeacoffee.com/orlandogomez';
// The manifest's homepage_url is the single source of truth for the repository link.
const REPO_URL = browser.runtime.getManifest().homepage_url;

render(<App donateUrl={DONATE_URL} repoUrl={REPO_URL} />, document.getElementById('app')!);
