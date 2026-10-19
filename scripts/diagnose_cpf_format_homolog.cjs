// Historical diagnosis of v0.1.7. These assertions document defects, not desired behavior.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
(async () => {
  const credentials = JSON.parse(fs.readFileSync(0, 'utf8'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await (await browser.newContext()).newPage();
    await page.goto('https://localhost:18444/login');
    await page.locator('[name=email]').fill(credentials.email);
    await page.locator('[name=password]').fill(credentials.password);
    const logged = page.waitForResponse(r => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST');
    await page.getByRole('button', {name:'Entrar',exact:true}).click();
    const identity = await (await logged).json();
    await page.getByRole('region', {name:'Pacientes cadastrados',exact:true}).waitFor();
    const api = async (method, url, data, expected = 200) => {
      const result = await page.evaluate(async ({identity,method,url,data}) => {
        const response = await fetch(url, {method, headers:{'Content-Type':'application/json',
          'X-Session-ID':identity.session_id,'X-CSRF-Token':identity.csrf_token},
          body:data ? JSON.stringify(data) : undefined});
        return {status:response.status,body:await response.json()};
      }, {identity,method,url,data});
      assert.equal(result.status,expected,'Unexpected diagnostic HTTP status');
      return result.body;
    };
    stage = 'API formats and persisted values';
    // Synthetic documents only; never real patient data.
    for (const cpf of ['123', 'DOC-FICTICIO-123', '123456789012', '00000000000', null]) {
      let record = await api('POST','/api/patients',{full_name:'Diagnostico Documento Ficticio',cpf},201);
      assert.equal(record.cpf,cpf);
      assert.equal((await api('GET','/api/patients/'+record.id)).cpf,cpf);
      record = await api('PUT','/api/patients/'+record.id,{version:record.version,notes:'Somente nota ficticia'});
      assert.equal(record.cpf,cpf);
      assert.equal(record.notes,'Somente nota ficticia');
    }
    let changed = await api('POST','/api/patients',{full_name:'Alteracao Documento Ficticio'},201);
    changed = await api('PUT','/api/patients/'+changed.id,{version:changed.version,cpf:'MISTO-FICTICIO-456'});
    assert.equal((await api('GET','/api/patients/'+changed.id)).cpf,'MISTO-FICTICIO-456');
    stage = 'browser input silently transforms documents';
    await page.goto('https://localhost:18444/patients');
    await page.getByRole('button',{name:'Novo',exact:true}).click();
    await page.locator('[name=full_name]').fill('Entrada Documento Ficticio');
    for (const [input, displayed] of [['123456789012','123.456.789-01'],['DOC-FICTICIO-123','123']]) {
      await page.locator('[name=cpf]').fill(input);
      assert.equal(await page.locator('[name=cpf]').inputValue(),displayed);
    }
    const saved = page.waitForResponse(r => r.url().endsWith('/api/patients') && r.request().method() === 'POST');
    await page.getByRole('button',{name:'Salvar',exact:true}).click();
    const response = await saved;
    assert.equal(response.status(),201);
    const created = await response.json();
    assert.equal(created.cpf,'123');
    assert.equal((await api('GET','/api/patients/'+created.id)).cpf,'123');
    console.log('DIAGNOSIS CONFIRMED: API accepts incomplete/mixed/long/repeated-digit CPF; historical notes preserved; browser strips letters/truncates digits and saves incomplete CPF. No application fix asserted.');
  } finally { await browser.close(); }
})().catch(() => { console.error('CPF format diagnosis failed at stage: '+stage); process.exit(1); });
