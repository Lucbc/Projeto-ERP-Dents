const fs = require('node:fs'), assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
(async()=>{
  const credentials = JSON.parse(fs.readFileSync(0,'utf8'));
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const origin = 'https://localhost:18444';
    await page.goto(origin+'/login');
    await page.locator('[name=email]').fill(credentials.email);
    await page.locator('[name=password]').fill(credentials.password);
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await page.getByRole('region',{name:'Pacientes cadastrados',exact:true}).waitFor();
    await page.goto(origin+'/patients');
    let creates=0, updates=0, dialogs=0;
    page.on('request',r=>{
      if(new URL(r.url()).pathname==='/api/patients' && r.method()==='POST') creates++;
      if(new URL(r.url()).pathname.startsWith('/api/patients/') && r.method()==='PUT') updates++;
    });
    let accept=false, expectedType='confirm';
    page.on('dialog',async dialog=>{
      dialogs++; assert.equal(dialog.type(),expectedType);
      await (accept ? dialog.accept() : dialog.dismiss());
    });
    const open=()=>page.getByRole('button',{name:'Novo',exact:true}).click();
    const name=()=>page.locator('[name=full_name]');
    const notes=()=>page.locator('[name=notes]');
    stage='clean close';
    await open();
    await page.getByRole('button',{name:'Cancelar',exact:true}).click();
    assert.equal(dialogs,0);
    stage='cancel, close button and backdrop preserve declined draft';
    await open(); await name().fill('Fictitious Unsaved Patient');
    for(const close of [
      ()=>page.getByRole('button',{name:'Cancelar',exact:true}).click(),
      ()=>page.getByRole('button',{name:'x',exact:true}).click(),
      ()=>page.mouse.click(2,2),
    ]) {
      const before=dialogs; await close();
      assert.equal(dialogs,before+1);
      assert.equal(await name().inputValue(),'Fictitious Unsaved Patient');
    }
    stage='reload declined preserves draft';
    expectedType='beforeunload';
    const before=dialogs;
    await page.reload().catch(()=>{});
    assert.equal(dialogs,before+1);
    assert.equal(await name().inputValue(),'Fictitious Unsaved Patient');
    stage='explicit discard';
    expectedType='confirm'; accept=true;
    await page.getByRole('button',{name:'Cancelar',exact:true}).click();
    assert.equal(await name().count(),0);
    await open(); assert.equal(await name().inputValue(),'');
    stage='explicit save removes warning';
    await name().fill('Fictitious Saved Patient');
    await notes().fill('Fictitious saved note');
    const saved=page.waitForResponse(r=>r.url().endsWith('/api/patients') && r.request().method()==='POST');
    await page.getByRole('button',{name:'Salvar',exact:true}).click();
    assert.equal((await saved).status(),201);
    await name().waitFor({state:'detached'});
    const savedDialogs=dialogs;
    await page.reload();
    await page.getByRole('button',{name:'Editar',exact:true}).waitFor();
    assert.equal(dialogs,savedDialogs);
    stage='edit reload accepted discards only unsaved changes';
    await page.getByRole('button',{name:'Editar',exact:true}).click();
    assert.equal(await notes().inputValue(),'Fictitious saved note');
    await notes().fill('Fictitious discarded edit');
    expectedType='beforeunload';
    await page.reload();
    assert.equal(dialogs,savedDialogs+1);
    await page.getByRole('button',{name:'Editar',exact:true}).click();
    assert.equal(await notes().inputValue(),'Fictitious saved note');
    assert.equal(creates,1); assert.equal(updates,0);
    assert.equal(await page.evaluate(()=>[localStorage,sessionStorage].some(storage=>
      Object.values(storage).some(value=>String(value).includes('Fictitious')))),false);
    console.log('PASS: clean close without prompt; Cancel/X/backdrop and declined reload preserve draft; explicit discard and accepted reload; save clears guard; no draft storage or automatic writes.');
  } finally {await browser.close();}
})().catch(()=>{console.error('Registration pilot failed at stage: '+stage);process.exit(1);});
