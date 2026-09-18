// Optional browser regression: set PLAYWRIGHT_MODULE to an installed Playwright module.
// Uses existing Chrome, trusted local CA, fictitious homologation credentials; no TLS bypass.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const state = path.join(root, '.data', 'homolog');
let stage = 'start';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: false, viewport: { width: 1366, height: 900 } });
  try {
    const page = await context.newPage();
    const credentials = JSON.parse(fs.readFileSync(path.join(state, 'admin.json'), 'utf8'));
    stage = 'trusted HTTPS navigation';
    await page.goto('https://localhost:18443/patients');
    await page.getByRole('button', { name: 'Entrar', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.isSecureContext), true);
    stage = 'login';
    await page.locator('input[name=email]').fill(credentials.email);
    await page.locator('input[name=password]').fill(credentials.password);
    const loginResponse = page.waitForResponse(r => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    const login = await (await loginResponse).json();
    assert(!('access_token' in login));
    await page.getByRole('button', { name: 'Sair', exact: true }).waitFor();
    stage = 'cookie privacy';
    const cookies = await context.cookies();
    const cookie = cookies.find(c => c.name === '__Host-erp_dents_homolog');
    assert(cookie && cookie.httpOnly && cookie.secure && cookie.sameSite === 'Lax');
    const visible = await page.evaluate(() => ({ cookies: document.cookie,
      legacy: localStorage.getItem('erp_dents_token'), storage: JSON.stringify(localStorage) }));
    assert.equal(visible.legacy, null);
    assert(!visible.cookies.includes(cookie.name));
    assert(!visible.storage.includes(cookie.value));
    assert(!visible.storage.includes(login.csrf_token));
    await page.screenshot({ path: path.join(state, 'cookie-admin-https.png'), fullPage: true });
    stage = 'second tab and reload';
    const second = await context.newPage();
    await second.goto('https://localhost:18443/patients');
    await second.getByRole('button', { name: 'Sair', exact: true }).waitFor();
    await second.reload();
    await second.getByRole('button', { name: 'Sair', exact: true }).waitFor();
    stage = 'logout failure hides private data';
    await page.route('**/api/auth/logout', route => route.abort('failed'));
    await page.getByRole('button', { name: 'Sair', exact: true }).click();
    await page.getByRole('button', { name: 'Tentar sair novamente' }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Pacientes', exact: true }).count(), 0);
    await page.unroute('**/api/auth/logout');
    stage = 'logout and cross-tab invalidation';
    await page.getByRole('button', { name: 'Tentar sair novamente' }).click();
    await page.getByRole('button', { name: 'Entrar', exact: true }).waitFor();
    await second.getByRole('button', { name: 'Entrar', exact: true }).waitFor();
    await second.reload();
    await second.getByRole('button', { name: 'Entrar', exact: true }).waitFor();
    await second.screenshot({ path: path.join(state, 'cookie-logout-https.png'), fullPage: true });
    console.log('OK: Chrome trusted HTTPS, login, HttpOnly/Secure, no browser-stored credential, two tabs, reload, failed logout/retry and revocation.');
  } finally { await browser.close(); }
})().catch(() => { console.error('Browser homologation failed at: '+stage+' (credentials and response bodies omitted).'); process.exitCode = 1; });
