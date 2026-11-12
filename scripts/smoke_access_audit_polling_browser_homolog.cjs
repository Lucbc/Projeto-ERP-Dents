const fs = require('node:fs'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
(async () => {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    stage = 'login';
    await page.goto('https://localhost:18444/login');
    await page.locator('[name=email]').fill(input.readerEmail);
    await page.locator('[name=password]').fill(input.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByRole('region', { name: 'Pacientes cadastrados', exact: true }).waitFor();
    const matches = response => response.url().includes('/api/clinical-records?') && response.status() === 200;
    stage = 'initial clinical query';
    const first = page.waitForResponse(matches);
    await page.goto('https://localhost:18444/patients/' + input.patientId + '/clinical-records');
    assert.equal((await (await first).json()).items.length, 10);
    await page.getByRole('heading', { name: 'Prontuário clínico', exact: true }).waitFor();
    stage = 'periodic clinical refresh without interaction';
    const start = Date.now();
    await page.waitForResponse(matches, { timeout: 25000 });
    assert.ok(Date.now() - start >= 10000, 'Must observe periodic refresh, not an immediate duplicate');
    console.log('PASS: Chrome initial clinical query and automatic periodic refresh, without clicking or reloading.');
  } finally { await browser.close(); }
})().catch(() => { console.error('Clinical reader browser failed at stage: ' + stage); process.exit(1); });
