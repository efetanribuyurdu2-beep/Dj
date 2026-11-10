// Deck e2e: local files, analysis, playback, sync, stems (helper in --fake mode), MIDI learn via injected messages.
// Needs: preview on :4173, `python stems-helper/server.py --fake` on :7777, test audio in $AUDIO_DIR.
const { chromium } = require('playwright');
const assert = require('assert');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:4173/';
const DIR = process.env.AUDIO_DIR;
const SHOTS = process.env.SHOTS;

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  const step = (m) => console.log('✓', m);

  await page.goto(BASE + '#/deck');
  await page.evaluate(() => new Promise((r) => { localStorage.clear(); const q = indexedDB.deleteDatabase('floor-deck'); q.onsuccess = q.onerror = q.onblocked = () => r(); }));
  await page.reload();
  await page.getByRole('heading', { name: 'Kütüphane' }).waitFor();

  await page.locator('.dropzone input[type=file]').setInputFiles([path.join(DIR, 'club-124.wav'), path.join(DIR, 'warmup-120.wav')]);
  await page.locator('.track', { hasText: 'club-124' }).getByText(/124\.\d BPM/).waitFor({ timeout: 30000 });
  await page.locator('.track', { hasText: 'warmup-120' }).getByText(/120\.\d BPM/).waitFor({ timeout: 30000 });
  const bpmA = await page.locator('.track', { hasText: 'club-124' }).locator('.track-meta').innerText();
  step('import + analysis: ' + bpmA.split('·').slice(0, 2).join('·').trim());

  await page.locator('.track', { hasText: 'club-124' }).getByRole('button', { name: '→ A' }).click();
  await page.locator('.track', { hasText: 'warmup-120' }).getByRole('button', { name: '→ B' }).click();
  await page.locator('.deck-A .deck-name', { hasText: 'club-124' }).waitFor();
  await page.locator('.deck-B .deck-name', { hasText: 'warmup-120' }).waitFor();
  await page.locator('.deck-A').getByRole('button', { name: 'Çal' }).click();
  await page.waitForTimeout(1500);
  const t1 = await page.locator('.deck-A .deck-time').innerText();
  assert.match(t1, /^0:0[1-2]/, 'deck A time advances: ' + t1);
  step('load on decks + play (time ' + t1.split('/')[0].trim() + ')');

  // sync B to A → 124.0 BPM shown on B
  await page.locator('.deck-B').getByRole('button', { name: 'SYNC' }).click();
  await page.locator('.deck-B .deck-meta', { hasText: /12[34]\.\d BPM/ }).waitFor();
  const bMeta = await page.locator('.deck-B .deck-meta').innerText();
  step('sync: ' + bMeta.split('·')[0].trim());

  // persistence: library survives reload
  await page.reload();
  await page.locator('.track', { hasText: 'warmup-120' }).waitFor();
  assert.equal(await page.locator('.track').count(), 2);
  step('library persists across reload (IndexedDB)');

  // stems via helper (fake backend)
  await page.locator('.helper-status', { hasText: 'TEST MODU' }).waitFor({ timeout: 10000 });
  await page.locator('.track', { hasText: 'club-124' }).getByRole('button', { name: 'Stem’lere ayır' }).click();
  await page.locator('.track', { hasText: 'club-124' }).getByText('test stem').waitFor({ timeout: 60000 });
  await page.locator('.track', { hasText: 'club-124' }).getByRole('button', { name: '→ A' }).click();
  await page.locator('.deck-A .stem-mode input').waitFor();
  await page.waitForFunction(() => document.querySelector('.deck-A .stem-mode input')?.checked === true, null, { timeout: 15000 });
  await page.locator('.deck-A').getByRole('button', { name: /Vokal/ }).click();
  assert.equal(await page.locator('.deck-A').getByRole('button', { name: /Vokal/ }).getAttribute('aria-pressed'), 'false');
  step('stems: separated via helper, loaded, vocal pad mutes');

  // MIDI learn with injected messages (no hardware in CI)
  const learnOk = await page.evaluate(async () => {
    const m = window.__floorMidi;
    m.status = 'ready';
    m.devices = ['DDJ-FLX2 (test)'];
    const a = (id) => ({ id, label: id, kind: id === 'crossfader' ? 'absolute' : 'button', group: 'Mixer' });
    m.learn(a('crossfader'));
    m.handle([0xb6, 31, 10]);
    m.learn({ id: 'A.play', label: 'p', kind: 'button', group: 'Deck A' });
    m.handle([0x90, 11, 127]);
    m.handle([0xb6, 31, 127]); // crossfader fully right
    return m.bindings.length;
  });
  assert.equal(learnOk, 2);
  await page.waitForFunction(() => Number(document.querySelector('#xf').value) > 0.99);
  const playingBefore = await page.locator('.deck-A .tpad-play').getAttribute('aria-pressed');
  await page.evaluate(() => window.__floorMidi.handle([0x90, 11, 127]));
  await page.waitForTimeout(200);
  const playingAfter = await page.locator('.deck-A .tpad-play').getAttribute('aria-pressed');
  assert.notEqual(playingBefore, playingAfter, 'MIDI play toggles deck A');
  await page.reload();
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('floor.midi.bindings')).length);
  assert.equal(kept, 2);
  step('MIDI learn: crossfader + play bound, drive the mixer, saved');

  if (SHOTS) {
    await page.locator('.track', { hasText: 'club-124' }).getByRole('button', { name: '→ A' }).click();
    await page.locator('.track', { hasText: 'warmup-120' }).getByRole('button', { name: '→ B' }).click();
    await page.waitForTimeout(800);
    await page.locator('.deck-A').getByRole('button', { name: 'Çal' }).click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(SHOTS, 'deck-1440.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SHOTS, 'deck-390.png'), fullPage: true });
  }
  assert.deepEqual(errors, []);
  console.log('\nDECK E2E OK');
  await browser.close();
})().catch((e) => {
  console.error('DECK E2E FAILED:', e.message);
  process.exit(1);
});
