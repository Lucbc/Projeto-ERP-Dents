// Fictitious private schema only. Never print identities, credentials or bodies.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict'), { randomUUID } = require('node:crypto');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
process.on('unhandledRejection', () => { console.error('Financial history refresh browser failed at stage: ' + stage); process.exit(1); });
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
  const account = await api('POST', '/api/users', { name: 'Fictitious History Reader', email: 'history-reader@example.com', password: credentials.password, role: 'reception' });
  let matrix = (await api('GET', '/api/permissions')).items.find(p => p.role === 'reception');
  for (const name of ['financial', 'financial_reversals', 'patients', 'dentists', 'appointments', 'dashboard']) matrix.permissions[name] = { view: true, create: true, update: true, delete: true };
  const saveMatrix = async () => { matrix = await api('PUT', '/api/permissions/reception', { version: matrix.version, permissions: matrix.permissions }); };
  await saveMatrix();
  const payload = { entry_type: 'income', description: 'Fictitious History Live', amount_cents: 12000, due_date: new Date().toISOString().slice(0, 10) };
  let entry = await api('POST', '/api/financial', payload); const endpoint = '/api/financial/' + entry.id;
  stage = 'reader login'; const receiver = await login(reader, account.email); assert.notEqual(receiver.session_id, author.session_id);
  await reader.goto(origin + '/financial');
  const row = name => reader.getByRole('region', { name: 'Lançamentos financeiros', exact: true }).getByRole('row').filter({ hasText: name });
  const dialog = () => reader.getByRole('heading', { name: /^(Confirmar baixa|Pagamentos e estornos)$/ }).locator('../..');
  const refresh = () => dialog().getByRole('button', { name: 'Atualizar histórico de pagamentos', exact: true });
  let reads = 0, writes = 0;
  reader.on('request', r => { const url = new URL(r.url()); if (r.method() === 'GET' && url.pathname === endpoint + '/payments') reads++;
   if (['POST', 'PUT', 'DELETE'].includes(r.method()) && url.pathname.startsWith('/api/')) writes++; });
  stage = 'remote payment';
  await row(entry.description).getByRole('button', { name: 'Baixar', exact: true }).click();
  await dialog().getByText('Nenhum pagamento registrado.', { exact: true }).waitFor();
  await reader.getByLabel(/Data do pagamento/).fill('2030-01-07T10:30');
  await dialog().locator('select').selectOption('pix', { force: true });
  const oldVersion = entry.version, observedAt = Date.now();
  let operation = await api('POST', endpoint + '/mark-paid', { version: entry.version, idempotency_key: randomUUID(), payment_method: 'cash', paid_at: null });
  entry = operation.entry;
  await dialog().getByText('Pagamento ativo', { exact: true }).waitFor({ timeout: 25000 }); const latency = Date.now() - observedAt;
  assert.equal(await reader.getByLabel(/Data do pagamento/).inputValue(), '2030-01-07T10:30'); assert.equal(await dialog().locator('select').inputValue(), 'pix');
  await dialog().getByText('Estado de referência da ação: Pendente.', { exact: true }).waitFor(); assert.equal(writes, 0);
  stage = 'captured settlement conflict';
  let response = reader.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/mark-paid'));
  await dialog().getByRole('button', { name: 'Confirmar baixa integral' }).click(); let rejected = await response;
  assert.equal(rejected.status(), 409); assert.equal(rejected.request().postDataJSON().version, oldVersion); assert.equal(rejected.request().postDataJSON().payment_method, 'pix');
  await dialog().getByRole('button', { name: 'Fechar', exact: true }).click();
  stage = 'remote reversal with draft';
  await row(entry.description).getByRole('button', { name: 'Ver pagamentos', exact: true }).click();
  await dialog().getByLabel('Motivo do estorno').fill('Fictitious captured reason'); const captured = { version: entry.version, payment_id: entry.active_payment_id };
  operation = await api('POST', endpoint + '/reverse-payment', { ...captured, idempotency_key: randomUUID(), reason: 'Fictitious remote reversal' }); entry = operation.entry;
  await dialog().getByText(/Fictitious remote reversal/).waitFor({ timeout: 25000 });
  assert.equal(await dialog().getByLabel('Motivo do estorno').inputValue(), 'Fictitious captured reason'); assert.equal(writes, 1);
  response = reader.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/reverse-payment'));
  await dialog().getByRole('button', { name: 'Estornar registro', exact: true }).click(); rejected = await response;
  assert.equal(rejected.status(), 409); assert.equal(rejected.request().postDataJSON().version, captured.version); assert.equal(rejected.request().postDataJSON().payment_id, captured.payment_id);
  stage = 'transient failure and separate history';
  const pattern = '**' + endpoint + '/payments';
  await reader.route(pattern, route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"Fictitious unavailable"}' }));
  await refresh().click(); await dialog().getByText(/Os dados exibidos podem estar desatualizados/).waitFor();
  await dialog().getByText(/Fictitious remote reversal/).waitFor();
  for (const dark of [false, true]) {
   await reader.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
   await reader.screenshot({ path: path.resolve(__dirname, '../.data/homolog/financial-history-refresh-' + (dark ? 'dark' : 'light') + '.png'), fullPage: true, animations: 'disabled' });
  }
  await reader.unroute(pattern); await refresh().click(); await reader.waitForLoadState('networkidle');
  stage = 'hidden pause';
  await reader.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await reader.waitForLoadState('networkidle'); const before = reads; await reader.waitForTimeout(17000); assert.equal(reads, before);
  await reader.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
  await reader.waitForLoadState('networkidle');
  stage = 'close stops reads'; await dialog().getByRole('button', { name: 'Fechar', exact: true }).click();
  const closedReads = reads; await reader.waitForTimeout(17000); assert.equal(reads, closedReads);
  stage = 'read-only history'; matrix.permissions.financial = { view: true, create: false, update: false, delete: false }; await saveMatrix();
  await row(entry.description).getByRole('button', { name: 'Editar', exact: true }).waitFor({ state: 'hidden', timeout: 25000 });
  // Existing access guard suspends controls after write revocation. Re-enter with
  // the read-only profile after closing all actions, as an explicit user review.
  await reader.goto(origin + '/financial');
  await row(entry.description).getByRole('button', { name: 'Ver pagamentos', exact: true }).click();
  await dialog().getByText(/Fictitious remote reversal/).waitFor(); assert.equal(await dialog().getByRole('button', { name: 'Estornar registro', exact: true }).count(), 0);
  await dialog().getByRole('button', { name: 'Fechar', exact: true }).click();
  stage = 'remote deletion'; const removable = await api('POST', '/api/financial', { ...payload, description: 'Fictitious removable history' });
  await row(removable.description).getByRole('button', { name: 'Ver histórico', exact: true }).click({ timeout: 25000 });
  await dialog().getByText('Nenhum pagamento registrado.', { exact: true }).waitFor();
  await api('DELETE', '/api/financial/' + removable.id + '?version=' + removable.version);
  await dialog().getByText(/Este lançamento não está mais disponível/).waitFor({ timeout: 25000 });
  assert.equal(await dialog().getByText('Nenhum pagamento registrado.', { exact: true }).count(), 0);
  await dialog().getByRole('button', { name: 'Fechar', exact: true }).click();
  stage = 'revocation with history open'; await row(entry.description).getByRole('button', { name: 'Ver pagamentos', exact: true }).click();
  await dialog().getByText(/Fictitious remote reversal/).waitFor(); matrix.permissions.financial.view = false; await saveMatrix();
  await reader.getByText(/Sem permissão para acessar esta página\.|Seu acesso ao financeiro foi encerrado\./).waitFor({ timeout: 25000 });
  assert.equal(await reader.getByRole('heading', { name: /^(Confirmar baixa|Pagamentos e estornos)$/ }).count(), 0);
  assert.equal(await reader.evaluate(async ({ endpoint, id }) => (await fetch(endpoint + '/payments', { headers: { 'X-Session-ID': id } })).status, { endpoint, id: receiver.session_id }), 403);
  assert.equal(writes, 2);
  console.log('PASS: independent sessions; live payment in ' + latency + 'ms; remote reversal; captured date/method/version/payment/reason; two explicit conflicts; stale history/manual recovery; hidden/closed pause; read-only history; deleted entry/404 and revocation/403; no automatic writes.');
 } finally { await browser.close(); }
})().catch(() => { console.error('Financial history refresh browser failed at stage: ' + stage); process.exitCode = 1; });
