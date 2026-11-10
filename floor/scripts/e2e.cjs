// End-to-end check of the main loop in a real browser.
// Usage: npm run build && npx vite preview --port 4173 &  then  node scripts/e2e.cjs
const { chromium } = require('playwright');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const BASE = process.env.BASE || 'http://localhost:4173/';
const SHOTS = process.env.SHOTS; // optional folder for screenshots

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  const shot = async (n) => SHOTS && page.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true });
  const step = (m) => console.log('✓', m);

  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  assert(await page.getByRole('button', { name: /Resume session/ }).isDisabled(), 'resume disabled without a session');
  step('fresh start: no fake session, resume disabled');

  // 1. open a sample night and customise the room
  await page.getByRole('button', { name: 'Özelleştir' }).first().click();
  await page.waitForURL(/#\/room\//);
  const id = page.url().split('/').pop();
  await page.getByRole('radio', { name: 'Small bar' }).check();
  const people = page.getByLabel('Kişi sayısı', { exact: true });
  await people.fill('30');
  assert.match(await page.locator('.floorpanel figure, .floorview').first().getAttribute('aria-label'), /30 kişiden/);
  step('room builder: venue + crowd change reflected in plan');

  // 2. arc: change a section duration, total updates, mismatch → fit
  await page.getByRole('button', { name: /Gecenin akışını kur/ }).first().click();
  await page.waitForURL(/#\/arc\//);
  const totals = () => page.locator('.totals').innerText();
  const before = await totals();
  await page.getByRole('button', { name: 'Süre artır' }).click();
  await page.getByRole('button', { name: 'Süre artır' }).click();
  const after = await totals();
  assert.notEqual(before, after);
  assert(await page.getByRole('button', { name: /Provaya başla/ }).isDisabled(), 'start blocked while totals mismatch');
  await page.getByRole('button', { name: 'Süreye sığdır' }).click();
  assert(!(await page.getByRole('button', { name: /Provaya başla/ }).isDisabled()));
  // keyboard on the curve
  const handle = page.getByRole('slider', { name: /Warm-up enerjisi/ });
  const e0 = Number(await handle.getAttribute('aria-valuenow'));
  await handle.focus();
  await page.keyboard.press('ArrowUp');
  assert.equal(Number(await handle.getAttribute('aria-valuenow')), e0 + 5);
  step('night arc: duration edit, total check, fit, keyboard energy');
  await shot('e2e-arc');

  // 3. rehearse: decisions via keyboard, pause, curveball
  await page.getByRole('button', { name: /Provaya başla/ }).click();
  await page.waitForURL(/#\/rehearse\//);
  await page.getByRole('button', { name: '4×' }).click();
  assert(await page.locator('.pad.is-armed').count(), 'decision armed at minute 0');
  await page.keyboard.press('1');
  await page.waitForFunction(() => document.querySelector('.clock-min')?.textContent?.startsWith('02'));
  await page.getByRole('button', { name: 'Duraklat' }).click();
  const m1 = await page.locator('.clock-min').innerText();
  await page.waitForTimeout(800);
  assert.equal(await page.locator('.clock-min').innerText(), m1, 'clock holds while paused');
  step('rehearsal: keyboard decision, clock runs, pause holds');

  // reload mid-rehearsal → state restored
  await page.reload();
  assert.equal(await page.locator('.clock-min').innerText(), m1, 'minute survives reload');
  assert.equal(await page.locator('.feed-item').count(), 1, 'decision survives reload');
  step('reload: rehearsal position + decisions restored');

  // studio resume
  await page.goto(BASE + '#/');
  await page.getByRole('button', { name: /Resume session/ }).click();
  await page.waitForURL(/#\/rehearse\//);
  step('studio: resume session');

  await page.getByRole('button', { name: 'Devam et' }).click();
  let sawCurveball = false;
  for (let i = 0; i < 600; i++) {
    if (await page.getByRole('button', { name: /Değerlendirmeyi gör/ }).count()) break;
    const cb = page.locator('.cb-opt');
    if (await cb.count()) {
      sawCurveball = true;
      if (!(await page.locator('.feed-item.is-curve').count())) await shot('e2e-curveball');
      await cb.nth(1).click();
      continue;
    }
    if (await page.locator('.pad.is-armed').count()) await page.keyboard.press(String((i % 6) + 1));
    await page.waitForTimeout(60);
    // the shift key opens a direction picker
    const pick = page.locator('.shift-pick .pad-btn');
    if (await pick.count()) await pick.first().click();
  }
  assert(sawCurveball, 'a curveball appeared');
  step('rehearsal: ran to the end, answered curveballs, used every move');

  // 4. debrief
  await page.getByRole('button', { name: /Değerlendirmeyi gör/ }).click();
  await page.waitForURL(/#\/debrief\//);
  const title = await page.locator('.db-title').innerText();
  assert(title.length > 0);
  assert(await page.getByText('Bir sonraki FLX2 pratiği').count());
  await page.getByRole('button', { name: 'Sıradaki pratik olarak kaydet' }).click();
  await shot('e2e-debrief');
  step('debrief: generated, practice saved');

  // 5. reload + reopen
  await page.reload();
  assert.equal(await page.locator('.db-title').innerText(), title, 'debrief identical after reload (deterministic)');
  await page.goto(BASE + '#/');
  assert(await page.getByText('Sıradaki pratik', { exact: true }).count(), 'studio shows next practice');
  assert(await page.locator('.night-row').count() >= 1);
  step('reload + studio: saved night, practice goal, last run visible');

  // 6. export → wipe → import
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Tümünü dışa aktar/ }).click()]);
  const file = path.join(os.tmpdir(), 'floor-e2e.json');
  await dl.saveAs(file);
  const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(exported.app, 'floor');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  assert.equal(await page.locator('.night-row').count(), 0);
  const bad = path.join(os.tmpdir(), 'floor-bad.json');
  fs.writeFileSync(bad, '{"app":"floor","version":1,"exportedAt":"x","sessions":[{"id":1}]}');
  await page.locator('input[type=file]').setInputFiles(bad);
  await page.getByText(/Dosya doğrulanamadı/).waitFor();
  await page.locator('input[type=file]').setInputFiles(file);
  await page.getByText(/içe aktarıldı/).waitFor();
  assert(await page.locator('.night-row').count() >= 1);
  await page.locator('.night-link').first().click();
  await page.waitForURL(/#\/debrief\//);
  assert.equal(await page.locator('.db-title').innerText(), title, 'imported night reopens with the same debrief');
  step('export / invalid import rejected / import / reopen');

  // 7. corrupt storage does not crash the app
  await page.evaluate(() => localStorage.setItem('floor.store', '{broken'));
  await page.goto(BASE + '#/');
  await page.reload();
  await page.getByText(/Kayıtlı veri okunamadı/).waitFor();
  step('corrupt storage: recovered with notice');

  assert.deepEqual(errors, [], 'no page errors');
  console.log('\nE2E OK', id);
  await browser.close();
})().catch((e) => {
  console.error('E2E FAILED:', e.message);
  process.exit(1);
});
