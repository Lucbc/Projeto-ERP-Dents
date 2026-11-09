const fs = require('node:fs'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
(async () => {
  const credentials = JSON.parse(fs.readFileSync(0, 'utf8'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await (await browser.newContext()).newPage();
    stage = 'login';
    await page.goto('https://localhost:18444/login');
    await page.locator('[name=email]').fill(credentials.email);
    await page.locator('[name=password]').fill(credentials.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByRole('region', { name: 'Pacientes cadastrados', exact: true }).waitFor();
    await page.goto('https://localhost:18444/permissions');
    await page.getByRole('button', { name: /Recepcao/ }).click();
    const box = action => page.getByRole('checkbox', { name: `Recepcao: Histórico de edição de pacientes (somente leitura) — ${action}`, exact: true });
    stage = 'read-only controls';
    assert.equal(await box('Ver').isChecked(), false);
    for (const action of ['Criar', 'Editar', 'Excluir']) assert.equal(await box(action).isDisabled(), true);
    const save = async expected => {
      const response = page.waitForResponse(r => r.url().endsWith('/api/permissions/reception') && r.request().method() === 'PUT');
      await page.getByRole('button', { name: 'Salvar Permissões', exact: true }).click();
      const result = await response;
      assert.equal(result.status(), 200);
      assert.deepEqual((await result.json()).permissions.patient_audit,
        { view: expected, create: false, update: false, delete: false });
      await page.getByRole('button', { name: 'Salvar Permissões', exact: true }).waitFor();
      // Reload makes the next edit depend on the persisted response/version.
      await page.reload();
      await page.getByRole('button', { name: /Recepcao/ }).click();
      assert.equal(await box('Ver').isChecked(), expected);
    };
    stage = 'grant'; await box('Ver').check(); await save(true);
    stage = 'unrelated permission preservation';
    const patient = page.getByRole('checkbox', { name: 'Recepcao: Pacientes — Excluir', exact: true });
    await patient.setChecked(!(await patient.isChecked())); await save(true);
    stage = 'revoke'; await box('Ver').uncheck(); await save(false);
    console.log('PASS: Chrome read-only audit controls, grant, unrelated edit preservation, reload and revocation.');
  } finally { await browser.close(); }
})().catch(() => { console.error('Permissions browser failed at stage: ' + stage); process.exit(1); });
