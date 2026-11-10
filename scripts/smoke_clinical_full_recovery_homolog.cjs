const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
 const input = JSON.parse(fs.readFileSync(0, 'utf8'));
 const browser = await chromium.launch({ channel: 'chrome', headless: true });
 try {
  const page = await browser.newPage({ ignoreHTTPSErrors: false, viewport: { width: 1440, height: 1000 } });
  await page.goto('https://localhost:18444/login');
  await page.locator('[name=email]').fill(input.email); await page.locator('[name=password]').fill(input.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.getByText('Pacientes cadastrados', { exact: true }).waitFor();
  await page.goto('https://localhost:18444/patients/' + input.patientId + '/clinical-records');
  await page.getByText('Fictitious recovered addendum', { exact: true }).waitFor();
  assert.equal(await page.getByText('Fictitious recovered draft', { exact: true }).count(), 2);
  await page.getByText('Fictitious recovered allergy', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Editar rascunho', exact: true }).click();
  await page.getByRole('textbox', { name: /^Evolução clínica/ }).fill('Fictitious browser restored edit');
  await page.getByRole('button', { name: 'Salvar rascunho', exact: true }).click();
  await page.getByText('Operação confirmada e versão atual conferida.', { exact: true }).waitFor();
  await page.screenshot({ path: path.resolve(__dirname, '../.data/homolog/clinical-full-recovery.png'), fullPage: true });
  const adminPage = await browser.newPage({ ignoreHTTPSErrors: false, viewport: { width: 1440, height: 1000 } });
  await adminPage.goto('https://localhost:18444/login');
  await adminPage.locator('[name=email]').fill(input.adminEmail);
  await adminPage.locator('[name=password]').fill(input.password);
  await adminPage.getByRole('button', { name: 'Entrar', exact: true }).click();
  await adminPage.getByText('Pacientes cadastrados', { exact: true }).waitFor();
  await adminPage.getByRole('link', { name: 'Histórico de pacientes', exact: true }).click();
  await adminPage.getByText('Salvamento sem alteração de campos.', { exact: true }).waitFor();
  assert.equal(await adminPage.getByRole('article').count(), 2);
  assert.equal(await adminPage.getByText('Paciente (ID): ' + input.patientId, { exact: true }).count(), 2);
  await adminPage.getByText('Campos: Observações', { exact: true }).waitFor();
  await adminPage.screenshot({ path: path.resolve(__dirname, '../.data/homolog/patient-audit-full-recovery.png'), fullPage: true });
 } finally { await browser.close(); }
})().catch(() => { console.error('Clinical restored browser failed; raw diagnostics withheld.'); process.exitCode = 1; });
