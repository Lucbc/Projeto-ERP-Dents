// Fictitious data only. Errors deliberately omit credentials and response bodies.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
(async () => {
  const credentials = JSON.parse(fs.readFileSync(0, 'utf8'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const origin = 'https://localhost:18444';
  try {
    const login = async (page, email) => {
      await page.goto(origin + '/login');
      await page.locator('[name=email]').fill(email);
      await page.locator('[name=password]').fill(credentials.password);
      const response = page.waitForResponse(r => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      const identity = await (await response).json();
      await page.getByRole('region', { name: 'Pacientes cadastrados', exact: true }).waitFor();
      return identity;
    };
    const writerContext = await browser.newContext({ timezoneId: 'America/Sao_Paulo' });
    const writer = await writerContext.newPage();
    stage = 'fixture login';
    const author = await login(writer, credentials.email);
    const api = async (method, url, data) => writer.evaluate(async ({ method, url, data, author }) => {
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-Session-ID': author.session_id,
        'X-CSRF-Token': author.csrf_token }, body: data ? JSON.stringify(data) : undefined });
      if (!r.ok) throw new Error('Fixture operation failed');
      return r.status === 204 ? null : r.json();
    }, { method, url, data, author });
    stage = 'fixtures';
    const patient = await api('POST', '/api/patients', { full_name: 'Fictitious Civil Date Patient', birth_date: '2000-02-29' });
    const dentist = await api('POST', '/api/dentists', { full_name: 'Fictitious Civil Date Dentist', availability:
      ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day => ({ day_of_week: day, start_time: '00:00', end_time: '23:59' })) });
    const start = new Date(); start.setUTCDate(start.getUTCDate() + 1); start.setUTCHours(12, 0, 0, 0);
    await api('POST', '/api/appointments', { patient_id: patient.id, dentist_id: dentist.id, procedure_ids: [],
      start_at: start.toISOString(), end_at: new Date(+start + 3600000).toISOString() });
    const account = await api('POST', '/api/users', { name: 'Fictitious Civil Date Reader', email: 'civil-dates@example.com',
      password: credentials.password, role: 'dentist', dentist_id: dentist.id });
    const entry = await api('POST', '/api/financial', { entry_type: 'income', description: 'Fictitious Civil Due Date',
      amount_cents: 12000, discount_cents: 0, tax_cents: 0, due_date: '2032-02-29', status: 'pending', patient_id: patient.id,
      idempotency_key: require('node:crypto').randomUUID() });
    for (const zone of ['America/Sao_Paulo', 'UTC', 'Asia/Tokyo']) {
      stage = zone + ' patient';
      const context = await browser.newContext({ timezoneId: zone, viewport: { width: 1440, height: 1100 } });
      const page = await context.newPage(); await login(page, credentials.email);
      let writes = 0;
      page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/') && ['POST','PUT','PATCH','DELETE'].includes(r.method())) writes++; });
      await page.goto(origin + '/patients');
      const patientRow = page.getByRole('row').filter({ hasText: patient.full_name });
      await patientRow.getByText('29/02/2000', { exact: true }).waitFor();
      await patientRow.getByRole('button', { name: 'Editar', exact: true }).click();
      assert.equal(await page.locator('[name=birth_date]').inputValue(), '2000-02-29');
      stage = zone + ' financial';
      await page.goto(origin + '/financial');
      const financialRow = page.getByRole('row').filter({ hasText: entry.description });
      await financialRow.getByText('29/02/2032', { exact: true }).waitFor();
      await financialRow.getByRole('button', { name: 'Editar', exact: true }).click();
      assert.equal(await page.locator('[name=due_date]').inputValue(), '2032-02-29');
      assert.equal(writes, 0);
      await context.close();
      stage = zone + ' consultation';
      const clinical = await browser.newContext({ timezoneId: zone, viewport: { width: 1440, height: 1100 } });
      const detail = await clinical.newPage(); await login(detail, account.email);
      let clinicalWrites = 0;
      detail.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/') && ['POST','PUT','PATCH','DELETE'].includes(r.method())) clinicalWrites++; });
      await detail.goto(origin + '/consultation');
      await detail.getByRole('region', { name: 'Pacientes', exact: true }).getByRole('row').filter({ hasText: patient.full_name })
        .getByRole('button', { name: 'Abrir', exact: true }).click();
      await detail.getByRole('region', { name: 'Dados do paciente', exact: true }).getByText('Nascimento: 29/02/2000', { exact: true }).waitFor();
      if (zone === 'America/Sao_Paulo') await detail.screenshot({ path: path.resolve(__dirname, '../.data/homolog/civil-dates-consultation.png'), fullPage: true });
      assert.equal(clinicalWrites, 0);
      await clinical.close();
    }
    stage = 'stored values unchanged';
    const savedPatient = await api('GET', '/api/patients/' + patient.id);
    const savedEntry = await api('GET', '/api/financial/' + entry.id);
    assert.equal(savedPatient.birth_date, patient.birth_date); assert.equal(savedPatient.version, patient.version);
    assert.equal(savedEntry.due_date, entry.due_date); assert.equal(savedEntry.version, entry.version);
    console.log('PASS: Sao Paulo/UTC/Tokyo; patient and consultation birth date; financial due date; unchanged editor values, API dates and versions; no reader writes.');
  } finally { await browser.close(); }
})().catch(() => { console.error('Civil dates browser failed at stage: ' + stage); process.exit(1); });
