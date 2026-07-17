import { browser } from 'wxt/browser';
import { matchPatternForOrigin } from './origin';

function spec(origin: string) {
  return { origins: [matchPatternForOrigin(origin)] };
}

export async function hasOriginPermission(origin: string): Promise<boolean> {
  return browser.permissions.contains(spec(origin));
}

export async function requestOriginPermission(origin: string): Promise<boolean> {
  return browser.permissions.request(spec(origin));
}

export async function removeOriginPermission(origin: string): Promise<boolean> {
  return browser.permissions.remove(spec(origin));
}
