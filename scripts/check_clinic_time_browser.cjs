// Pure utility check in Chromium's Intl runtime. No app, API, DB or credentials.
const path = require('node:path');
const assert = require('node:assert/strict');
const { build } = require('../apps/web/node_modules/esbuild');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

(async () => {
  const compiled = await build({
    entryPoints: [path.join(__dirname, '../apps/web/src/lib/clinic-time.ts')],
    bundle: true, write: false, format: 'iife', globalName: 'ClinicTime', platform: 'browser',
  });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const zone of ['America/Sao_Paulo', 'UTC', 'Asia/Tokyo']) {
      const context = await browser.newContext({ timezoneId: zone });
      try {
        const page = await context.newPage();
        await page.addScriptTag({ content: compiled.outputFiles[0].text });
        const actual = await page.evaluate(() => {
          const { toClinicInput, resolveClinicInput } = window.ClinicTime;
          const original = '2019-02-16T23:30:47.654321-03:00';
          return {
            zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            input: toClinicInput('2030-01-08T01:30:00Z'),
            resolved: resolveClinicInput('2030-01-07T22:30'),
            gap: resolveClinicInput('2018-11-04T00:30'),
            repeated: resolveClinicInput('2019-02-16T23:30'),
            preserved: resolveClinicInput('2019-02-16T23:30', original),
            edited: resolveClinicInput('2019-02-17T00:15', original),
            lmt: resolveClinicInput('1900-01-01T10:00'),
          };
        });
        assert.deepEqual(actual, {
          zone, input: '2030-01-07T22:30',
          resolved: { ok: true, iso: '2030-01-08T01:30:00.000Z' },
          gap: { ok: false, reason: 'nonexistent' },
          repeated: { ok: false, reason: 'ambiguous', candidates: ['2019-02-17T01:30:00.000Z', '2019-02-17T02:30:00.000Z'] },
          preserved: { ok: true, iso: '2019-02-16T23:30:47.654321-03:00' },
          edited: { ok: true, iso: '2019-02-17T03:15:00.000Z' },
          lmt: { ok: true, iso: '1900-01-01T13:06:28.000Z' },
        });
        console.log('PASS: clinical-time utility in Chrome: ' + zone);
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
})().catch(() => { console.error('Clinical-time utility browser check failed'); process.exitCode = 1; });
