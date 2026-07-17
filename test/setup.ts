import { fakeBrowser } from 'wxt/testing';
import { beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

beforeEach(() => {
  fakeBrowser.reset();
});
