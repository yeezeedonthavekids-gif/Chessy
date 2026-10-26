import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync(join(process.cwd(), 'extension', 'manifest.json'), 'utf8'));
const background = readFileSync(join(process.cwd(), 'extension', 'background.js'), 'utf8');

/**
 * Fair-play guard: the extension must stay a launcher for the standalone app.
 * It may never gain access to web pages (and therefore to live game pages).
 */
describe('Chrome extension manifest', () => {
  it('is Manifest V3 with icons and a background launcher', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background.service_worker).toBe('background.js');
    expect(Object.keys(manifest.icons)).toEqual(['16', '32', '48', '128']);
  });

  it('requests no permissions and cannot run on any website', () => {
    expect(manifest.permissions ?? []).toEqual([]);
    expect(manifest.optional_permissions ?? []).toEqual([]);
    expect(manifest.host_permissions ?? []).toEqual([]);
    expect(manifest.optional_host_permissions ?? []).toEqual([]);
    expect(manifest.content_scripts).toBeUndefined();
    expect(manifest.web_accessible_resources).toBeUndefined();
    expect(manifest.externally_connectable).toBeUndefined();
  });

  it('allows WebAssembly (for Stockfish) but no remote or inline scripts', () => {
    const csp: string = manifest.content_security_policy.extension_pages;
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(csp).not.toMatch(/unsafe-inline|https?:/);
  });

  it('only opens the app in a tab — no page scripting', () => {
    expect(background).toContain("chrome.runtime.getURL('index.html')");
    expect(background).not.toMatch(/chrome\.scripting|executeScript|chrome\.debugger/);
  });
});
