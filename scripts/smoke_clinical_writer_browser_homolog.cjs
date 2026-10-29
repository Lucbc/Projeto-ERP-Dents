const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
(async () => {
 const input = JSON.parse(fs.readFileSync(0, 'utf8'));
 const browser = await chromium.launch({ channel: 'chrome', headless: true });
 let diagnosticPage;
 try {
  const context = await browser.newContext({ ignoreHTTPSErrors: false, viewport: { width: 1440, height: 1000 } });
  const adminContext = await browser.newContext({ ignoreHTTPSErrors: false });
  const readerContext = await browser.newContext({ ignoreHTTPSErrors: false });
  const first = await context.newPage(), second = await context.newPage(), admin = await adminContext.newPage(), reader = await readerContext.newPage();
  diagnosticPage = first;
  const diagnostics = [];
  first.on('response', response => {
   if (response.url().includes('/api/clinical-records')) diagnostics.push({ method: response.request().method(), status: response.status() });
  });
  first.on('requestfailed', request => {
   if (request.url().includes('/api/clinical-records')) diagnostics.push({ method: request.method(), failed: true });
  });
  first.on('close', () => fs.writeFileSync(path.resolve(__dirname, '../.data/homolog/clinical-writer-network.json'), JSON.stringify(diagnostics)));
  async function login(page, email) {
   await page.goto('https://localhost:18444/login');
   await page.locator('[name=email]').fill(email); await page.locator('[name=password]').fill(input.password);
   const pending = page.waitForResponse(r => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST');
   await page.getByRole('button', { name: 'Entrar', exact: true }).click();
   const body = await (await pending).json(); await page.getByText('Pacientes cadastrados', { exact: true }).waitFor();
   return { 'Content-Type': 'application/json', 'X-Session-ID': body.session_id, 'X-CSRF-Token': body.csrf_token };
  }
  stage = 'login'; const headers = await login(admin, input.email); await login(first, input.authorEmail); await login(reader, input.readerEmail);
  const api = (method, url, data) => admin.evaluate(async ({ method, url, data, headers }) => {
   const response = await fetch(url, { method, headers, body: data ? JSON.stringify(data) : undefined });
   return { status: response.status, body: await response.json() };
  }, { method, url, data, headers });
  const location = 'https://localhost:18444/patients/' + input.patientId + '/clinical-records';
  const open = async (page, visit) => {
   await page.goto(location); await page.getByRole('combobox', { name: /Consulta vinculada/ }).selectOption(visit);
   await page.getByRole('button', { name: 'Abrir atendimento da consulta', exact: true }).click();
   await page.getByRole('textbox', { name: /^Evolução clínica/ }).waitFor();
   await page.waitForFunction(() => !document.querySelector('textarea')?.disabled);
  };
  const confirmed = page => page.getByText('Operação confirmada e versão atual conferida.', { exact: true }).waitFor();
  stage = 'lost create response';
  let createPayload, creates = 0;
  await first.route('**/api/clinical-records/from-appointment/' + input.visitId, async route => {
   if (route.request().method() !== 'POST') return route.continue();
   creates++;
   if (creates === 1) { createPayload = route.request().postDataJSON(); assert.equal((await route.fetch()).status(), 201); return route.abort('failed'); }
   assert.deepEqual(route.request().postDataJSON(), createPayload); return route.continue();
  });
  stage = 'lost create opening'; await open(first, input.visitId);
  stage = 'lost create fill'; await first.getByRole('textbox', { name: /^Evolução clínica/ }).fill('Fictitious initial text');
  stage = 'lost create saving';
  await first.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
  await first.getByRole('button', { name: 'Recuperar tentativa', exact: true }).waitFor();
  stage = 'lost create recovering';
  assert.equal(await first.getByRole('textbox', { name: /^Evolução clínica/ }).isDisabled(), true);
  await first.getByRole('button', { name: 'Recuperar tentativa', exact: true }).click(); await confirmed(first); assert.equal(creates, 2);
  stage = 'save and reopen';
  await first.getByRole('textbox', { name: /^Evolução clínica/ }).fill('Fictitious saved text');
  assert.equal(await first.getByRole('button', { name: 'Finalizar evolução', exact: true }).isDisabled(), true);
  await first.getByRole('button', { name: 'Salvar rascunho', exact: true }).click(); await confirmed(first);
  await open(second, input.visitId); assert.equal(await second.getByRole('textbox', { name: /^Evolução clínica/ }).inputValue(), 'Fictitious saved text');
  stage = 'two tab conflict';
  await first.getByRole('textbox', { name: /^Evolução clínica/ }).fill('Fictitious winning text');
  await first.getByRole('button', { name: 'Salvar rascunho', exact: true }).click(); await confirmed(first);
  await second.getByRole('textbox', { name: /^Evolução clínica/ }).fill('Fictitious losing local text');
  await second.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
  const reload = second.getByRole('button', { name: 'Descartar texto local e carregar versão atual', exact: true }); await reload.waitFor();
  assert.equal(await second.getByRole('textbox', { name: /^Evolução clínica/ }).inputValue(), 'Fictitious losing local text');
  await reload.click(); await second.getByText('Versão atual carregada. Revise antes de salvar.', { exact: true }).waitFor();
  assert.equal(await second.getByRole('textbox', { name: /^Evolução clínica/ }).inputValue(), 'Fictitious winning text');
  stage = 'finalization';
  await first.getByRole('button', { name: 'Finalizar evolução', exact: true }).click();
  await first.getByRole('button', { name: 'Confirmar finalização', exact: true }).click(); await first.getByRole('textbox', { name: /^Texto do adendo/ }).waitFor();
  stage = 'lost addendum response';
  let addendumPayload, additions = 0;
  await first.route('**/api/clinical-records/*/addenda', async route => {
   additions++;
   if (additions === 1) { addendumPayload = route.request().postDataJSON(); assert.equal((await route.fetch()).status(), 200); return route.abort('failed'); }
   assert.deepEqual(route.request().postDataJSON(), addendumPayload); return route.continue();
  });
  await first.getByRole('textbox', { name: /^Texto do adendo/ }).fill('Fictitious recovered correction');
  await first.getByRole('textbox', { name: /^Motivo do adendo/ }).fill('Fictitious correction reason');
  await first.getByRole('button', { name: 'Registrar adendo', exact: true }).click();
  await first.getByRole('button', { name: 'Recuperar tentativa', exact: true }).click(); await confirmed(first); assert.equal(additions, 2);
  await first.getByText('Fictitious recovered correction', { exact: true }).waitFor();
  await first.screenshot({ path: path.resolve(__dirname, '../.data/homolog/clinical-writer-final.png'), fullPage: true });
  stage = 'independent read-only role'; await reader.goto(location);
  await reader.getByText('Fictitious winning text', { exact: true }).waitFor(); await reader.getByText('Fictitious recovered correction', { exact: true }).waitFor();
  assert.equal(await reader.getByRole('button', { name: /Editar rascunho|Adicionar adendo|Salvar rascunho/ }).count(), 0);
  stage = 'stale appointment binding';
  await first.getByRole('button', { name: 'Fechar atendimento', exact: true }).click();
  await first.getByRole('combobox', { name: /Consulta vinculada/ }).selectOption(input.raceVisitId);
  await first.getByRole('button', { name: 'Abrir atendimento da consulta', exact: true }).click();
  await first.getByRole('textbox', { name: /^Evolução clínica/ }).fill('Fictitious must not migrate');
  assert.equal((await api('PUT', '/api/appointments/' + input.raceVisitId, { version: 1, patient_id: input.otherPatientId })).status, 200);
  await first.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
  await first.getByRole('button', { name: 'Descartar texto local e carregar versão atual', exact: true }).click();
  await first.getByText('A consulta mudou de paciente ou dentista. Feche este atendimento e confira a agenda.', { exact: true }).waitFor();
  assert.equal(await first.getByRole('textbox', { name: /^Evolução clínica/ }).inputValue(), 'Fictitious must not migrate');
  first.once('dialog', dialog => dialog.accept()); await first.getByRole('button', { name: 'Fechar atendimento', exact: true }).click();
  stage = 'write and read revocation with dirty text';
  await first.getByRole('button', { name: 'Adicionar adendo', exact: true }).click();
  await first.getByRole('textbox', { name: /^Texto do adendo/ }).fill('Fictitious unsaved revoked text');
  async function grants(view, update) {
   const response = await api('GET', '/api/permissions'); const row = response.body.items.find(item => item.role === 'dentist');
   row.permissions.clinical_records = { view, create: view, update, delete: false };
   assert.equal((await api('PUT', '/api/permissions/dentist', row)).status, 200);
   await first.evaluate(() => window.dispatchEvent(new Event('focus')));
  }
  await grants(true, false); await first.getByText(/Suas permissões de alteração mudaram/).waitFor();
  assert.equal(await first.getByRole('textbox', { name: /^Texto do adendo/ }).inputValue(), 'Fictitious unsaved revoked text');
  assert.equal(await first.getByRole('textbox', { name: /^Texto do adendo/ }).isDisabled(), true);
  await grants(true, true); await first.getByRole('button', { name: 'Revisar e retomar ações', exact: true }).click();
  assert.equal(await first.getByRole('textbox', { name: /^Texto do adendo/ }).inputValue(), 'Fictitious unsaved revoked text');
  await grants(false, false); await first.getByText(/Sem permissão para acessar esta página|Seu acesso ao prontuário foi encerrado/).first().waitFor();
  assert.equal(await first.getByRole('textbox').count(), 0);
  console.log('PASS: Chrome draft/create replay/save/reopen, two-tab conflict, finalization, addendum replay, independent reader, stale appointment binding and permission revocation preserve clinical data.');
 } catch (error) {
  if (diagnosticPage) await diagnosticPage.screenshot({ path: path.resolve(__dirname, '../.data/homolog/clinical-writer-failure.png'), fullPage: true }).catch(() => {});
  throw error;
 } finally { await browser.close(); }
})().catch(error => { console.error('Clinical writer browser failed at stage: ' + stage + ' (' + error.name + ')'); process.exitCode = 1; });
