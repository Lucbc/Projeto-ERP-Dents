const fs = require('node:fs'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
(async () => {
 const input = JSON.parse(fs.readFileSync(0, 'utf8'));
 const browser = await chromium.launch({ channel: 'chrome', headless: true });
 try {
  const admin = await browser.newPage(), page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const login = async (tab, email) => {
   await tab.goto('https://localhost:18444/login');
   await tab.locator('[name=email]').fill(email); await tab.locator('[name=password]').fill(input.password);
   const response = tab.waitForResponse(r => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST');
   await tab.getByRole('button', { name: 'Entrar', exact: true }).click();
   const identity = await (await response).json();
   await tab.getByRole('region', { name: 'Pacientes cadastrados', exact: true }).waitFor();
   return identity;
  };
  stage = 'login'; const identity = await login(admin, input.email); await login(page, input.readerEmail);
  const api = async (method, path, data) => admin.evaluate(async ({ method, path, data, identity }) => {
   const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json',
    'X-Session-ID': identity.session_id, 'X-CSRF-Token': identity.csrf_token }, body: data ? JSON.stringify(data) : undefined });
   return { status: r.status, body: r.status === 204 ? null : await r.json() };
  }, { method, path, data, identity });
  let readerWrites = 0;
  page.on('request', r => { if (r.url().includes('/api/financial') && r.method() !== 'GET') readerWrites++; });
  stage = 'first and second page'; await page.getByRole('link', { name: 'Financeiro', exact: true }).click();
  const list = page.getByRole('region', { name: 'Lançamentos financeiros', exact: true });
  await list.getByText('Página 1 de 2', { exact: true }).waitFor();
  assert.equal(await list.locator('tbody tr').count(), 200);
  await list.getByRole('button', { name: 'Próxima página', exact: true }).click();
  await list.getByText('Página 2 de 2', { exact: true }).waitFor();
  assert.equal(await list.locator('tbody tr').count(), 5);
  for (const row of input.lastRows) await list.getByRole('cell', { name: row.description, exact: true }).waitFor();
  assert.equal(await list.getByRole('button', { name: 'Editar', exact: true }).count(), 0);
  await page.screenshot({ path: '.data/financial-pagination-page-two.png', fullPage: true });
  stage = 'failure and recovery';
  await page.route('**/api/financial?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"Fictitious unavailable"}' }));
  await list.getByRole('button', { name: 'Atualizar lançamentos financeiros', exact: true }).click();
  await list.getByText(/Não foi possível atualizar lançamentos financeiros/).waitFor();
  assert.equal(await list.locator('tbody tr').count(), 5);
  await page.unroute('**/api/financial?**');
  await list.getByRole('button', { name: 'Atualizar lançamentos financeiros', exact: true }).click();
  await list.getByText('Atualização automática ativa.', { exact: true }).waitFor();
  stage = 'filter reset';
  await list.getByPlaceholder('Buscar por descricao, paciente ou dentista').fill(input.lastRows[0].description);
  await list.getByText('Página 1 de 1', { exact: true }).waitFor();
  assert.equal(await list.locator('tbody tr').count(), 1);
  await list.getByRole('button', { name: 'Limpar filtros', exact: true }).click();
  await list.getByText('Página 1 de 2', { exact: true }).waitFor();
  await list.getByRole('button', { name: 'Próxima página', exact: true }).click();
  await list.getByText('Página 2 de 2', { exact: true }).waitFor();
  stage = 'remote deletion clamps page';
  for (const row of input.lastRows) assert.equal((await api('DELETE', '/api/financial/' + row.id + '?version=' + row.version)).status, 204);
  await list.getByRole('button', { name: 'Atualizar lançamentos financeiros', exact: true }).click();
  await list.getByText('Página 1 de 1', { exact: true }).waitFor();
  assert.equal(await list.locator('tbody tr').count(), 200);
  stage = 'permission revocation';
  const grants = await api('GET', '/api/permissions'); assert.equal(grants.status, 200);
  const grant = grants.body.items.find(p => p.role === 'reception'); grant.permissions.financial.view = false;
  assert.equal((await api('PUT', '/api/permissions/reception', grant)).status, 200);
  const refresh = list.getByRole('button', { name: 'Atualizar lançamentos financeiros', exact: true });
  if (await refresh.isVisible()) await refresh.click();
  await list.waitFor({ state: 'hidden' }); assert.equal(readerWrites, 0);
  console.log('PASS: Chrome financial 200+5 pagination, read-only profile, filters, failure/recovery, remote deletion and revocation; zero reader writes.');
 } finally { await browser.close(); }
})().catch(() => { console.error('Financial history browser failed at stage: ' + stage); process.exit(1); });
