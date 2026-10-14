// Fictitious disposable fixtures; never print credentials, bodies or identifiers.
const fs = require('node:fs'), assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
const fail = () => { console.error('Navigation session browser failed at stage: ' + stage); process.exitCode = 1; };
process.on('unhandledRejection', fail);
(async () => {
  const credentials = JSON.parse(fs.readFileSync(0, 'utf8'));
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  try {
    const origin = 'https://localhost:18444';
    const page = async () => (await browser.newContext({timezoneId: 'America/Sao_Paulo', viewport: {width: 1440, height: 1100}})).newPage();
    const writer = await page(), reader = await page();
    const login = async (target, email, navigate = true) => {
      if (navigate) await target.goto(origin + '/login');
      await target.locator('[name=email]').fill(email);
      await target.locator('[name=password]').fill(credentials.password);
      const response = target.waitForResponse(r => new URL(r.url()).pathname === '/api/auth/login' && r.request().method() === 'POST');
      await target.getByRole('button', {name: 'Entrar', exact: true}).click();
      const result = await response; assert.equal(result.status(), 200);
      const identity = await result.json();
      await target.getByRole('region', {name: 'Pacientes cadastrados', exact: true}).waitFor();
      return identity;
    };
    stage = 'writer login'; const author = await login(writer, credentials.email);
    const api = (method, url, data) => writer.evaluate(async ({method, url, data, author}) => {
      const r = await fetch(url, {method, headers: {'Content-Type': 'application/json',
        'X-Session-ID': author.session_id, 'X-CSRF-Token': author.csrf_token}, body: data ? JSON.stringify(data) : undefined});
      return {status: r.status, body: r.status === 204 ? null : await r.json()};
    }, {method, url, data, author});
    const createUser = async (name, email, role) => {
      const result = await api('POST', '/api/users', {name, email, role, password: credentials.password});
      assert.equal(result.status, 201); return result.body;
    };
    stage = 'fixtures';
    const oldUser = await createUser('Fictitious Old Navigation Admin', 'old-navigation@example.com', 'admin');
    const newUser = await createUser('Fictitious New Navigation Reception', 'new-navigation@example.com', 'reception');
    const patient = await api('POST', '/api/patients', {full_name: 'Fictitious Session Private Patient'});
    assert.equal(patient.status, 201);
    const matrix = (await api('GET', '/api/permissions')).body.items.find(item => item.role === 'reception');
    matrix.permissions.patients = {view: false, create: false, update: false, delete: false};
    for (const resource of ['dashboard', 'financial', 'dentists', 'appointments']) {
      matrix.permissions[resource] = {...matrix.permissions[resource], view: true};
    }
    assert.equal((await api('PUT', '/api/permissions/reception', {version: matrix.version, permissions: matrix.permissions})).status, 200);
    stage = 'old reader login'; const oldIdentity = await login(reader, oldUser.email);
    assert.notEqual(oldIdentity.session_id, author.session_id);
    await reader.evaluate(() => { window.sessionProbeDocument = true; });
    const navigate = async (name, pathname) => {
      stage = 'navigate ' + name;
      await reader.getByRole('link', {name, exact: true}).click();
      await reader.waitForURL(origin + pathname);
      assert.equal(await reader.evaluate(() => window.sessionProbeDocument), true);
    };
    stage = 'same document traversal';
    await navigate('Consultas', '/appointments');
    await navigate('Agenda', '/calendar');
    await navigate('Financeiro', '/financial');
    await navigate('Pacientes', '/patients');
    stage = 'old patient row';
    const oldRow = reader.getByRole('row').filter({hasText: patient.body.full_name});
    await oldRow.waitFor({timeout: 10000});
    stage = 'old edit button';
    const oldEdit = oldRow.getByRole('button', {name: 'Editar', exact: true});
    await oldEdit.waitFor({timeout: 10000});
    await reader.screenshot({path: '.data/homolog/session-draft-preparation.png', fullPage: true});
    stage = 'old edit click';
    await oldEdit.click({timeout: 5000});
    const draft = 'Fictitious old session draft';
    stage = 'fill old draft';
    await reader.locator('textarea[name=notes]').fill(draft);

    let privateGets = 0, writes = 0, patientsGets = 0, dentistsGets = 0, unauthorized = 0;
    reader.on('request', r => {
      const pathname = new URL(r.url()).pathname;
      if (!pathname.startsWith('/api/')) return;
      if (r.method() !== 'GET') { writes++; return; }
      if (!pathname.startsWith('/api/auth/')) privateGets++;
      if (pathname === '/api/patients') patientsGets++;
      if (pathname === '/api/dentists') dentistsGets++;
    });
    reader.on('response', r => { if (r.status() === 401 && new URL(r.url()).pathname.startsWith('/api/')) unauthorized++; });
    // Fetch a real old-session success, but keep its delivery pending across identity change.
    let captured, deliver, delivered;
    const capturedPromise = new Promise(resolve => { captured = resolve; });
    const deliveryGate = new Promise(resolve => { deliver = resolve; });
    const deliveredPromise = new Promise(resolve => { delivered = resolve; });
    let heldRequest, cancelled = false;
    reader.on('requestfailed', r => { if (r === heldRequest) cancelled = true; });
    const patientUrl = /\/api\/patients(?:\?.*)?$/;
    await reader.route(patientUrl, async route => {
      heldRequest = route.request();
      const response = await route.fetch();
      assert.equal(response.status(), 200); captured();
      await deliveryGate;
      try { await route.fulfill({response}); } catch { assert.equal(cancelled, true); }
      finally { delivered(); }
    });
    stage = 'capture pending old response';
    await reader.evaluate(() => window.dispatchEvent(new Event('focus')));
    await Promise.race([capturedPromise, new Promise((_, reject) => setTimeout(() => reject(new Error('capture timeout')), 10000))]);
    stage = 'real revocation';
    assert.equal((await api('PUT', '/api/users/' + oldUser.id, {version: oldUser.version, is_active: false})).status, 200);
    await reader.evaluate(() => window.dispatchEvent(new Event('focus')));
    await reader.getByRole('button', {name: 'Entrar', exact: true}).waitFor({timeout: 25000});
    assert.ok(unauthorized >= 1);
    assert.equal(await reader.locator('textarea[name=notes]').count(), 0);
    assert.equal(await reader.getByText(patient.body.full_name, {exact: true}).count(), 0);
    stage = 'anonymous pause'; await reader.waitForTimeout(500);
    const before = privateGets;
    await reader.waitForTimeout(32000);
    assert.equal(privateGets, before); assert.equal(writes, 0); assert.equal(cancelled, true);

    stage = 'new identity same document';
    const newIdentity = await login(reader, newUser.email, false);
    assert.notEqual(newIdentity.session_id, oldIdentity.session_id);
    assert.equal(await reader.evaluate(() => window.sessionProbeDocument), true);
    await reader.getByText('Sem permissão para consultar pacientes.', {exact: true}).waitFor();
    assert.equal(await reader.getByRole('link', {name: 'Pacientes', exact: true}).count(), 0);
    stage = 'late old response'; deliver(); await deliveredPromise; await reader.unroute(patientUrl);
    await reader.waitForTimeout(300);
    assert.equal(await reader.getByText(patient.body.full_name, {exact: true}).count(), 0);
    assert.equal(await reader.locator('textarea[name=notes]').count(), 0);
    stage = 'new references and permissions';
    const patientBefore = patientsGets, dentistBefore = dentistsGets;
    await navigate('Financeiro', '/financial');
    await reader.waitForTimeout(1000);
    assert.equal(patientsGets, patientBefore); assert.ok(dentistsGets > dentistBefore);
    assert.equal(await reader.evaluate(value => [...document.querySelectorAll('input,textarea')].some(element => element.value === value), draft), false);
    stage = 'resource forbidden without logout';
    const forbidden = await reader.evaluate(async identity => (await fetch('/api/patients', {headers: {'X-Session-ID': identity.session_id}})).status, newIdentity);
    assert.equal(forbidden, 403);
    stage = 'new identity denied route';
    await reader.evaluate(() => {
      history.pushState({}, '', '/patients'); window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await reader.getByText('Sem permissão para acessar esta página.', {exact: true}).waitFor();
    assert.equal(await reader.getByText(patient.body.full_name, {exact: true}).count(), 0);
    await navigate('Painel', '/');
    assert.equal(await reader.getByRole('button', {name: 'Entrar', exact: true}).count(), 0);
    assert.equal(writes, 1); // Only the explicitly requested new login.
    console.log('PASS: same-document traversal; independent writer; real account revocation and authenticated 401; draft cleared; 32s without private polling at login; pending old request cancelled; old delivery after new login cannot restore data; new reception permissions and references; resource 403 preserves session; only explicit login write.');
  } finally { await browser.close(); }
})().catch(fail);
