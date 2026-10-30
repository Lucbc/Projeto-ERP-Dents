// One real Chrome operator while nine HTTP operators remain active.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
(async () => {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const timings = {};
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Sao_Paulo' })).newPage();
    page.setDefaultTimeout(30000);
    stage = 'login';
    await page.goto('https://localhost:18444/login');
    await page.locator('[name=email]').fill(input.readerEmail);
    await page.locator('[name=password]').fill(input.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByText('Pacientes cadastrados', { exact: true }).waitFor();
    stage = 'patient search';
    await page.goto('https://localhost:18444/patients');
    let start = performance.now();
    await page.getByPlaceholder(/Buscar por nome/).fill('Fictitious Load 04999');
    await page.getByRole('row').filter({ hasText: 'Fictitious Load 04999' }).getByRole('button', { name: 'Editar', exact: true }).waitFor();
    timings.patient_search_ms = Math.round(performance.now()-start);
    stage = 'agenda full reference loading';
    await page.goto('https://localhost:18444/appointments');
    start = performance.now();
    await page.getByRole('button', { name: 'Nova', exact: true }).click();
    await page.locator('select[name=patient_id] option').filter({ hasText: 'Fictitious Load 04999' }).waitFor({ state: 'attached' });
    const group = page.locator('select[name=patient_id]').locator('..');
    await group.locator('input').fill('Fictitious Load 04999');
    await group.getByRole('button', { name: 'Fictitious Load 04999', exact: true }).click();
    assert.ok(await page.locator('select[name=patient_id]').inputValue());
    timings.agenda_reference_ready_ms = Math.round(performance.now()-start);
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    stage = 'clinical read';
    start = performance.now();
    await page.goto('https://localhost:18444/patients/'+input.patientId+'/clinical-records');
    await page.getByText('Exibindo 1 a 10 de 10 evoluções.', { exact: true }).waitFor();
    await page.getByText('Fictitious load saved evolution', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Editar rascunho', exact: true }).count(), 0);
    timings.clinical_ready_ms = Math.round(performance.now()-start);
    await page.screenshot({ path: path.resolve(__dirname, '../.data/homolog/concurrent-usage.png'), fullPage: true });
    fs.writeFileSync(path.resolve(__dirname, '../.data/homolog/last-concurrent-usage-browser.json'), JSON.stringify({ timings, passed: true }, null, 2));
    console.log('PASS: Chrome patient outside first page found, agenda patient selected, clinical history read with nine background operators; timings saved locally.');
  } finally { await browser.close(); }
})().catch(() => { console.error('Load browser failed at stage: '+stage); process.exitCode = 1; });
