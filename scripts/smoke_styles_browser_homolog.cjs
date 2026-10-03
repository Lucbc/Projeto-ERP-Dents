// Disposable fictitious fixtures only. Reports contain styles, never input values or responses.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
process.on('unhandledRejection', () => { console.error('Styles browser failed at stage: ' + stage); process.exit(1); });
(async () => {
  const credentials = JSON.parse(fs.readFileSync(0, 'utf8'));
  const output = path.resolve(__dirname, '../.data/homolog/styles'); fs.mkdirSync(output, { recursive: true });
  const baseline = process.env.STYLES_BASELINE_CSS ? fs.readFileSync(process.env.STYLES_BASELINE_CSS, 'utf8') : null;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const report = [];
  try {
    const page = await browser.newPage({ timezoneId: 'America/Sao_Paulo', viewport: { width: 1440, height: 1100 } });
    const origin = 'https://localhost:18444';
    const capture = async (name) => {
      for (const dark of [false, true]) {
        const label = name + (dark ? '-dark' : '-light'); stage = label;
        await page.evaluate(dark => document.documentElement.classList.toggle('dark', dark), dark);
        await page.screenshot({ path: path.join(output, label + '.png'), fullPage: true, animations: 'disabled' });
        const measure = () => page.evaluate(() => [...document.querySelectorAll('#root *')]
          .filter(e => e.getBoundingClientRect().width && e.getBoundingClientRect().height)
          .map(e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return {
            tag: e.tagName, cls: e.getAttribute('class') || '', x: r.x, y: r.y, w: r.width, h: r.height,
            color: s.color, background: s.backgroundColor, border: s.borderTopColor, radius: s.borderRadius,
            font: s.fontFamily, size: s.fontSize, display: s.display,
          }; }));
        const current = await measure();
        assert.ok(current.length > 10);
        assert.ok(current.some(e => e.size !== '16px'), 'Typography utilities missing');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Page overflow');
        const overlay = page.locator('.fixed.inset-0');
        if (await overlay.count()) {
          const bounds = await overlay.first().boundingBox();
          assert.ok(Math.abs(bounds.x) <= 1 && Math.abs(bounds.y) <= 1 && Math.abs(bounds.height - 1100) <= 1, 'Modal overlay must cover the viewport');
        }
        if (baseline) {
          await page.evaluate(css => {
            window.styleMigrationSheets = [...document.styleSheets].filter(s => !s.href || new URL(s.href).origin === location.origin);
            window.styleMigrationSheets.forEach(s => { s.disabled = true; });
            window.styleMigrationClasses = [...document.querySelectorAll('[class]')].map(e => [e, e.getAttribute('class')]);
            const reverse = { 'shadow-xs': 'shadow-sm', 'rounded-sm': 'rounded', 'backdrop-blur-sm': 'backdrop-blur', 'outline-hidden': 'outline-none' };
            for (const [e, classes] of window.styleMigrationClasses) e.setAttribute('class', classes.split(/\s+/).map(c => c.split(':').map(p => reverse[p] || p).join(':')).join(' '));
            const old = document.createElement('style'); old.id = 'migration-baseline'; old.textContent = css; document.head.append(old);
          }, baseline);
          await page.screenshot({ path: path.join(output, label + '-baseline.png'), fullPage: true, animations: 'disabled' });
          const previous = await measure();
          const differences = current.flatMap((item, i) => {
            const old = previous[i];
            if (!old || old.tag !== item.tag) return [{ index: i, tag: item.tag, reason: 'visible structure changed' }];
            const geometry = ['x', 'y', 'w', 'h'].filter(k => Math.abs(item[k] - old[k]) > 1);
            const styles = ['color', 'background', 'border', 'radius', 'font', 'size', 'display'].filter(k => item[k] !== old[k]);
            return geometry.length || styles.length ? [{ index: i, tag: item.tag, cls: item.cls,
              geometry: Object.fromEntries(geometry.map(k => [k, [old[k], item[k]]])),
              styles: Object.fromEntries(styles.map(k => [k, [old[k], item[k]]])) }] : [];
          });
          report.push({ label, count: current.length, previousCount: previous.length, differences });
          await page.evaluate(() => {
            document.getElementById('migration-baseline').remove();
            window.styleMigrationClasses.forEach(([e, cls]) => e.setAttribute('class', cls));
            window.styleMigrationSheets.forEach(s => { s.disabled = false; });
          });
        } else report.push({ label, count: current.length });
      }
    };
    stage = 'login'; await page.goto(origin + '/login'); await page.locator('[name=email]').waitFor();
    await capture('login');
    await page.locator('[name=email]').fill(credentials.email); await page.locator('[name=password]').fill(credentials.password);
    const logged = page.waitForResponse(r => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click(); const identity = await (await logged).json();
    await page.getByRole('region', { name: 'Pacientes cadastrados', exact: true }).waitFor();
    const api = async (url, data) => {
      const result = await page.evaluate(async ({ url, data, identity }) => {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Session-ID': identity.session_id, 'X-CSRF-Token': identity.csrf_token }, body: JSON.stringify(data) });
        return { status: r.status, body: await r.json() };
      }, { url, data, identity });
      assert.equal(result.status, 201); return result.body;
    };
    stage = 'fixtures';
    const patient = await api('/api/patients', { full_name: 'Fictitious Style Patient' });
    await api('/api/dentists', { full_name: 'Fictitious Style Dentist' });
    await api('/api/financial', { entry_type: 'income', description: 'Fictitious Style Entry', amount_cents: 12000, due_date: new Date().toISOString().slice(0, 10), patient_id: patient.id });
    const screens = [ ['', null], ['patients', 'Novo'], ['dentists', 'Novo'], ['appointments', 'Nova'], ['calendar', 'Nova consulta'],
      ['financial', 'Novo lancamento'], ['users', 'Novo'], ['permissions', null], ['procedures', 'Novo'], ['specialties', 'Nova'], ['patients/' + patient.id, null] ];
    for (const [route, create] of screens) {
      stage = 'route ' + route.split('/')[0]; await page.goto(origin + '/' + route); await page.waitForLoadState('networkidle');
      const name = route.startsWith('patients/') ? 'exams' : route || 'dashboard';
      await capture(name);
      if (create) {
        await page.getByRole('button', { name: create, exact: true }).click();
        await page.locator('.fixed h2').waitFor(); await page.waitForLoadState('networkidle');
        const input = page.locator('.fixed input:not([type=hidden])').first();
        if (await input.count()) {
          await input.focus(); await page.waitForTimeout(200);
          assert.notEqual(await input.evaluate(e => getComputedStyle(e).boxShadow), 'none', 'Input focus indicator missing');
        }
        await capture(name + '-form');
      }
    }
    stage = 'payment'; await page.goto(origin + '/financial');
    await page.getByRole('row').filter({ hasText: 'Fictitious Style Entry' }).getByRole('button', { name: 'Baixar', exact: true }).click();
    await page.getByRole('heading', { name: 'Confirmar baixa', exact: true }).waitFor(); await page.waitForLoadState('networkidle');
    await capture('payment');
    fs.writeFileSync(path.join(output, 'comparison.json'), JSON.stringify(report, null, 2));
    console.log('PASS: ' + report.length + ' light/dark captures; dashboard, lists, forms, permissions, calendar, exams and payment; fictitious private fixtures.');
  } finally { await browser.close(); }
})().catch(() => { console.error('Styles browser failed at stage: ' + stage); process.exitCode = 1; });
