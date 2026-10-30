// Acceptance: clinical dates must be identical across workstations.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
(async () => {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const cases = ['America/Sao_Paulo', 'UTC', 'Asia/Tokyo', 'America/New_York'].map(zone => ({
    zone, start: '2020-01-07T22:30', end: '2020-01-07T23:30', date: '07/01/2020',
    from: '2020-01-07T03:00:00.000Z', to: '2020-01-08T02:59:59.999999Z', column: 1, top: 93.75, found: true,
  }));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const c of cases) {
      stage = c.zone + ' login';
      const context = await browser.newContext({ timezoneId: c.zone, viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      let appointmentWrites = 0;
      page.on('request', request => {
        if (new URL(request.url()).pathname.startsWith('/api/appointments') &&
            ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) appointmentWrites++;
      });
      await page.goto('https://localhost:18444/login');
      await page.locator('[name=email]').fill(input.email);
      await page.locator('[name=password]').fill(input.password);
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await page.getByRole('region', { name: 'Pacientes cadastrados', exact: true }).waitFor();
      await page.clock.setFixedTime(new Date('2020-01-07T12:00:00Z'));
      stage = c.zone + ' list display and editor';
      await page.goto('https://localhost:18444/appointments');
      const row = page.getByRole('row').filter({ hasText: input.fixtureName });
      await row.waitFor();
      assert.ok((await row.innerText()).includes(c.date));
      assert.ok((await row.innerText()).includes(c.start.slice(11)));
      await row.getByRole('button', { name: 'Editar', exact: true }).click();
      await page.locator('[name=start_at]').waitFor();
      assert.equal(await page.locator('[name=start_at]').inputValue(), c.start);
      assert.equal(await page.locator('[name=end_at]').inputValue(), c.end);
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
      stage = c.zone + ' clinical day filter';
      await page.locator('input[type=date]').nth(0).fill('2020-01-07');
      const filtered = page.waitForResponse(response => {
        const url = new URL(response.url());
        return url.pathname === '/api/appointments' && url.searchParams.get('from') === c.from && url.searchParams.get('to') === c.to;
      });
      await page.locator('input[type=date]').nth(1).fill('2020-01-07');
      const response = await filtered;
      assert.equal(response.status(), 200);
      const filteredBody = JSON.stringify(await response.json());
      assert.equal(filteredBody.includes(input.appointmentId), c.found);
      assert.ok(filteredBody.includes(input.edgeId));
      stage = c.zone + ' calendar position and editor';
      await page.goto('https://localhost:18444/calendar');
      const event = page.locator('.rbc-event').filter({ hasText: input.fixtureName });
      await event.waitFor();
      const geometry = await event.evaluate(node => ({
        column: [...document.querySelectorAll('.rbc-day-slot')].indexOf(node.closest('.rbc-day-slot')),
        top: parseFloat(node.style.top),
      }));
      assert.equal(geometry.column, c.column);
      assert.ok(Math.abs(geometry.top - c.top) < 0.1);
      await event.click();
      await page.locator('[name=start_at]').waitFor();
      assert.equal(await page.locator('[name=start_at]').inputValue(), c.start);
      assert.equal(await page.locator('[name=end_at]').inputValue(), c.end);
      assert.equal(appointmentWrites, 0);
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
      const view = page.locator('select').filter({ has: page.locator('option[value=month]') });
      stage = c.zone + ' week navigation and time selection';
      await page.getByRole('button', { name: 'Proximo', exact: true }).click();
      await event.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'Hoje', exact: true }).click();
      await event.waitFor();
      stage = c.zone + ' click Tuesday slot at 10h';
      const timeSlot = page.locator('.rbc-day-slot').nth(1).locator('.rbc-time-slot').nth(20);
      await timeSlot.scrollIntoViewIfNeeded();
      const timeBox = await timeSlot.boundingBox();
      assert.ok(timeBox);
      await page.mouse.click(timeBox.x + timeBox.width / 2, timeBox.y + timeBox.height / 2);
      await page.locator('[name=start_at]').waitFor();
      stage = c.zone + ' selected fictional interval ' + await page.locator('[name=start_at]').inputValue() + ' / ' + await page.locator('[name=end_at]').inputValue();
      assert.equal(await page.locator('[name=start_at]').inputValue(), '2020-01-07T10:00');
      assert.equal(await page.locator('[name=end_at]').inputValue(), '2020-01-07T10:30');
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
      stage = c.zone + ' day navigation';
      await view.selectOption('day');
      await event.waitFor();
      assert.ok(Math.abs(await event.evaluate(n => parseFloat(n.style.top)) - c.top) < 0.1);
      await page.getByRole('button', { name: 'Proximo', exact: true }).click();
      await event.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'Hoje', exact: true }).click();
      await event.waitFor();
      stage = c.zone + ' month navigation and day selection';
      await view.selectOption('month');
      await event.waitFor();
      await page.getByRole('button', { name: 'Proximo', exact: true }).click();
      await event.waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: 'Anterior', exact: true }).click();
      await event.waitFor();
      // January 2020 begins on Wednesday; the second row starts Monday January 6.
      stage = c.zone + ' select empty part of clinical day';
      const cell = await page.locator('.rbc-month-row').nth(1).locator('.rbc-day-bg').nth(1).boundingBox();
      assert.ok(cell);
      await page.mouse.click(cell.x + cell.width / 2, cell.y + cell.height - 12);
      await page.locator('[name=start_at]').waitFor();
      assert.equal(await page.locator('[name=start_at]').inputValue(), '2020-01-07T00:00');
      assert.equal(await page.locator('[name=end_at]').inputValue(), '2020-01-08T00:00');
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
      assert.equal(appointmentWrites, 0);
      stage = c.zone + ' create from calendar';
      await page.getByRole('button', { name: 'Nova consulta', exact: true }).click();
      await page.locator('[name=start_at]').waitFor();
      const index = cases.indexOf(c), patient = input.creations[index];
      for (const [field, label] of [['patient_id', patient.full_name], ['dentist_id', input.dentistName]]) {
        if (field === 'patient_id') { await page.locator('[name=patient_id]').selectOption(patient.id); continue; }
        const group = page.locator('select[name=' + field + ']').locator('..');
        await group.locator('input').fill(label);
        await group.getByRole('button', { name: label, exact: true }).click();
      }
      const day = String(8 + index).padStart(2, '0');
      await page.locator('[name=start_at]').fill('2020-01-' + day + 'T09:00');
      await page.locator('[name=end_at]').fill('2020-01-' + day + 'T10:00');
      const created = page.waitForResponse(r => r.url().endsWith('/api/appointments') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Salvar', exact: true }).click();
      const saved = await created;
      assert.equal(saved.status(), 201);
      assert.equal(saved.request().postDataJSON().start_at, '2020-01-' + day + 'T12:00:00.000Z');
      assert.equal(saved.request().postDataJSON().end_at, '2020-01-' + day + 'T13:00:00.000Z');
      assert.equal(appointmentWrites, 1);
      await page.locator('[name=start_at]').waitFor({ state: 'hidden' });
      if (index > 0) {
        stage = c.zone + ' reopen previous workstation creation';
        await page.goto('https://localhost:18444/appointments');
        await page.getByRole('row').filter({ hasText: input.creations[index - 1].full_name }).getByRole('button', { name: 'Editar', exact: true }).click();
        await page.locator('[name=start_at]').waitFor();
        assert.equal(await page.locator('[name=start_at]').inputValue(), '2020-01-' + String(7 + index).padStart(2, '0') + 'T09:00');
        stage = c.zone + ' reschedule and cancel previous workstation creation';
        const previousDay = String(7 + index).padStart(2, '0');
        await page.locator('[name=start_at]').fill('2020-01-' + previousDay + 'T11:00');
        await page.locator('[name=end_at]').fill('2020-01-' + previousDay + 'T12:00');
        const status = page.locator('select[name=status]').locator('..');
        await status.locator('input').click();
        await status.getByRole('button', { name: 'Cancelada', exact: true }).click();
        const updated = page.waitForResponse(r => new URL(r.url()).pathname.startsWith('/api/appointments/') && r.request().method() === 'PUT');
        await page.getByRole('button', { name: 'Salvar', exact: true }).click();
        const changed = await updated;
        assert.equal(changed.status(), 200);
        assert.equal(changed.request().postDataJSON().start_at, '2020-01-' + previousDay + 'T14:00:00.000Z');
        assert.equal(changed.request().postDataJSON().end_at, '2020-01-' + previousDay + 'T15:00:00.000Z');
        assert.equal(changed.request().postDataJSON().status, 'cancelled');
        assert.equal(changed.request().postDataJSON().version, 1);
        await page.locator('[name=start_at]').waitFor({ state: 'hidden' });
      }
      await context.close();
    }
    console.log('PASS: list/editor/filters, day/month navigation, selection, four UI creations and cross-workstation reopening/rescheduling/cancellation agree in Sao Paulo/UTC/Tokyo/New York.');
  } finally { await browser.close(); }
})().catch(() => { console.error('Appointment timezone acceptance failed at stage: ' + stage); process.exitCode = 1; });
