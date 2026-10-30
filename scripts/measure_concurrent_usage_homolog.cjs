// One real Chrome operator while nine HTTP operators remain active.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
(async () => {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const timings = {};
  let page;
  try {
    page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/Sao_Paulo' })).newPage();
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
    await page.getByPlaceholder(/Buscar por nome/).fill('Fictitious Load 00001');
    await page.getByRole('row').filter({ hasText: 'Fictitious Load 00001' }).getByRole('button', { name: 'Editar', exact: true }).waitFor();
    timings.patient_search_ms = Math.round(performance.now()-start);
    stage = 'agenda full reference loading';
    await page.goto('https://localhost:18444/appointments');
    start = performance.now();
    await page.getByRole('button', { name: 'Nova', exact: true }).click();
    if (input.boundedPatients) await page.getByRole('textbox', { name: 'Buscar paciente', exact: true }).fill('Fictitious Load 00001');
    await page.locator('select[name=patient_id] option').filter({ hasText: 'Fictitious Load 00001' }).waitFor({ state: 'attached' });
    const group = page.locator('select[name=patient_id]').locator('..');
    if (input.boundedPatients) {
      await page.locator('select[name=patient_id]').focus();
      await page.locator('select[name=patient_id]').press('ArrowDown');
      await page.locator('select[name=patient_id]').press('Tab');
    } else {
      await group.locator('input').fill('Fictitious Load 00001');
      await group.getByRole('button', { name: 'Fictitious Load 00001', exact: true }).click();
    }
    assert.ok(await page.locator('select[name=patient_id]').inputValue());
    timings.agenda_reference_ready_ms = Math.round(performance.now()-start);
    if (input.boundedPatients) {
      const prepared = () => page.getByText('Cadastros preparados para esta consulta. Atualizar as opções mantém os horários preenchidos.', { exact: true }).waitFor();
      await prepared();
      await page.screenshot({ path: path.resolve(__dirname, '../.data/homolog/patient-picker.png'), fullPage: false });
      const chosen = await page.locator('select[name=patient_id]').inputValue();
      const monday = await page.evaluate(() => {
        const d = new Date(); d.setDate(d.getDate()-((d.getDay()+6)%7));
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      });
      stage = 'create with patient beyond first page';
      await page.locator('select[name=dentist_id]').selectOption({ label: 'Fictitious Load Dentist' });
      await page.locator('[name=start_at]').fill(monday+'T17:00');
      await page.locator('[name=end_at]').fill(monday+'T18:00');
      const created = page.waitForResponse(r => r.url().endsWith('/api/appointments') && r.request().method()==='POST');
      await page.getByRole('button', { name: 'Salvar', exact: true }).click();
      const response = await created; assert.equal(response.status(),201);
      const appointment = await response.json(); assert.equal(appointment.patient_id,chosen);
      stage = 'calendar edit retains patient beyond first page';
      await page.goto('https://localhost:18444/calendar');
      await page.locator('.rbc-event').filter({ hasText: 'Fictitious Load 00001' }).click();
      stage = 'calendar selected patient ready';
      await prepared(); assert.equal(await page.locator('[name=patient_id]').inputValue(),chosen);
      await page.locator('[name=notes]').fill('Fictitious verified picker edit');
      stage = 'calendar search preserves selection';
      await page.getByRole('textbox', { name: 'Buscar paciente', exact: true }).fill('Fictitious Load 00002');
      await page.locator('select[name=patient_id] option').filter({ hasText: 'Fictitious Load 00002' }).waitFor({ state: 'attached' });
      assert.equal(await page.locator('[name=patient_id]').inputValue(),chosen);
      stage = 'calendar save after search';
      const saved = page.waitForResponse(r => r.url().endsWith('/api/appointments/'+appointment.id) && r.request().method()==='PUT');
      await page.getByRole('button', { name: 'Salvar', exact: true }).click();
      const edited = await saved; assert.equal(edited.status(),200);
      const body = await edited.json(); assert.equal(body.patient_id,chosen); assert.equal(body.version,2);
      assert.equal(body.notes,'Fictitious verified picker edit');
      stage = 'server patient filter';
      await page.goto('https://localhost:18444/appointments');
      await page.getByRole('textbox', { name: 'Buscar paciente do filtro', exact: true }).fill('Fictitious Load 00001');
      const filter = page.getByRole('combobox', { name: 'Paciente do filtro', exact: true });
      await filter.locator('option').filter({ hasText: 'Fictitious Load 00001' }).waitFor({ state: 'attached' });
      const filtered = page.waitForResponse(r => new URL(r.url()).pathname==='/api/appointments' && new URL(r.url()).searchParams.get('patient_id')===chosen);
      await filter.selectOption(chosen);
      assert.equal((await filtered).status(),200);
      await page.getByRole('row').filter({ hasText: 'Fictitious Load 00001' }).waitFor();
    } else await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
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
  } catch (error) {
    if (page) await page.screenshot({ path: path.resolve(__dirname, '../.data/homolog/patient-picker-failure.png'), fullPage: false }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
})().catch(() => { console.error('Load browser failed at stage: '+stage); process.exitCode = 1; });
