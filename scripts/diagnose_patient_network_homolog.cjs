// Diagnostic for v0.1.10: these assertions reproduce defects, not release acceptance.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
(async () => {
  const credentials = JSON.parse(fs.readFileSync(0, 'utf8'));
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('https://localhost:18444/login');
    await page.locator('[name=email]').fill(credentials.email);
    await page.locator('[name=password]').fill(credentials.password);
    const login = page.waitForResponse(r=>r.url().endsWith('/api/auth/login') && r.request().method()==='POST');
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    const identity = await (await login).json();
    await page.getByRole('region',{name:'Pacientes cadastrados',exact:true}).waitFor();
    await page.goto('https://localhost:18444/patients');
    await page.getByRole('button',{name:'Novo',exact:true}).click();
    await page.locator('[name=full_name]').fill('Network Lost Response Fictitious');
    await page.locator('[name=notes]').fill('Fictitious retained draft');
    let mode = 'before', writes = 0;
    await page.route('**/api/patients', async route => {
      if (route.request().method() !== 'POST') return route.continue();
      writes++;
      if (mode === 'before') return route.abort('failed');
      if (mode === 'after') {
        const result = await route.fetch({maxRetries:0});
        assert.equal(result.status(),201);
        return route.abort('failed');
      }
      return route.continue();
    });
    const save = () => page.getByRole('button',{name:'Salvar',exact:true});
    const failedSave = async () => {
      const failed = page.waitForEvent('requestfailed',r=>r.url().endsWith('/api/patients') && r.method()==='POST');
      await save().click(); await failed;
      await save().waitFor();
      assert.equal(await save().isEnabled(),true);
      assert.equal(await page.locator('[name=notes]').inputValue(),'Fictitious retained draft');
    };
    stage = 'failure before request';
    await failedSave();
    const total = async name => page.evaluate(async ({name,identity}) => {
      const response = await fetch('/api/patients?search='+encodeURIComponent(name), {
        headers:{'X-Session-ID':identity.session_id,'X-CSRF-Token':identity.csrf_token}});
      if (!response.ok) throw new Error('Diagnostic read failed');
      return (await response.json()).total;
    },{name,identity});
    assert.equal(await total('Network Lost Response Fictitious'),0);
    stage = 'response lost after commit';
    mode = 'after'; await failedSave();
    assert.equal(await total('Network Lost Response Fictitious'),1);
    stage = 'manual retry duplicates without CPF';
    mode = 'pass';
    const created = page.waitForResponse(r=>r.url().endsWith('/api/patients') && r.request().method()==='POST');
    await save().click();
    const createdResponse = await created; assert.equal(createdResponse.status(),201);
    const patient = await createdResponse.json();
    assert.equal(await total('Network Lost Response Fictitious'),2);
    assert.equal(writes,3);
    stage = 'edit response lost after commit';
    await page.getByRole('row').filter({hasText:'Network Lost Response Fictitious'}).first()
      .getByRole('button',{name:'Editar',exact:true}).click();
    let editMode = 'after', editedId;
    await page.route('**/api/patients/*',async route=>{
      if (route.request().method() !== 'PUT') return route.continue();
      editedId = route.request().url().split('/').pop();
      if (editMode === 'after') {
        const result = await route.fetch({maxRetries:0});
        assert.equal(result.status(),200);
        return route.abort('failed');
      }
      return route.continue();
    });
    await page.locator('[name=notes]').fill('Fictitious edit response lost');
    const lostEdit = page.waitForEvent('requestfailed',r=>r.method()==='PUT');
    await save().click(); await lostEdit; await save().waitFor();
    assert.equal(await page.locator('[name=notes]').inputValue(),'Fictitious edit response lost');
    const stored = await page.evaluate(async ({identity,editedId})=>{
      const response = await fetch('/api/patients/'+editedId,{headers:{
        'X-Session-ID':identity.session_id,'X-CSRF-Token':identity.csrf_token}});
      if (!response.ok) throw new Error('Diagnostic read failed');
      return response.json();
    },{identity,editedId});
    assert.equal(stored.notes,'Fictitious edit response lost');
    assert.equal(stored.version,patient.version+1);
    editMode = 'pass';
    const repeatedEdit = page.waitForResponse(r=>r.request().method()==='PUT');
    await save().click(); assert.equal((await repeatedEdit).status(),409);
    await page.getByRole('button',{name:'Descartar rascunho e carregar atual',exact:true}).waitFor();
    assert.equal(await page.locator('[name=notes]').inputValue(),'Fictitious edit response lost');
    await page.getByRole('button',{name:'Cancelar',exact:true}).click();
    stage = 'offline queue';
    await page.getByRole('button',{name:'Novo',exact:true}).click();
    await page.locator('[name=full_name]').fill('Network Offline Fictitious');
    await context.setOffline(true);
    await page.waitForFunction(()=>navigator.onLine===false);
    await save().click();
    await page.getByRole('button',{name:'Salvando...',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Cancelar',exact:true}).isEnabled(),false);
    assert.equal(writes,3);
    stage = 'automatic send after reconnect';
    const resumed = page.waitForResponse(r=>r.url().endsWith('/api/patients') && r.request().method()==='POST');
    await context.setOffline(false);
    assert.equal((await resumed).status(),201);
    assert.equal(await total('Network Offline Fictitious'),1);
    console.log('PASS diagnostic: draft retained; lost creation response permits duplicate retry; lost edit response preserves write and version rejects retry; offline submission locks form and automatically sends on reconnect.');
  } finally { await browser.close(); }
})().catch(()=>{ console.error('Registration pilot failed at stage: '+stage); process.exit(1); });
