// Fictitious historical fixtures; stage-only failures, no credentials or response dumps.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
(async () => {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const observations = [];
  try {
    for (const zone of ['America/Sao_Paulo', 'UTC', 'Asia/Tokyo', 'America/New_York']) {
      const context = await browser.newContext({ timezoneId: zone, viewport: { width: 1440, height: 1100 } });
      const page = await context.newPage();
      stage = zone + ' login';
      await page.goto('https://localhost:18444/login');
      await page.locator('[name=email]').fill(input.email);
      await page.locator('[name=password]').fill(input.password);
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await page.getByRole('region', { name: 'Pacientes cadastrados', exact: true }).waitFor();
      let writes = 0;
      page.on('request', r => {
        if (new URL(r.url()).pathname.startsWith('/api/appointments') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(r.method())) writes++;
      });
      for (const fixture of input.cases) {
        stage = zone + ' ' + fixture.key + ' load';
        await page.clock.setFixedTime(new Date(fixture.start));
        await page.goto('https://localhost:18444/calendar');
        const event = page.locator('.rbc-event').filter({ hasText: fixture.name });
        await event.first().waitFor();
        const view = page.locator('select').filter({ has: page.locator('option[value=month]') });
        for (const mode of ['week', 'day', 'month']) {
          stage = zone + ' ' + fixture.key + ' ' + mode;
          await view.selectOption(mode);
          await event.first().waitFor();
          const geometry = await event.evaluateAll(nodes => nodes.map(n => ({
            top: n.style.top, height: n.style.height,
            column: [...document.querySelectorAll('.rbc-day-slot')].indexOf(n.closest('.rbc-day-slot')),
            segment: n.parentElement.style.flexBasis,
            width: n.getBoundingClientRect().width, heightPx: n.getBoundingClientRect().height,
          })));
          assert.ok(geometry.every(g => g.width > 0 && g.heightPx > 0));
          const baseline = observations.find(o => o.fixture === fixture.key && o.mode === mode);
          observations.push({ zone, fixture: fixture.key, mode, geometry });
          fs.writeFileSync(path.resolve(__dirname, '../.data/homolog/calendar-history.json'), JSON.stringify(observations, null, 2));
          stage = zone + ' ' + fixture.key + ' ' + mode + ' cross-zone geometry';
          if (baseline) assert.deepEqual(geometry, baseline.geometry, 'Workstation timezone changed geometry');
          if (mode === 'month') {
            const occupiedDays = geometry.reduce((sum, g) => sum + parseFloat(g.segment) * 7 / 100, 0);
            assert.ok(Math.abs(occupiedDays - (fixture.key === 'multiday' ? 3 : 1)) < 0.001);
          } else if (fixture.key !== 'multiday') {
            assert.equal(geometry.length, 1);
            assert.equal(geometry[0].column, mode === 'day' ? 0 : fixture.key === 'short-day' ? 6 : 5);
          }
          await event.first().click();
          await page.locator('[name=start_at]').waitFor();
          assert.equal(await page.locator('[name=start_at]').inputValue(), fixture.localStart);
          assert.equal(await page.locator('[name=end_at]').inputValue(), fixture.localEnd);
          await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
          if (zone === 'America/Sao_Paulo') await page.screenshot({
            path: path.resolve(__dirname, '../.data/homolog/calendar-history-' + fixture.key + '-' + mode + '.png'),
            fullPage: true, animations: 'disabled',
          });
          if (fixture.key === 'multiday' && mode === 'day') {
            // End is exclusive: March 7/8/9 occupied, March 10 empty.
            for (let day = 8; day <= 10; day++) {
              await page.getByRole('button', { name: 'Proximo', exact: true }).click();
              await event.first().waitFor({ state: day === 10 ? 'hidden' : 'visible' });
            }
            await page.getByRole('button', { name: 'Hoje', exact: true }).click();
            await event.first().waitFor();
          }
          if (fixture.key === 'multiday' && mode === 'week') {
            await page.getByRole('button', { name: 'Proximo', exact: true }).click();
            await event.first().waitFor();
            assert.ok(Math.abs(await event.first().evaluate(n => parseFloat(n.parentElement.style.flexBasis)) - 100 / 7) < 0.001);
            await page.getByRole('button', { name: 'Hoje', exact: true }).click();
            await event.first().waitFor();
          }
        }
      }
      assert.equal(writes, 0);
      await context.close();
    }
    fs.writeFileSync(path.resolve(__dirname, '../.data/homolog/calendar-history.json'), JSON.stringify(observations, null, 2));
    console.log('PASS: historical short/long days and multiday fixtures in 36 views; identical geometry and original editor values in four workstation zones; three occupied days, exclusive end, continuation across weeks; zero appointment writes.');
  } finally { await browser.close(); }
})().catch(() => { console.error('Agenda refresh browser failed at stage: ' + stage); process.exitCode = 1; });
