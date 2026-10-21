// Acceptance of same-document patient draft navigation protection.
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
    const logged = page.waitForResponse(r=>r.url().endsWith('/api/auth/login') && r.request().method()==='POST');
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    const identity = await (await logged).json();
    await page.getByRole('region',{name:'Pacientes cadastrados',exact:true}).waitFor();
    stage='fictional fixture';
    const fixture = await page.evaluate(async identity=>{
      const response=await fetch('/api/patients',{method:'POST',headers:{'Content-Type':'application/json',
        'X-Session-ID':identity.session_id,'X-CSRF-Token':identity.csrf_token},
        body:JSON.stringify({full_name:'Fictitious History Patient',notes:'Fictitious original note'})});
      if(response.status!==201) throw new Error('Fixture creation failed');
      return response.json();
    },identity);
    let writes=0, dialogs=0;
    page.on('request',r=>{
      if(new URL(r.url()).pathname.startsWith('/api/patients') && ['POST','PUT','DELETE'].includes(r.method())) writes++;
    });
    page.on('dialog',async dialog=>{dialogs++;await dialog.dismiss();});
    await page.evaluate(()=>{window.patientHistoryDocumentProbe=true;});
    const unchangedDocument=async()=>assert.equal(await page.evaluate(()=>window.patientHistoryDocumentProbe),true);
    const patients=async()=>{
      await page.getByRole('link',{name:'Pacientes',exact:true}).click();
      await page.waitForURL(origin+'/patients');
    };
    stage='back decision and repeated history preserve new draft';
    await patients();
    await page.getByRole('button',{name:'Novo',exact:true}).click();
    await page.locator('[name=full_name]').fill('Fictitious History Unsaved');
    await page.locator('[name=notes]').fill('Fictitious History Unsaved');
    await page.goBack();
    await page.getByRole('alertdialog',{name:'Sair do cadastro?'}).waitFor();
    await page.waitForURL(origin+'/patients');
    await page.goBack();
    await page.getByRole('alertdialog',{name:'Sair do cadastro?'}).waitFor();
    assert.equal(await page.getByRole('alertdialog').count(),1);
    await page.getByRole('button',{name:'Continuar preenchendo',exact:true}).click();
    assert.equal(await page.locator('[name=notes]').inputValue(),'Fictitious History Unsaved');
    await page.waitForURL(origin+'/patients');
    await page.goBack();
    await page.getByRole('button',{name:'Descartar e sair',exact:true}).click();
    await page.waitForURL(origin+'/');
    await unchangedDocument();
    assert.equal(await page.locator('[name=notes]').count(),0);
    assert.equal(dialogs,0);
    await page.goForward();
    await page.waitForURL(origin+'/patients');
    await page.getByRole('button',{name:'Novo',exact:true}).click();
    assert.equal(await page.locator('[name=full_name]').inputValue(),'');
    assert.equal(await page.locator('[name=notes]').inputValue(),'');
    await page.getByRole('button',{name:'Cancelar',exact:true}).click();
    stage='prepare forward history';
    await page.getByRole('link',{name:'Painel',exact:true}).click();
    await page.waitForURL(origin+'/');
    await page.goBack();
    await page.waitForURL(origin+'/patients');
    stage='forward decision preserves or explicitly discards edited draft';
    await page.getByRole('button',{name:'Editar',exact:true}).click();
    await page.locator('[name=notes]').fill('Fictitious History Edited Draft');
    await page.goForward();
    await page.getByRole('alertdialog',{name:'Sair do cadastro?'}).waitFor();
    await page.waitForURL(origin+'/patients');
    await page.getByRole('button',{name:'Continuar preenchendo',exact:true}).click();
    assert.equal(await page.locator('[name=notes]').inputValue(),'Fictitious History Edited Draft');
    await page.goForward();
    await page.getByRole('button',{name:'Descartar e sair',exact:true}).click();
    await page.waitForURL(origin+'/');
    await unchangedDocument();
    assert.equal(await page.locator('[name=notes]').count(),0);
    assert.equal(dialogs,0);
    await page.goBack();
    await page.waitForURL(origin+'/patients');
    await page.getByRole('button',{name:'Editar',exact:true}).click();
    assert.equal(await page.locator('[name=notes]').inputValue(),'Fictitious original note');
    const stored=await page.evaluate(async ({identity,id})=>{
      const response=await fetch('/api/patients/'+id,{headers:{'X-Session-ID':identity.session_id,
        'X-CSRF-Token':identity.csrf_token}});
      if(response.status!==200) throw new Error('Verification read failed');
      return response.json();
    },{identity,id:fixture.id});
    assert.equal(stored.notes,'Fictitious original note');
    assert.equal(stored.version,fixture.version);
    assert.equal(writes,0);
    assert.equal(await page.evaluate(()=>[localStorage,sessionStorage].some(storage=>
      Object.values(storage).some(value=>String(value).includes('Fictitious History')))),false);
    console.log('PASS: same-document Back/Forward preserve declined drafts and discard only after confirmation; repeated Back has one decision; no automatic write or draft storage; API note/version preserved.');
  } finally {await browser.close();}
})().catch(()=>{console.error('Registration pilot failed at stage: '+stage);process.exit(1);});
