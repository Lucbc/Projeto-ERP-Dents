// Fictitious specialty drafts and distinct uniqueness/version errors in real Chrome.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const state=path.resolve(__dirname,'../.data/homolog');
let stage='start';
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({ignoreHTTPSErrors:false,viewport:{width:1366,height:1000}});
  let api,specialty,other;
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
    const suffix=Date.now();
    specialty=await api('POST','/api/specialties',{name:'Fictitious Specialty UI '+suffix});
    other=await api('POST','/api/specialties',{name:'Fictitious Other UI '+suffix});
    const second=await context.newPage();
    const endpoint='/api/specialties/'+specialty.id;
    const submit=async(page)=>{
      const pending=page.waitForResponse(r=>r.url().endsWith(endpoint)&&r.request().method()==='PUT');
      await page.getByRole('button',{name:'Salvar',exact:true}).click();
      return pending;
    };
    stage='open two drafts';
    for(const page of [first,second]) {
      await page.goto('https://localhost:18443/specialties');
      await page.getByRole('row').filter({hasText:specialty.name}).getByRole('button',{name:'Editar',exact:true}).click();
    }
    stage='duplicate name preserves editable draft';
    await first.locator('input[name=name]').fill(other.name);
    await first.locator('[name=active]').selectOption('false');
    const duplicate=await submit(first);
    assert.equal(duplicate.status(),409);
    assert.equal((await duplicate.json()).code,'specialty_name_exists');
    await first.getByText('Já existe uma especialidade com este nome. Escolha outro nome para salvar.',{exact:true}).waitFor();
    assert.equal(await first.getByRole('button',{name:'Descartar rascunho e carregar atual'}).count(),0);
    assert.equal(await first.locator('input[name=name]').inputValue(),other.name);
    assert.equal(await first.locator('[name=active]').inputValue(),'false');
    assert.equal((await api('GET',endpoint)).version,1);
    await first.screenshot({path:path.join(state,'specialty-duplicate.png'),fullPage:true});
    stage='correct duplicate with same version';
    await first.locator('input[name=name]').fill('Fictitious Winner '+suffix);
    assert.equal((await submit(first)).status(),200);
    stage='stale draft conflicts';
    await second.locator('input[name=name]').fill('Fictitious Draft '+suffix);
    const conflict=await submit(second);
    assert.equal(conflict.status(),409);
    assert.equal((await conflict.json()).code,'stale_version');
    const reload=second.getByRole('button',{name:'Descartar rascunho e carregar atual',exact:true});
    await reload.waitFor();
    assert.equal(await second.locator('input[name=name]').inputValue(),'Fictitious Draft '+suffix);
    assert.equal(await second.locator('[name=active]').inputValue(),'true');
    const winner=await api('GET',endpoint);
    assert.equal(winner.version,2);
    assert.equal(winner.active,false);
    await second.screenshot({path:path.join(state,'specialty-conflict.png'),fullPage:true});
    stage='explicit reload and reviewed save';
    await reload.click();
    await reload.waitFor({state:'hidden'});
    assert.equal(await second.locator('input[name=name]').inputValue(),winner.name);
    assert.equal(await second.locator('[name=active]').inputValue(),'false');
    await second.locator('input[name=name]').fill('Fictitious Reviewed '+suffix);
    assert.equal((await submit(second)).status(),200);
    const current=await api('GET',endpoint);
    assert.equal(current.version,3);
    assert.equal(current.name,'Fictitious Reviewed '+suffix);
    assert.equal(current.active,false);
    console.log('OK: duplicate name corrected without reload; two drafts reject stale version, preserve draft, explicitly reload and save reviewed data.');
  } finally {
    try {
      if(api) {
        if(specialty) await api('DELETE','/api/specialties/'+specialty.id);
        if(other) await api('DELETE','/api/specialties/'+other.id);
        await api('POST','/api/auth/logout');
      }
    } finally { await browser.close(); }
  }
})().catch(()=>{console.error('Specialty browser test failed at: '+stage+'; inspect fictitious fixtures locally if cleanup failed.');process.exitCode=1;});
