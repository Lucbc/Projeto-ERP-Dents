// Real private API responses. Only the API financial clock is controlled by the Python harness.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
(async () => {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext({ timezoneId: input.zone });
    const page = await context.newPage();
    stage = 'login';
    await page.goto('https://localhost:18444/login');
    await page.locator('[name=email]').fill(input.email);
    await page.locator('[name=password]').fill(input.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByRole('region', { name: 'Pacientes cadastrados', exact: true }).waitFor();
    let writes = 0;
    page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method())) writes++; });
    stage = 'summary and rows';
    await page.goto('https://localhost:18444/financial');
    const amount = input.day === 7 ? '120,00' : '240,00';
    await page.getByText(new RegExp('Vencidos:.*' + amount.replace(',', '\\,'))).waitFor();
    for (const kind of ['income', 'expense']) {
      for (const status of ['pending', 'paid', 'cancelled']) {
        for (const day of [6, 7, 8]) {
          const row = page.getByRole('row').filter({ hasText: `Fictitious ${kind} ${status} day ${day}` });
          await row.waitFor();
          const overdue = status === 'pending' && day < input.day;
          assert.equal(await row.getByText('Vencido', { exact: true }).count(), overdue ? 1 : 0);
        }
      }
    }
    assert.equal(writes, 0);
    console.log('PASS: Chrome overdue indicators and summary agree with real API; 18 rows; zero writes; ' + input.zone + ' clinical day ' + input.day);
  } finally { await browser.close(); }
})().catch(() => { console.error('Financial history browser failed at stage: overdue ' + stage); process.exitCode = 1; });
