// Private fictional fixtures. Output contains only fixed labels, counts and durations.
const fs = require('node:fs'), assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
const fail = () => { console.error('Navigation reads browser failed at stage: ' + stage); process.exitCode = 1; };
process.on('unhandledRejection', fail);
(async () => {
  const credentials = JSON.parse(fs.readFileSync(0, 'utf8'));
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const origin = 'https://localhost:18444';
  try {
    const makeContext = () => browser.newContext({timezoneId: 'America/Sao_Paulo', viewport: {width: 1440, height: 1100}});
    const writer = await (await makeContext()).newPage();
    const readerContext = await makeContext(), reader = await readerContext.newPage();
    const login = async (page, email) => {
      await page.goto(origin + '/login');
      await page.locator('[name=email]').fill(email);
      await page.locator('[name=password]').fill(credentials.password);
      const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/auth/login' && r.request().method() === 'POST');
      await page.getByRole('button', {name: 'Entrar', exact: true}).click();
      const identity = await (await response).json();
      await page.getByRole('region', {name: 'Pacientes cadastrados', exact: true}).waitFor();
      return identity;
    };
    stage = 'writer login';
    const author = await login(writer, credentials.email);
    const api = (method, url, data) => writer.evaluate(async ({method, url, data, author}) => {
      const response = await fetch(url, {method, headers: {'Content-Type': 'application/json',
        'X-Session-ID': author.session_id, 'X-CSRF-Token': author.csrf_token}, body: data ? JSON.stringify(data) : undefined});
      return {status: response.status, body: response.status === 204 ? null : await response.json()};
    }, {method, url, data, author});
    stage = 'fixtures';
    const created = await api('POST', '/api/users', {name: 'Fictitious Navigation Reader',
      email: 'navigation-reader@example.com', password: credentials.password, role: 'reception'});
    assert.equal(created.status, 201);
    const matrix = (await api('GET', '/api/permissions')).body.items.find(item => item.role === 'reception');
    for (const resource of ['dashboard', 'patients', 'dentists', 'procedures', 'appointments', 'calendar', 'financial']) {
      matrix.permissions[resource] = {...matrix.permissions[resource], view: true};
    }
    assert.equal((await api('PUT', '/api/permissions/reception', {version: matrix.version, permissions: matrix.permissions})).status, 200);
    stage = 'reader login';
    const receiver = await login(reader, created.body.email);
    assert.notEqual(receiver.session_id, author.session_id);
    await reader.evaluate(() => { window.navigationProbeDocument = true; });

    // Keep no URLs/query strings/bodies in reports. Classification is allowlisted.
    const events = [], pending = new Set();
    let writes = 0;
    const classify = request => {
      const url = new URL(request.url()), p = url.pathname, limit = url.searchParams.get('limit');
      if (p === '/api/permissions/me') return 'permissions';
      if (p === '/api/patients' || p === '/api/dentists') {
        const resource = p.endsWith('patients') ? 'patients' : 'dentists';
        return resource + (limit === '1' ? '-count' : limit === '200' ? '-reference' : '-list');
      }
      if (p === '/api/procedures') return 'procedures-reference';
      if (p === '/api/appointments') return 'appointments';
      if (p === '/api/financial') return 'financial-list';
      if (p === '/api/financial/summary') return 'financial-summary';
      return 'other';
    };
    reader.on('request', request => {
      if (!new URL(request.url()).pathname.startsWith('/api/')) return;
      if (request.method() !== 'GET') { writes++; return; }
      pending.add(request); events.push(classify(request));
    });
    for (const event of ['requestfinished', 'requestfailed']) reader.on(event, request => pending.delete(request));
    const settle = async () => {
      const deadline = Date.now() + 10000;
      do { await reader.waitForTimeout(100); } while (pending.size && Date.now() < deadline);
      assert.equal(pending.size, 0);
      await reader.waitForTimeout(300);
    };
    const counts = start => events.slice(start).reduce((result, key) => ({...result, [key]: (result[key] || 0) + 1}), {});
    const report = (label, start, time) => console.log('Navigation measurement: ' + JSON.stringify({phase: label, duration_ms: Date.now() - time, gets: counts(start)}));
    const measure = async (label, expected) => {
      stage = label; await settle();
      const start = events.length, time = Date.now();
      await reader.waitForTimeout(32000);
      const observed = counts(start);
      assert.deepEqual(Object.keys(observed).sort(), [...expected].sort());
      for (const key of expected) assert.ok(observed[key] >= 2 && observed[key] <= 3);
      assert.equal(writes, 0); report(label, start, time);
    };
    const navigate = async (label, pathname) => {
      stage = 'navigate ' + label;
      const start = events.length, time = Date.now();
      await reader.getByRole('link', {name: label, exact: true}).click();
      await reader.waitForURL(origin + pathname);
      await settle();
      assert.equal(await reader.evaluate(() => window.navigationProbeDocument), true);
      report('initial-' + label, start, time);
    };
    const panel = ['permissions', 'patients-count', 'dentists-count', 'appointments'];
    const slowOnly = process.env.NAVIGATION_PROBE_ONLY === 'slow';
    const patientRegion = reader.getByRole('region', {name: 'Pacientes cadastrados', exact: true});
    if (!slowOnly) {
    await measure('panel', panel);
    await navigate('Pacientes', '/patients');
    await measure('patients', ['permissions', 'patients-list']);
    await navigate('Consultas', '/appointments');
    await measure('appointments', ['permissions', 'appointments']);
    await navigate('Agenda', '/calendar');
    await measure('calendar', ['permissions', 'appointments']);
    await navigate('Financeiro', '/financial');
    await measure('financial', ['permissions', 'financial-list', 'financial-summary']);
    await navigate('Painel', '/');
    await measure('panel-return', panel);

    const remotePatient = async name => {
      assert.equal((await api('POST', '/api/patients', {full_name: name})).status, 201);
    };
    stage = 'rapid return';
    await remotePatient('Fictitious Navigation Rapid Return');
    await navigate('Pacientes', '/patients');
    await reader.getByRole('cell', {name: 'Fictitious Navigation Rapid Return', exact: true}).waitFor();
    await navigate('Painel', '/');
    await patientRegion.getByText('1', {exact: true}).waitFor({timeout: 10000});
    const pause = async (label, enter, leave, total) => {
      stage = label; await enter(); await settle();
      const start = events.length, time = Date.now();
      await reader.waitForTimeout(32000);
      assert.equal(events.length, start); report(label, start, time);
      await remotePatient('Fictitious Navigation ' + label);
      const resumed = events.length, resumedAt = Date.now();
      await leave();
      await patientRegion.getByText(String(total), {exact: true}).waitFor({timeout: 10000});
      await settle();
      const observed = counts(resumed);
      assert.deepEqual(Object.keys(observed).sort(), [...panel].sort());
      for (const key of panel) assert.equal(observed[key], 1);
      report(label + '-return', resumed, resumedAt);
    };
    await pause('hidden',
      () => reader.evaluate(() => { Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'hidden'}); document.dispatchEvent(new Event('visibilitychange')); }),
      () => reader.evaluate(() => { delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); }), 2);
    await pause('offline',
      async () => { await readerContext.setOffline(true); await reader.evaluate(() => window.dispatchEvent(new Event('offline'))); },
      async () => { await readerContext.setOffline(false); await reader.evaluate(() => window.dispatchEvent(new Event('online'))); }, 3);
    }

    if (slowOnly) {
      stage = 'focused network return';
      await readerContext.setOffline(true);
      await reader.evaluate(() => window.dispatchEvent(new Event('offline')));
      await settle();
      await readerContext.setOffline(false);
      await reader.evaluate(() => window.dispatchEvent(new Event('online')));
      await settle();
    }
    stage = 'slow shared triggers';
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let slowRequests = 0;
    const patientUrl = /\/api\/patients(?:\?.*)?$/;
    await reader.route(patientUrl, async route => { slowRequests++; await gate; await route.continue(); });
    const slowStart = events.length, slowTime = Date.now();
    stage = 'slow start focus';
    await reader.evaluate(() => window.dispatchEvent(new Event('focus')));
    await reader.waitForTimeout(300);
    await reader.evaluate(() => window.dispatchEvent(new Event('focus')));
    // Stay below the production transport timeout (15s). Interval overlap is
    // covered with controlled timers by live-query.test.tsx.
    await reader.waitForTimeout(3000);
    stage = 'slow disabled manual';
    assert.equal(await patientRegion.getByRole('button', {name: 'Atualizar pacientes', exact: true}).isDisabled(), true);
    stage = 'slow request count'; assert.equal(slowRequests, 1);
    stage = 'slow release';
    release(); await settle(); await reader.unroute(patientUrl);
    stage = 'slow recovery'; await patientRegion.getByText('Atualização automática ativa.', {exact: true}).waitFor();
    assert.equal(writes, 0); report('slow-shared-triggers', slowStart, slowTime);
    console.log(slowOnly ? 'PASS: focused slow request only; not full navigation acceptance.' : 'PASS: same-document menu navigation; independent sessions; two periodic intervals per module; no departed readers or periodic catalogs; hidden/offline pause and current remote data on return; slow request shared; no reader writes.');
  } finally { await browser.close(); }
})().catch(fail);
