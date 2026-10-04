// Fictitious private schema only; never emit identities, credentials or bodies.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
process.on('unhandledRejection', () => { console.error('Catalog refresh browser failed at stage: ' + stage); process.exit(1); });
(async () => {
 const credentials = JSON.parse(fs.readFileSync(0, 'utf8'));
 const browser = await chromium.launch({ channel: 'chrome', headless: true });
 const origin = 'https://localhost:18444';
 try {
  const context = () => browser.newContext({ timezoneId: 'America/Sao_Paulo', viewport: { width: 1440, height: 1100 } });
  const writer = await (await context()).newPage(), reader = await (await context()).newPage();
  const login = async (page, email) => {
   await page.goto(origin + '/login'); await page.locator('[name=email]').fill(email); await page.locator('[name=password]').fill(credentials.password);
   const response = page.waitForResponse(r => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST');
   await page.getByRole('button', { name: 'Entrar', exact: true }).click(); const identity = await (await response).json();
   await page.getByRole('region', { name: 'Pacientes cadastrados', exact: true }).waitFor(); return identity;
  };
  stage = 'author login'; const author = await login(writer, credentials.email);
  const api = async (method, url, data) => {
   const result = await writer.evaluate(async ({ method, url, data, author }) => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-Session-ID': author.session_id, 'X-CSRF-Token': author.csrf_token }, body: data ? JSON.stringify(data) : undefined });
    return { status: r.status, body: r.status === 204 ? null : await r.json() };
   }, { method, url, data, author });
   assert.ok([200, 201, 204].includes(result.status), 'Fixture request rejected'); return result.body;
  };
  stage = 'fixtures';
  const account = await api('POST', '/api/users', { name: 'Fictitious Catalog Reader', email: 'catalog-live@example.com', password: credentials.password, role: 'reception' });
  let matrix = (await api('GET', '/api/permissions')).items.find(p => p.role === 'reception');
  for (const resource of ['procedures', 'specialties']) matrix.permissions[resource] = { view: true, create: true, update: true, delete: true };
  const saveMatrix = async () => { matrix = await api('PUT', '/api/permissions/reception', { version: matrix.version, permissions: matrix.permissions }); }; await saveMatrix();
  const records = {};
  records.procedures = await api('POST', '/api/procedures', { name: 'Fictitious Live Procedure', duration_minutes: 30, price_cents: 12000 });
  records.specialties = await api('POST', '/api/specialties', { name: 'Fictitious Live Specialty' });
  stage = 'reader login'; const receiver = await login(reader, account.email); assert.notEqual(receiver.session_id, author.session_id);
  stage = 'agenda draft'; let referenceReads = 0;
  writer.on('request', r => { if (r.method() === 'GET' && new URL(r.url()).pathname === '/api/procedures') referenceReads++; });
  await writer.goto(origin + '/appointments'); await writer.getByRole('button', { name: 'Nova', exact: true }).click();
  await writer.locator('[name=start_at]').fill('2030-01-07T10:00'); await writer.getByRole('checkbox').check();
  await writer.waitForFunction(() => document.querySelector('[name=end_at]')?.value === '2030-01-07T10:30');
  await writer.locator('[name=end_at]').fill('2030-01-07T11:15'); const refsBefore = referenceReads;
  const latencies = []; let writes = 0;
  reader.on('request', r => { if (['POST', 'PUT', 'DELETE'].includes(r.method()) && new URL(r.url()).pathname.startsWith('/api/')) writes++; });
  for (const [resource, subject] of [['procedures', 'procedimentos'], ['specialties', 'especialidades']]) {
   let item = records[resource]; const endpoint = '/api/' + resource + '/' + item.id;
   stage = resource + ' initial'; await reader.goto(origin + '/' + resource);
   const row = name => reader.getByRole('row').filter({ hasText: name }); const refresh = () => reader.getByRole('button', { name: 'Atualizar ' + subject, exact: true });
   const search = reader.getByPlaceholder(/Buscar por nome/); await row(item.name).waitFor(); await search.fill('Fictitious Live'); await reader.waitForLoadState('networkidle');
   let reads = 0; const countRead = r => { if (r.method() === 'GET' && new URL(r.url()).pathname === '/api/' + resource) reads++; }; reader.on('request', countRead);
   stage = resource + ' remote edit with draft'; await row(item.name).getByRole('button', { name: 'Editar', exact: true }).click();
   await reader.locator('[name=name]').fill('Fictitious draft');
   if (resource === 'procedures') { await reader.locator('[name=duration_minutes]').fill('45'); await reader.locator('[name=price]').fill('321,09'); }
   const oldVersion = item.version, observedAt = Date.now();
   item = await api('PUT', endpoint, { version: item.version, name: 'Fictitious Live Remote ' + resource, active: false,
    ...(resource === 'procedures' ? { duration_minutes: 90, price_cents: 45678 } : {}) });
   await row(item.name).waitFor({ timeout: 25000 }); latencies.push(Date.now() - observedAt);
   await row(item.name).getByRole('cell', { name: 'Nao', exact: true }).waitFor(); assert.equal(await reader.locator('[name=name]').inputValue(), 'Fictitious draft');
   assert.equal(await search.inputValue(), 'Fictitious Live');
   stage = resource + ' captured edit conflict'; let response = reader.waitForResponse(r => r.url().endsWith(endpoint) && r.request().method() === 'PUT');
   await reader.getByRole('button', { name: 'Salvar', exact: true }).click(); let rejected = await response;
   assert.equal(rejected.status(), 409); assert.equal(rejected.request().postDataJSON().version, oldVersion);
   if (resource === 'procedures') { assert.equal(rejected.request().postDataJSON().duration_minutes, 45); assert.equal(rejected.request().postDataJSON().price_cents, 32109); }
   await reader.getByRole('button', { name: 'Descartar rascunho e carregar atual' }).waitFor(); assert.equal(await reader.getByRole('button', { name: 'Salvar', exact: true }).isDisabled(), true);
   await reader.getByRole('button', { name: 'Cancelar', exact: true }).click();
   stage = resource + ' failure and recovery'; const pattern = new RegExp('/api/' + resource + '(?:\\?.*)?$');
   await reader.route(pattern, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"Fictitious unavailable"}' }));
   await refresh().click(); await reader.getByText(/Os dados exibidos podem estar desatualizados/).waitFor(); await row(item.name).waitFor();
   for (const dark of [false, true]) { await reader.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
    await reader.screenshot({ path: path.resolve(__dirname, '../.data/homolog/catalog-refresh-' + resource + '-' + (dark ? 'dark' : 'light') + '.png'), fullPage: true, animations: 'disabled' }); }
   await search.fill('Fictitious unmatched'); await reader.getByText('Não foi possível carregar ' + subject + '.', { exact: true }).waitFor(); assert.equal(await row(item.name).count(), 0);
   assert.equal(await reader.getByText(/Nenhum.*encontrad/).count(), 0); await reader.unroute(pattern); await refresh().click(); await reader.getByText(/Nenhum.*encontrad/).waitFor();
   await search.fill('Fictitious Live'); await row(item.name).waitFor();
   stage = resource + ' remote creation/deletion'; const created = await api('POST', '/api/' + resource, { name: 'Fictitious Live Created ' + resource });
   await row(created.name).waitFor({ timeout: 25000 }); await row(created.name).getByRole('button', { name: 'Editar', exact: true }).click(); await reader.locator('[name=name]').fill('Fictitious deleted draft');
   await api('DELETE', '/api/' + resource + '/' + created.id + '?version=' + created.version); await row(created.name).waitFor({ state: 'hidden', timeout: 25000 });
   assert.equal(await reader.locator('[name=name]').inputValue(), 'Fictitious deleted draft');
   response = reader.waitForResponse(r => r.url().endsWith('/api/' + resource + '/' + created.id) && r.request().method() === 'PUT');
   await reader.getByRole('button', { name: 'Salvar', exact: true }).click(); assert.equal((await response).status(), 404);
   await reader.getByRole('button', { name: 'Descartar rascunho e carregar atual' }).waitFor(); assert.equal(await reader.getByRole('button', { name: 'Salvar', exact: true }).isDisabled(), true);
   await reader.getByRole('button', { name: 'Cancelar', exact: true }).click();
   stage = resource + ' hidden pause'; await reader.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
   await reader.waitForLoadState('networkidle'); const before = reads; await reader.waitForTimeout(17000); assert.equal(reads, before);
   await reader.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
   stage = resource + ' read revocation'; await row(item.name).getByRole('button', { name: 'Editar', exact: true }).click(); matrix.permissions[resource].view = false; await saveMatrix();
   await reader.getByText(/Sem permissão para acessar esta página\.|Seu acesso a .* foi encerrado\./).waitFor({ timeout: 25000 }); assert.equal(await reader.locator('[name=name]').count(), 0);
   assert.equal(await reader.evaluate(async ({ resource, id }) => (await fetch('/api/' + resource, { headers: { 'X-Session-ID': id } })).status, { resource, id: receiver.session_id }), 403);
   reader.off('request', countRead);
  }
  stage = 'agenda remains captured'; assert.equal(await writer.locator('[name=end_at]').inputValue(), '2030-01-07T11:15');
  assert.equal(await writer.getByRole('checkbox').isChecked(), true); await writer.getByText(records.procedures.name, { exact: false }).waitFor();
  assert.equal(referenceReads, refsBefore); assert.equal(writes, 4);
  console.log('PASS: independent sessions; procedure/specialty remote edit in ' + latencies.join('/') + 'ms; activation/search/drafts/versions preserved; real 409/404; create/delete; failures/recovery; hidden pause; revocations/403; agenda selection/end/references unchanged; four explicit writes only.');
 } finally { await browser.close(); }
})().catch(() => { console.error('Catalog refresh browser failed at stage: ' + stage); process.exitCode = 1; });
