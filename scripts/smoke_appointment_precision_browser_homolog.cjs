const fs = require('node:fs'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
(async () => {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const zone of ['America/Sao_Paulo', 'UTC', 'Asia/Tokyo']) {
      stage = zone + ' login';
      const context = await browser.newContext({ timezoneId: zone, viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      await page.goto('https://localhost:18444/login');
      await page.locator('[name=email]').fill(input.email);
      await page.locator('[name=password]').fill(input.password);
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await page.getByRole('region', { name: 'Pacientes cadastrados', exact: true }).waitFor();
      // Fix browser navigation only, before the real session expiry.
      await page.clock.setFixedTime(new Date('2020-01-07T12:00:00Z'));
      for (const f of input.fixtures.filter(f => f.zone === zone)) {
        stage = zone + ' ' + f.mode + ' ' + input.action;
        await page.goto('https://localhost:18444/' + (f.mode === 'list' ? 'appointments' : 'calendar'));
        if (f.mode === 'list') await page.getByRole('row').filter({ hasText: f.name }).getByRole('button', { name: 'Editar', exact: true }).click();
        else await page.locator('.rbc-event').filter({ hasText: f.name }).first().click();
        await page.locator('[name=notes]').fill('Fictitious precision notes');
        if (input.action === 'end') {
          const end = page.locator('[name=end_at]');
          await end.fill((await end.inputValue()).slice(0, -2) + '15');
        }
        const response = page.waitForResponse(r => r.url().endsWith('/api/appointments/' + f.entry.id) && r.request().method() === 'PUT');
        await page.getByRole('button', { name: 'Salvar', exact: true }).click();
        const saved = await response;
        assert.equal(saved.status(), 200);
        const payload = saved.request().postDataJSON();
        assert.equal(payload.start_at, f.entry.start_at);
        assert.equal(payload.end_at, input.action === 'notes' ? f.entry.end_at : '2020-01-07T14:15:00.000Z');
        assert.equal(payload.version, input.action === 'notes' ? 1 : 2);
        await page.locator('[name=notes]').waitFor({ state: 'hidden' });
      }
      await context.close();
    }
    console.log('PASS: real list/calendar edits in Sao Paulo/UTC/Tokyo; exact untouched timestamp strings; explicit end change; ' + input.action);
  } finally { await browser.close(); }
})().catch(() => { console.error('Appointment precision browser failed at stage: ' + stage); process.exitCode = 1; });
