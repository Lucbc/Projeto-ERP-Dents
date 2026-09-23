// Two procedure drafts in Chrome; only fictitious homologation data.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const state=path.resolve(__dirname,'../.data/homolog');
let stage='start';
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({ignoreHTTPSErrors:false,viewport:{width:1366,height:1000}});
  let api, procedure;
  try {
    const first=await context.newPage();
    stage='login';
    await first.goto('https://localhost:18443/login');
    const credentials=JSON.parse(fs.readFileSync(path.join(state,'admin.json'),'utf8'));
    await first.locator('input[name=email]').fill(credentials.email);
    await first.locator('input[name=password]').fill(credentials.password);
    const loginResponse=first.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.request().method()==='POST');
    await first.getByRole('button',{name:'Entrar',exact:true}).click();
    const login=await(await loginResponse).json();
    await first.getByText('Pacientes cadastrados',{exact:true}).waitFor();
    const headers={'Content-Type':'application/json','X-Session-ID':login.session_id,'X-CSRF-Token':login.csrf_token};
    api=async(method,url,data)=>first.evaluate(async({method,url,data,headers})=>{
      const response=await fetch(url,{method,headers,body:data?JSON.stringify(data):undefined});
      if(!response.ok) throw new Error('Fictitious fixture operation failed');
      return response.status===204?null:response.json();
    },{method,url,data,headers});
    procedure=await api('POST','/api/procedures',{name:'Fictitious Procedure Version UI',price_cents:12000,duration_minutes:30});
    const second=await context.newPage();
    stage='open two drafts';
    for(const page of [first,second]) {
      await page.goto('https://localhost:18443/procedures');
      await page.getByRole('row').filter({hasText:procedure.name}).getByRole('button',{name:'Editar',exact:true}).click();
    }
    await first.locator('input[name=price]').fill('123,45');
    await first.locator('[name=duration_minutes]').fill('45');
    await second.locator('input[name=price]').fill('234,56');
    await second.locator('[name=duration_minutes]').fill('60');
    stage='first operator saves';
    const saved=first.waitForResponse(r=>r.url().endsWith('/api/procedures/'+procedure.id)&&r.request().method()==='PUT');
    await first.getByRole('button',{name:'Salvar',exact:true}).click();
    assert.equal((await saved).status(),200);
    stage='stale draft conflicts';
    const conflict=second.waitForResponse(r=>r.url().endsWith('/api/procedures/'+procedure.id)&&r.request().method()==='PUT');
    await second.getByRole('button',{name:'Salvar',exact:true}).click();
    assert.equal((await conflict).status(),409);
    const reload=second.getByRole('button',{name:'Descartar rascunho e carregar atual',exact:true});
    await reload.waitFor();
    assert.equal(await second.locator('input[name=price]').inputValue(),'234,56');
    assert.equal(await second.locator('[name=duration_minutes]').inputValue(),'60');
    assert.equal((await api('GET','/api/procedures/'+procedure.id)).price_cents,12345);
    await second.screenshot({path:path.join(state,'procedure-conflict.png'),fullPage:true});
    await reload.scrollIntoViewIfNeeded();
    await second.screenshot({path:path.join(state,'procedure-conflict-recovery.png'),fullPage:true});
    stage='explicit reload and reviewed save';
    await reload.click();
    await reload.waitFor({state:'hidden'});
    assert.equal(await second.locator('input[name=price]').inputValue(),'123,45');
    assert.equal(await second.locator('[name=duration_minutes]').inputValue(),'45');
    await second.locator('input[name=price]').fill('321,09');
    const reviewed=second.waitForResponse(r=>r.url().endsWith('/api/procedures/'+procedure.id)&&r.request().method()==='PUT');
    await second.getByRole('button',{name:'Salvar',exact:true}).click();
    assert.equal((await reviewed).status(),200);
    const current=await api('GET','/api/procedures/'+procedure.id);
    assert.equal(current.version,3);
    assert.equal(current.price_cents,32109);
    assert.equal(current.duration_minutes,45);
    console.log('OK: two Chrome drafts; stale edit rejected, draft preserved, explicit reload and reviewed save passed.');
  } finally {
    try {
      if(api) { if(procedure) await api('DELETE','/api/procedures/'+procedure.id+'?version='+(await api('GET','/api/procedures/'+procedure.id)).version); await api('POST','/api/auth/logout'); }
    } finally { await browser.close(); }
  }
})().catch(()=>{console.error('Procedure browser test failed at: '+stage+'; inspect fictitious fixtures locally if cleanup failed.');process.exitCode=1;});
