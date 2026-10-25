// Diagnosis of the old behavior, not an acceptance test for the forthcoming fix.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
(async () => {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const cases = [
    { zone: 'America/Sao_Paulo', start: '2020-01-07T22:30', end: '2020-01-07T23:30',
      date: '07/01/2020', from: '2020-01-07T03:00:00.000Z', to: '2020-01-08T02:59:59.000Z', column: 1, top: 93.75, found: true },
    { zone: 'UTC', start: '2020-01-08T01:30', end: '2020-01-08T02:30',
      date: '08/01/2020', from: '2020-01-07T00:00:00.000Z', to: '2020-01-07T23:59:59.000Z', column: 2, top: 6.25, found: false },
    { zone: 'Asia/Tokyo', start: '2020-01-08T10:30', end: '2020-01-08T11:30',
      date: '08/01/2020', from: '2020-01-06T15:00:00.000Z', to: '2020-01-07T14:59:59.000Z', column: 2, top: 43.75, found: false },
  ];
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const c of cases) {
      stage = c.zone + ' login';
      const context = await browser.newContext({ timezoneId: c.zone, viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      let appointmentWrites = 0;
      page.on('request', request => {
        if (new URL(request.url()).pathname.startsWith('/api/appointments') &&
            ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) appointmentWrites++;
      });
      await page.goto('https://localhost:18444/login');
      await page.locator('[name=email]').fill(input.email);
      await page.locator('[name=password]').fill(input.password);
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await page.getByRole('region', { name: 'Pacientes cadastrados', exact: true }).waitFor();
      await page.clock.setFixedTime(new Date('2020-01-07T12:00:00Z'));
      stage = c.zone + ' list display and editor';
      await page.goto('https://localhost:18444/appointments');
      const row = page.getByRole('row').filter({ hasText: input.fixtureName });
      await row.waitFor();
      assert.ok((await row.innerText()).includes(c.date));
      assert.ok((await row.innerText()).includes(c.start.slice(11)));
      await row.getByRole('button', { name: 'Editar', exact: true }).click();
      await page.locator('[name=start_at]').waitFor();
      assert.equal(await page.locator('[name=start_at]').inputValue(), c.start);
      assert.equal(await page.locator('[name=end_at]').inputValue(), c.end);
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
      stage = c.zone + ' clinical day filter';
      await page.locator('input[type=date]').nth(0).fill('2020-01-07');
      const filtered = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === '/api/appointments' && url.searchParams.get('from') === c.from && url.searchParams.get('to') === c.to;
      });
      await page.locator('input[type=date]').nth(1).fill('2020-01-07');
      const response = await filtered;
      assert.equal(response.status(), 200);
      assert.equal(JSON.stringify(await response.json()).includes(input.appointmentId), c.found);
      stage = c.zone + ' calendar position and editor';
      await page.goto('https://localhost:18444/calendar');
      const event = page.locator('.rbc-event').filter({ hasText: input.fixtureName });
      await event.waitFor();
      const geometry = await event.evaluate(node => ({
        column: [...document.querySelectorAll('.rbc-day-slot')].indexOf(node.closest('.rbc-day-slot')),
        top: parseFloat(node.style.top),
      }));
      assert.equal(geometry.column, c.column);
      assert.ok(Math.abs(geometry.top - c.top) < 0.1);
      await event.click();
      await page.locator('[name=start_at]').waitFor();
      assert.equal(await page.locator('[name=start_at]').inputValue(), c.start);
      assert.equal(await page.locator('[name=end_at]').inputValue(), c.end);
      assert.equal(appointmentWrites, 0);
      await context.close();
    }
    console.log('PASS: historical diagnosis reproduced workstation-dependent list/editor/calendar and day filters in Sao Paulo/UTC/Tokyo; zero appointment writes.');
  } finally { await browser.close(); }
})().catch(() => { console.error('Appointment timezone diagnosis failed at stage: ' + stage); process.exitCode = 1; });
