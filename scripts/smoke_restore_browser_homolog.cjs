const fs = require('node:fs');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  const credentials = JSON.parse(fs.readFileSync(0, 'utf8'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage(); // Uses actual Windows trust; no TLS bypass.
    await page.goto('https://localhost:18444/login');
    await page.locator('[name=email]').fill(credentials.email);
    await page.locator('[name=password]').fill(credentials.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByRole('region', { name: 'Pacientes cadastrados', exact: true }).waitFor();
    await page.goto('https://localhost:18444/patients');
    await page.getByPlaceholder(/Buscar por nome/).fill(credentials.patient);
    await page.getByRole('row').filter({ hasText: credentials.patient }).waitFor();
    await page.reload();
    await page.getByPlaceholder(/Buscar por nome/).fill(credentials.patient);
    await page.getByRole('row').filter({ hasText: credentials.patient }).waitFor();
    console.log('PASS: restored login and patient search/reopen in Chrome.');
  } finally { await browser.close(); }
})().catch(() => { console.error('Restore browser failed; details withheld.'); process.exit(1); });
