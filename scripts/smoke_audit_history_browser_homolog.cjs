const fs = require('node:fs'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
(async () => {
  const credentials = JSON.parse(fs.readFileSync(0, 'utf8'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const origin = 'https://localhost:18444';
  try {
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: 'America/New_York' })).newPage();
    const reader = await (await browser.newContext()).newPage();
    const login = async (tab, email) => {
      await tab.goto(origin + '/login');
      await tab.locator('[name=email]').fill(email); await tab.locator('[name=password]').fill(credentials.password);
      const result = tab.waitForResponse(r => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST');
      await tab.getByRole('button', { name: 'Entrar', exact: true }).click();
      const identity = await (await result).json();
      await tab.getByRole('region', { name: 'Pacientes cadastrados', exact: true }).waitFor();
      return identity;
    };
    stage = 'admin login'; const identity = await login(page, credentials.email);
    const api = async (method, path, data, expected = 200) => {
      const result = await page.evaluate(async ({ method, path, data, identity }) => {
        const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json',
          'X-Session-ID': identity.session_id, 'X-CSRF-Token': identity.csrf_token }, body: data ? JSON.stringify(data) : undefined });
        return { status: r.status, body: await r.json() };
      }, { method, path, data, identity });
      assert.equal(result.status, expected, 'Fixture/API status'); return result.body;
    };
    await api('POST', '/api/users', { name: 'Fictitious History Reader', email: 'history-reader@example.com', role: 'reception', password: credentials.password }, 201);
    stage = 'navigation and pagination';
    await page.getByRole('link', { name: 'Histórico administrativo', exact: true }).click();
    await page.getByRole('article').first().waitFor();
    assert.equal(await page.getByRole('article').count(), 25);
    await page.getByRole('button', { name: 'Próxima página', exact: true }).click();
    await page.getByText('Página 2 ·', { exact: false }).waitFor();
    assert.equal(await page.getByRole('article').count(), 8);
    await page.getByRole('button', { name: 'Página anterior', exact: true }).click();
    await page.getByText('Página 1 ·', { exact: false }).waitFor();
    stage = 'filters and historical identity';
    await page.getByLabel('Usuário afetado (ID)', { exact: true }).fill(credentials.target);
    await page.getByLabel('Desde (São Paulo)', { exact: true }).fill('2026-01-15T09:10');
    await page.getByLabel('Até, sem incluir (São Paulo)', { exact: true }).fill('2026-01-15T09:12');
    const filtered = page.waitForResponse(r => r.url().includes('/api/administrative-audit?') && r.url().includes('since='));
    await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
    assert.equal((await (await filtered).json()).items.length, 2);
    await page.getByText('Página 1 · 2 eventos.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('article').count(), 2);
    assert.equal(await page.getByRole('article').first().getByText('Usuário afetado (ID): ' + credentials.target, { exact: true }).count(), 1);
    await page.screenshot({ path: '.data/audit-history-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: '.data/audit-history-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    stage = 'network failure and recovery';
    await page.route('**/api/administrative-audit?**', route => route.fulfill({ status: 503, contentType: 'application/json', body: '{"detail":"Fictitious unavailable"}' }));
    await page.getByRole('button', { name: 'Atualizar histórico', exact: true }).click();
    await page.getByText(/Não foi possível atualizar histórico/).waitFor();
    assert.equal(await page.getByRole('article').count(), 2);
    await page.unroute('**/api/administrative-audit?**');
    await page.getByRole('button', { name: 'Atualizar histórico', exact: true }).click();
    await page.getByText('Atualização automática ativa.', { exact: true }).waitFor();
    stage = 'empty filter';
    await page.getByLabel('Ação', { exact: true }).selectOption('user.deleted');
    await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click();
    await page.getByText('Nenhum evento encontrado para estes filtros.', { exact: true }).waitFor();
    stage = 'denied reader';
    await login(reader, 'history-reader@example.com');
    assert.equal(await reader.getByRole('link', { name: 'Histórico administrativo', exact: true }).count(), 0);
    await reader.goto(origin + '/administrative-audit');
    await reader.getByText('Sem permissão para acessar esta página.', { exact: true }).waitFor();
    const grant = async value => {
      const matrix = (await api('GET', '/api/permissions')).items.find(row => row.role === 'reception');
      matrix.permissions.administrative_audit.view = value;
      await api('PUT', '/api/permissions/reception', matrix);
    };
    stage = 'granted reader without user administration';
    await grant(true); await reader.reload(); await reader.getByRole('article').first().waitFor();
    assert.equal(await reader.getByRole('link', { name: 'Usuarios', exact: true }).count(), 0);
    stage = 'live revocation'; await grant(false);
    const refresh = reader.getByRole('button', { name: 'Atualizar histórico', exact: true });
    if (await refresh.isVisible()) await refresh.click();
    await reader.getByRole('article').first().waitFor({ state: 'hidden' });
    assert.equal(await reader.getByRole('article').count(), 0);
    console.log('PASS: Chrome history admin/granted/denied/revoked, cursor pagination, clinic-time filters, empty/error recovery and responsive layout.');
  } finally { await browser.close(); }
})().catch(() => { console.error('Permissions browser failed at stage: ' + stage); process.exit(1); });
