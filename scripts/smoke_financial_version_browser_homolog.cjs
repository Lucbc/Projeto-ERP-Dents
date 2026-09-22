// Real Chrome, fictitious financial drafts and stale row actions in homologation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const state=path.resolve(__dirname,'../.data/homolog');
let stage='start';
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({ignoreHTTPSErrors:false,viewport:{width:1440,height:1100}});
  let api,entry;
  try {
    const first=await context.newPage();
    stage='login';
    await first.goto('https://localhost:18443/login');
    const credentials=JSON.parse(fs.readFileSync(path.join(state,'admin.json'),'utf8'));
    await first.locator('input[name=email]').fill(credentials.email);
    await first.locator('input[name=password]').fill(credentials.password);
    const response=first.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.request().method()==='POST');
    await first.getByRole('button',{name:'Entrar',exact:true}).click();
    const login=await(await response).json();
    await first.getByText('Pacientes cadastrados',{exact:true}).waitFor();
    const headers={'Content-Type':'application/json','X-Session-ID':login.session_id,'X-CSRF-Token':login.csrf_token};
    api=async(method,url,data)=>first.evaluate(async({method,url,data,headers})=>{
      const result=await fetch(url,{method,headers,body:data?JSON.stringify(data):undefined});
      if(!result.ok) throw new Error('Fictitious fixture operation failed');
      return result.status===204?null:result.json();
    },{method,url,data,headers});
    entry=await api('POST','/api/financial',{entry_type:'income',description:'Fictitious Financial Version '+Date.now(),
      amount_cents:12000,due_date:new Date().toISOString().slice(0,10)});
    const endpoint='/api/financial/'+entry.id;
    const second=await context.newPage();
    const row=page=>page.getByRole('row').filter({hasText:entry.description});
    const save=async(page)=>{
      const pending=page.waitForResponse(r=>r.url().endsWith(endpoint)&&r.request().method()==='PUT');
      await page.getByRole('button',{name:'Salvar',exact:true}).click();
      return pending;
    };
    stage='open payment and old draft';
    for(const page of [first,second]) await page.goto('https://localhost:18443/financial');
    await row(second).getByRole('button',{name:'Editar',exact:true}).click();
    await second.locator('[name=amount]').fill('321.09');
    await second.locator('[name=notes]').fill('Fictitious old draft');
    const payment=first.waitForResponse(r=>r.url().endsWith(endpoint+'/mark-paid')&&r.request().method()==='POST');
    await row(first).getByRole('button',{name:'Baixar',exact:true}).click();
    const paidResponse=await payment;
    assert.equal(paidResponse.status(),200);
    const paid=await paidResponse.json();
    stage='old form cannot undo payment';
    assert.equal((await save(second)).status(),409);
    const reload=second.getByRole('button',{name:'Descartar rascunho e carregar atual',exact:true});
    await reload.waitFor();
    assert.equal(await second.locator('[name=amount]').inputValue(),'321.09');
    assert.equal(await second.locator('[name=status]').inputValue(),'pending');
    await reload.scrollIntoViewIfNeeded();
    await second.screenshot({path:path.join(state,'financial-version-conflict.png'),fullPage:true});
    await reload.click(); await reload.waitFor({state:'hidden'});
    assert.equal(await second.locator('[name=status]').inputValue(),'paid');
    await second.locator('[name=notes]').fill('Fictitious reviewed payment');
    assert.equal((await save(second)).status(),200);
    const reviewed=await api('GET',endpoint);
    assert.equal(reviewed.version,3); assert.equal(reviewed.paid_at,paid.paid_at); assert.equal(reviewed.amount_cents,12000);
    stage='two editor drafts';
    for(const page of [first,second]) {
      await page.goto('https://localhost:18443/financial');
      await row(page).getByRole('button',{name:'Editar',exact:true}).click();
    }
    await first.locator('[name=amount]').fill('234.56');
    assert.equal((await save(first)).status(),200);
    await second.locator('[name=notes]').fill('Second stale draft');
    assert.equal((await save(second)).status(),409);
    await second.getByRole('button',{name:'Cancelar',exact:true}).click();
    stage='stale delete rejected and explicit refresh';
    second.once('dialog',dialog=>dialog.accept());
    const deletion=second.waitForResponse(r=>r.url().includes(endpoint+'?version=')&&r.request().method()==='DELETE');
    await row(second).getByRole('button',{name:'Excluir',exact:true}).click();
    assert.equal((await deletion).status(),409);
    const refresh=second.getByRole('button',{name:'Recarregar financeiro',exact:true});
    await refresh.waitFor();
    assert.equal((await api('GET',endpoint)).version,4);
    await second.screenshot({path:path.join(state,'financial-version-action-conflict.png'),fullPage:true});
    await refresh.click(); await refresh.waitFor({state:'hidden'});
    assert.equal((await api('GET',endpoint)).amount_cents,23456);
    console.log('OK: old form cannot undo payment; timestamp preserved after review; two drafts conflict; stale delete rejected without automatic retry.');
  } finally {
    try {
      if(api) {
        if(entry) { const url='/api/financial/'+entry.id; await api('DELETE',url+'?version='+(await api('GET',url)).version); }
        await api('POST','/api/auth/logout');
      }
    } finally { await browser.close(); }
  }
})().catch(()=>{console.error('Financial version browser test failed at: '+stage+'; inspect fictitious fixtures locally if cleanup failed.');process.exitCode=1;});
