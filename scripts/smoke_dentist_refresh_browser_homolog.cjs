// Private fictitious fixtures only. Never emit credentials, headers or bodies.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
process.on('unhandledRejection', () => { console.error('Dentist refresh browser failed at stage: ' + stage); process.exit(1); });
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
  const account = await api('POST', '/api/users', { name: 'Fictitious Dentist Reader', email: 'dentist-live@example.com', password: credentials.password, role: 'reception' });
  let matrix = (await api('GET', '/api/permissions')).items.find(p => p.role === 'reception');
  matrix.permissions.dentists = { view: true, create: true, update: true, delete: true };
  const saveMatrix = async () => { matrix = await api('PUT', '/api/permissions/reception', { version: matrix.version, permissions: matrix.permissions }); }; await saveMatrix();
  for (const name of ['Fictitious Original', 'Fictitious Draft', 'Fictitious Remote']) await api('POST', '/api/specialties', { name });
  const slots = start => [{ day_of_week: 'monday', start_time: start, end_time: '18:00' }];
  let item = await api('POST', '/api/dentists', { full_name: 'Fictitious Live Dentist', specialty: 'Fictitious Original', availability: slots('08:00') });
  const endpoint = '/api/dentists/' + item.id;
  stage = 'reader login'; const receiver = await login(reader, account.email); assert.notEqual(receiver.session_id, author.session_id);
  let reads = 0, refs = 0, writes = 0;
  reader.on('request', r => { const p = new URL(r.url()).pathname;
   if (r.method() === 'GET' && p === '/api/dentists') reads++;
   if (r.method() === 'GET' && p === '/api/specialties') refs++;
   if (['POST', 'PUT', 'DELETE'].includes(r.method()) && p.startsWith('/api/')) writes++;
  });
  const row = name => reader.getByRole('row').filter({ hasText: name });
  const refresh = () => reader.getByRole('button', { name: 'Atualizar dentistas', exact: true });
  const choose = async (name, value) => { const control = reader.locator('select[name="' + name + '"]').locator('..'); await control.locator('input').fill(value); await control.getByRole('button', { name: value, exact: true }).click(); };
  stage = 'initial'; await reader.goto(origin + '/dentists'); await row(item.full_name).waitFor();
  const search = reader.getByPlaceholder(/Buscar por nome/); await search.fill('Fictitious Live'); await reader.waitForLoadState('networkidle'); const refsBefore = refs;
  stage = 'remote edit with draft'; await row(item.full_name).getByRole('button', { name: 'Editar', exact: true }).click();
  await reader.locator('[name=full_name]').fill('Fictitious retained draft'); await choose('specialty', 'Fictitious Draft');
  await reader.locator('[name="availability.0.start_time"]').fill('10:00'); await reader.getByRole('button', { name: 'Adicionar horario' }).click();
  const oldVersion = item.version, observedAt = Date.now();
  item = await api('PUT', endpoint, { version: item.version, full_name: 'Fictitious Live Remote Dentist', specialty: 'Fictitious Remote', availability: slots('09:00'), active: false });
  await row(item.full_name).waitFor({ timeout: 25000 }); const latency = Date.now() - observedAt;
  await row(item.full_name).getByRole('cell', { name: 'Nao', exact: true }).waitFor(); await row(item.full_name).getByRole('cell', { name: 'Fictitious Remote', exact: true }).waitFor();
  assert.equal(await search.inputValue(), 'Fictitious Live'); assert.equal(await reader.locator('[name=full_name]').inputValue(), 'Fictitious retained draft');
  assert.equal(await reader.locator('[name=specialty]').inputValue(), 'Fictitious Draft'); assert.equal(await reader.locator('[name="availability.0.start_time"]').inputValue(), '10:00');
  stage = 'captured edit conflict'; let response = reader.waitForResponse(r => r.url().endsWith(endpoint) && r.request().method() === 'PUT');
  await reader.getByRole('button', { name: 'Salvar', exact: true }).click(); let rejected = await response;
  assert.equal(rejected.status(), 409); const payload = rejected.request().postDataJSON(); assert.equal(payload.version, oldVersion); assert.equal(payload.specialty, 'Fictitious Draft'); assert.equal(payload.availability.length, 2); assert.equal(payload.availability[0].start_time, '10:00');
  await reader.getByRole('button', { name: 'Descartar rascunho e carregar atual' }).waitFor(); assert.equal(await reader.getByRole('button', { name: 'Salvar', exact: true }).isDisabled(), true);
  await reader.getByRole('button', { name: 'Cancelar', exact: true }).click();
  stage = 'failure and recovery'; const pattern = /\/api\/dentists(?:\?.*)?$/;
  await reader.route(pattern, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"Fictitious unavailable"}' }));
  await refresh().click(); await reader.getByText(/Os dados exibidos podem estar desatualizados/).waitFor(); await row(item.full_name).waitFor();
  for (const dark of [false, true]) { await reader.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
   await reader.screenshot({ path: path.resolve(__dirname, '../.data/homolog/dentist-refresh-' + (dark ? 'dark' : 'light') + '.png'), fullPage: true, animations: 'disabled' }); }
  await search.fill('Fictitious unmatched'); await reader.getByText('Não foi possível carregar dentistas.', { exact: true }).waitFor(); assert.equal(await row(item.full_name).count(), 0);
  assert.equal(await reader.getByText('Nenhum dentista encontrado.').count(), 0); await reader.unroute(pattern); await refresh().click(); await reader.getByText('Nenhum dentista encontrado.').waitFor();
  await search.fill('Fictitious Live'); await row(item.full_name).waitFor();
  stage = 'remote creation/deletion'; const created = await api('POST', '/api/dentists', { full_name: 'Fictitious Live Created Dentist' });
  await row(created.full_name).waitFor({ timeout: 25000 }); await row(created.full_name).getByRole('button', { name: 'Editar', exact: true }).click(); await reader.locator('[name=full_name]').fill('Fictitious deleted draft');
  await api('DELETE', '/api/dentists/' + created.id + '?version=' + created.version); await row(created.full_name).waitFor({ state: 'hidden', timeout: 25000 });
  assert.equal(await reader.locator('[name=full_name]').inputValue(), 'Fictitious deleted draft');
  response = reader.waitForResponse(r => r.url().endsWith('/api/dentists/' + created.id) && r.request().method() === 'PUT');
  await reader.getByRole('button', { name: 'Salvar', exact: true }).click(); assert.equal((await response).status(), 404);
  await reader.getByRole('button', { name: 'Descartar rascunho e carregar atual' }).waitFor(); assert.equal(await reader.getByRole('button', { name: 'Salvar', exact: true }).isDisabled(), true);
  await reader.getByRole('button', { name: 'Cancelar', exact: true }).click();
  stage = 'hidden pause'; await reader.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await reader.waitForLoadState('networkidle'); const before = reads; await reader.waitForTimeout(17000); assert.equal(reads, before);
  await reader.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
  stage = 'read revocation'; await row(item.full_name).getByRole('button', { name: 'Editar', exact: true }).click(); matrix.permissions.dentists.view = false; await saveMatrix();
  await reader.getByText(/Sem permissão para acessar esta página\.|Seu acesso a .* foi encerrado\./).waitFor({ timeout: 25000 }); assert.equal(await reader.locator('[name=full_name]').count(), 0);
  assert.equal(await reader.evaluate(async id => (await fetch('/api/dentists', { headers: { 'X-Session-ID': id } })).status, receiver.session_id), 403);
  stage = 'counts'; assert.equal(refs, refsBefore); assert.equal(writes, 2);
  console.log('PASS: independent sessions; dentist remote edit in ' + latency + 'ms; specialty/schedule/activation/search updated; captured draft/version preserved; real 409/404; create/delete; failure/recovery; hidden pause; revocation/403; specialty references unchanged; two explicit writes only.');
 } finally { await browser.close(); }
})().catch(() => { console.error('Dentist refresh browser failed at stage: ' + stage); process.exitCode = 1; });
