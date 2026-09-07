import { render } from 'preact';
import { App } from './App';

const DONATE_URL = 'https://buymeacoffee.com/orlandogomez';

render(<App donateUrl={DONATE_URL} />, document.getElementById('app')!);
