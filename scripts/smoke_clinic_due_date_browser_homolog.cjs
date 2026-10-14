// Fixed browser clock only; server/system clocks and production data are never touched.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
process.on('unhandledRejection', () => { console.error('Clinic due date browser failed at stage: ' + stage); process.exit(1); });
(async () => {
  const credentials = JSON.parse(fs.readFileSync(0, 'utf8'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const origin = 'https://localhost:18444';
  try {
    for (const zone of ['America/Sao_Paulo', 'UTC', 'Asia/Tokyo']) {
      stage = zone + ' login';
      const context = await browser.newContext({ timezoneId: zone, viewport: { width: 1440, height: 1100 } });
      const page = await context.newPage();
      await page.goto(origin + '/login');
      await page.locator('[name=email]').fill(credentials.email);
      await page.locator('[name=password]').fill(credentials.password);
      const response = page.waitForResponse(r => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      const identity = await (await response).json();
      await page.getByRole('region', { name: 'Pacientes cadastrados', exact: true }).waitFor();
      // A past instant avoids advancing beyond the real server session expiry.
      await page.clock.setFixedTime(new Date('2020-01-08T02:59:59Z'));
      await page.goto(origin + '/financial');
      let writes = 0;
      page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/') && ['POST','PUT','PATCH','DELETE'].includes(r.method())) writes++; });
      const open = async () => {
        await page.getByRole('button', { name: 'Novo lancamento', exact: true }).click();
        await page.locator('[name=due_date]').waitFor();
      };
      const save = async (label, expected) => {
        await page.locator('[name=description]').fill(label);
        await page.locator('[name=amount]').fill('120');
        const pending = page.waitForResponse(r => r.url().endsWith('/api/financial') && r.request().method() === 'POST');
        await page.getByRole('button', { name: 'Salvar', exact: true }).click();
        const saved = await pending; assert.equal(saved.status(), 201);
        assert.equal(saved.request().postDataJSON().due_date, expected);
        const entry = await saved.json(); assert.equal(entry.due_date, expected);
        await page.locator('[name=due_date]').waitFor({ state: 'hidden' });
        const fetched = await page.evaluate(async ({ id, identity }) => {
          const r = await fetch('/api/financial/' + id, { headers: { 'X-Session-ID': identity.session_id } });
          if (!r.ok) throw new Error('Read failed'); return r.json();
        }, { id: entry.id, identity });
        assert.equal(fetched.due_date, expected); assert.equal(fetched.version, entry.version);
        return entry;
      };
      stage = zone + ' default and explicit create';
      await open(); assert.equal(await page.locator('[name=due_date]').inputValue(), '2020-01-07');
      assert.equal(writes, 0);
      const original = await save('Fictitious Clinic Default ' + zone, '2020-01-07');
      stage = zone + ' draft across midnight';
      await open(); await page.locator('[name=due_date]').fill('2020-02-10');
      await page.clock.setFixedTime(new Date('2020-01-08T03:00:00Z'));
      await page.getByRole('button', { name: 'Atualizar referências do lançamento', exact: true }).click();
      await page.waitForTimeout(17000);
      assert.equal(await page.locator('[name=due_date]').inputValue(), '2020-02-10');
      assert.equal(writes, 1);
      await save('Fictitious Clinic Chosen ' + zone, '2020-02-10');
      stage = zone + ' reopen and edit';
      await open(); assert.equal(await page.locator('[name=due_date]').inputValue(), '2020-01-08');
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
      await page.getByRole('row').filter({ hasText: original.description }).getByRole('button', { name: 'Editar', exact: true }).click();
      assert.equal(await page.locator('[name=due_date]').inputValue(), '2020-01-07');
      assert.equal(writes, 2);
      if (zone === 'America/Sao_Paulo') await page.screenshot({ path: path.resolve(__dirname, '../.data/homolog/clinic-due-date-edit.png'), fullPage: true });
      await context.close();
    }
    console.log('PASS: Sao Paulo/UTC/Tokyo; clinic-day default; chosen date across midnight and refresh; new action recalculates; edit preserves date; six explicit creates with matching payload/API reread; no automatic writes.');
  } finally { await browser.close(); }
})().catch(() => { console.error('Clinic due date browser failed at stage: ' + stage); process.exit(1); });
