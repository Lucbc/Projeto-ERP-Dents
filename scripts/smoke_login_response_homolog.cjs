// Diagnostic only: real server authentication, response withheld from the UI.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
(async () => {
  const credentials = JSON.parse(fs.readFileSync(0, 'utf8'));
  const recovery = process.env.LOGIN_RECOVERY_ACCEPTANCE === '1';
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const retainCookie of [false, true]) {
      const context = await browser.newContext(), page = await context.newPage();
      stage = retainCookie ? 'response lost with cookie' : 'response lost without cookie';
      await page.goto('https://localhost:18444/login');
      await page.getByRole('button', { name: 'Entrar', exact: true }).waitFor();
      await page.locator('[name=email]').fill(credentials.email);
      await page.locator('[name=password]').fill(credentials.password);
      let logins = 0, authenticated = false;
      page.on('request', request => {
        if (request.url().endsWith('/api/auth/login') && request.method() === 'POST') logins++;
      });
      await page.route('**/api/auth/login', async route => {
        // fetch receives Set-Cookie in this context; removing it models a response
        // lost before headers arrive. Keeping it models headers received/body lost.
        const response = await route.fetch({ maxRetries: 0 });
        authenticated = response.status() === 200;
        if (!retainCookie) await context.clearCookies();
        await route.abort('failed');
      });
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await page.getByText(/Não foi possível conectar ao servidor/).waitFor();
      assert.equal(authenticated, true);
      assert.equal(logins, 1);
      assert.equal(await page.getByRole('button', { name: 'Entrar', exact: true }).isEnabled(), true);
      assert.equal(await page.getByRole('region', { name: 'Pacientes cadastrados', exact: true }).count(), 0);
      const sessionResponse = await context.request.get('https://localhost:18444/api/auth/session');
      assert.equal(sessionResponse.status(), 200);
      const session = await sessionResponse.json();
      assert.equal(Boolean(session.session_id), retainCookie);
      if (retainCookie) assert.equal(session.user.email, credentials.email);
      await page.waitForTimeout(1000);
      assert.equal(logins, 1);
      await page.unroute('**/api/auth/login');
      if (recovery) {
        stage = 'explicit recovery lookup failure';
        await page.route('**/api/auth/session', route => route.abort('failed'));
        await Promise.all([
          page.waitForEvent('requestfailed', request => request.url().endsWith('/api/auth/session')),
          page.getByRole('button', { name: 'Conferir acesso', exact: true }).click(),
        ]);
        await page.getByRole('button', { name: 'Conferir acesso', exact: true }).waitFor();
        assert.equal(logins, 1);
        await page.unroute('**/api/auth/session');
        stage = 'explicit recovery lookup';
        await page.getByRole('button', { name: 'Conferir acesso', exact: true }).click();
        if (!retainCookie) await page.getByText(/Nenhum acesso confirmado/).waitFor();
      }
      stage = retainCookie ? 'reload recovers confirmed identity' : 'explicit retry without cookie';
      if (retainCookie && !recovery) await page.reload();
      else if (!retainCookie) await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await page.getByRole('region', { name: 'Pacientes cadastrados', exact: true }).waitFor();
      assert.equal(logins, retainCookie ? 1 : 2);
      const marker = await page.evaluate(() => localStorage.getItem('erp_dents_session_marker'));
      const identity = await context.request.get('https://localhost:18444/api/auth/me', {
        headers: { 'X-Session-ID': marker },
      });
      assert.equal(identity.status(), 200);
      assert.equal((await identity.json()).email, credentials.email);
      assert.equal(await page.evaluate(password => [localStorage, sessionStorage].some(storage =>
        Object.values(storage).some(value => String(value).includes(password))), credentials.password), false);
      console.log(recovery ? 'PASS: explicit session lookup recovers only received access; lookup failure remains retryable; no credential resend.' : retainCookie
        ? 'DIAGNOSIS: cookie retained; UI reports failure; reload validates intended identity without another login.'
        : 'DIAGNOSIS: cookie absent; UI reports failure; explicit retry authenticates; no automatic retry.');
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(() => { console.error('Registration pilot failed at stage: ' + stage); process.exit(1); });
