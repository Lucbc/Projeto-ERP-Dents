// Initial setup diagnosis: fictional credentials arrive only on stdin.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
(async () => {
  const credentials = JSON.parse(fs.readFileSync(0, 'utf8'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const context = await browser.newContext(), page = await context.newPage();
    await page.goto('https://localhost:18444/login');
    const form = page.getByRole('form', { name: 'Configuração inicial' });
    await form.waitFor();
    await form.getByLabel('Código de ativação').fill(credentials.activationCode);
    await form.getByLabel('Nome', { exact: true }).fill('Fictitious Initial Admin');
    await form.getByLabel('E-mail', { exact: true }).fill(credentials.email);
    await form.getByLabel('Senha', { exact: true }).fill(credentials.password);
    await form.getByLabel('Confirmar senha').fill(credentials.password);
    let creations = 0, logins = 0, serverCreated = false;
    page.on('request', request => {
      if (request.method() !== 'POST') return;
      if (request.url().endsWith('/api/auth/bootstrap-admin')) creations++;
      if (request.url().endsWith('/api/auth/login')) logins++;
    });
    if (credentials.failStatus) await page.route('**/api/auth/needs-bootstrap', route => route.abort('failed'));
    if (!credentials.normalCreation) await page.route('**/api/auth/bootstrap-admin', async route => {
      const response = await route.fetch({ maxRetries: 0 });
      serverCreated = response.status() === 200;
      await route.abort('failed');
    });
    stage = 'committed setup response lost';
    await form.getByRole('button', { name: 'Criar administrador', exact: true }).click();
    if (credentials.normalCreation) {
      stage = 'confirmed creation automatically logs in';
      await page.getByRole('region', { name: 'Pacientes cadastrados', exact: true }).waitFor();
      assert.equal(creations, 1);
      assert.equal(logins, 1);
      assert.equal(await page.evaluate(values => [localStorage, sessionStorage].some(storage =>
        Object.values(storage).some(value => values.some(secret => String(value).includes(secret)))),
        [credentials.password, credentials.activationCode]), false);
      console.log('PASS: confirmed initial creation keeps automatic login; no stored secrets.');
      return;
    }
    await page.getByText(/Não foi possível conectar ao servidor/).waitFor();
    assert.equal(serverCreated, true);
    assert.equal(creations, 1);
    assert.equal(logins, 0);
    await page.unroute('**/api/auth/bootstrap-admin');
    if (credentials.acceptance) {
      stage = 'explicit setup confirmation';
      await page.getByRole('button', { name: 'Conferir configuração', exact: true }).waitFor();
      assert.equal(await form.getByRole('button', { name: 'Criar administrador', exact: true }).isEnabled(), false);
      if (credentials.failStatus) {
        await Promise.all([
          page.waitForEvent('requestfailed', request => request.url().endsWith('/api/auth/needs-bootstrap')),
          page.getByRole('button', { name: 'Conferir configuração', exact: true }).click(),
        ]);
        await page.getByRole('button', { name: 'Conferir configuração', exact: true }).waitFor();
        assert.equal(await form.getByRole('button', { name: 'Criar administrador', exact: true }).isEnabled(), false);
        await page.unroute('**/api/auth/needs-bootstrap');
      }
      await page.getByRole('button', { name: 'Conferir configuração', exact: true }).click();
      await page.getByText(/Se outra pessoa fez a configuração/).waitFor();
      assert.equal(creations, 1);
      assert.equal(logins, 0);
    } else if (credentials.failStatus) {
      stage = 'status unavailable and explicit repeated creation';
      await page.getByText('Não foi possível consultar a configuração do servidor.').waitFor();
      assert.equal(await form.isVisible(), true);
      const repeated = page.waitForResponse(response => response.url().endsWith('/api/auth/bootstrap-admin'));
      await form.getByRole('button', { name: 'Criar administrador', exact: true }).click();
      assert.equal((await repeated).status(), 409);
      assert.equal(creations, 2);
      assert.equal(logins, 0);
      stage = 'reload after status failure';
      await page.unroute('**/api/auth/needs-bootstrap');
      await page.reload();
    }
    stage = 'setup closes and explicit login recovers access';
    await form.waitFor({ state: 'hidden' });
    assert.equal(logins, 0);
    await page.locator('[name=email]').fill(credentials.email);
    await page.locator('[name=password]').fill(credentials.password);
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.getByRole('region', { name: 'Pacientes cadastrados', exact: true }).waitFor();
    assert.equal(logins, 1);
    assert.equal(await page.evaluate(values => [localStorage, sessionStorage].some(storage =>
      Object.values(storage).some(value => values.some(secret => String(value).includes(secret)))),
      [credentials.password, credentials.activationCode]), false);
    console.log(credentials.acceptance ? 'PASS: unknown setup blocks creation; explicit read-only confirmation closes setup; manual login succeeds; no stored secrets.' : credentials.failStatus
      ? 'DIAGNOSIS: status failure retains setup form; explicit repeat receives 409; status refresh closes setup; explicit login succeeds.'
      : 'DIAGNOSIS: response lost after creation; status refresh closes setup without automatic login; explicit login succeeds.');
  } finally { await browser.close(); }
})().catch(() => { console.error('Registration pilot failed at stage: ' + stage); process.exit(1); });
