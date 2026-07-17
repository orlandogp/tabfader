import { render } from 'preact';
import { App } from './App';

const DONATE_URL = 'https://ko-fi.com/tabtune'; // TODO(owner): replace with real donation URL before publishing

render(<App donateUrl={DONATE_URL} />, document.getElementById('app')!);
