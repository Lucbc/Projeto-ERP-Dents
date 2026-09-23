// Two dentist drafts in Chrome; only fictitious homologation data.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const state=path.resolve(__dirname,'../.data/homolog');
let stage='start';
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({ignoreHTTPSErrors:false,viewport:{width:1366,height:1000}});
  let api, dentist;
  const specialties=[];
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
    for(const name of ['Fictitious Specialty A','Fictitious Specialty B'])
      specialties.push(await api('POST','/api/specialties',{name}));
    dentist=await api('POST','/api/dentists',{full_name:'Fictitious Dentist Version UI',
      specialty:specialties[0].name,availability:[{day_of_week:'monday',start_time:'08:00',end_time:'18:00'}]});
    const second=await context.newPage();
    stage='open two drafts';
    for(const page of [first,second]) {
      await page.goto('https://localhost:18443/dentists');
      await page.getByRole('row').filter({hasText:dentist.full_name}).getByRole('button',{name:'Editar',exact:true}).click();
    }
    const start=page=>page.locator('[name="availability.0.start_time"]');
    const specialty=page=>page.locator('select[name=specialty]');
    await start(first).fill('09:00');
    await start(second).fill('10:00');
    const specialtyControl=specialty(second).locator('..');
    await specialtyControl.locator('input').fill(specialties[1].name);
    await specialtyControl.getByRole('button',{name:specialties[1].name,exact:true}).click();
    await second.getByRole('button',{name:'Adicionar horario',exact:true}).click();
    stage='first operator saves';
    const saved=first.waitForResponse(r=>r.url().endsWith('/api/dentists/'+dentist.id)&&r.request().method()==='PUT');
    await first.getByRole('button',{name:'Salvar',exact:true}).click();
    assert.equal((await saved).status(),200);
    stage='stale draft conflicts';
    const conflict=second.waitForResponse(r=>r.url().endsWith('/api/dentists/'+dentist.id)&&r.request().method()==='PUT');
    await second.getByRole('button',{name:'Salvar',exact:true}).click();
    assert.equal((await conflict).status(),409);
    const reload=second.getByRole('button',{name:'Descartar rascunho e carregar atual',exact:true});
    await reload.waitFor();
    assert.equal(await start(second).inputValue(),'10:00');
    assert.equal(await specialty(second).inputValue(),specialties[1].name);
    assert.equal(await second.locator('[name="availability.1.start_time"]').count(),1);
    const winner=await api('GET','/api/dentists/'+dentist.id);
    assert.equal(winner.specialty,specialties[0].name);
    assert.deepEqual(winner.availability,[{day_of_week:'monday',start_time:'09:00',end_time:'18:00'}]);
    await second.screenshot({path:path.join(state,'dentist-conflict-schedule.png'),fullPage:true});
    await reload.scrollIntoViewIfNeeded();
    await second.screenshot({path:path.join(state,'dentist-conflict-recovery.png'),fullPage:true});
    stage='explicit reload and reviewed save';
    await reload.click();
    await reload.waitFor({state:'hidden'});
    assert.equal(await start(second).inputValue(),'09:00');
    assert.equal(await specialty(second).inputValue(),specialties[0].name);
    assert.equal(await specialty(second).locator('..').locator('input').inputValue(),specialties[0].name);
    assert.equal(await second.locator('[name="availability.1.start_time"]').count(),0);
    await second.locator('[name=full_name]').fill('Reviewed Fictitious Dentist Version UI');
    const reviewed=second.waitForResponse(r=>r.url().endsWith('/api/dentists/'+dentist.id)&&r.request().method()==='PUT');
    await second.getByRole('button',{name:'Salvar',exact:true}).click();
    assert.equal((await reviewed).status(),200);
    const current=await api('GET','/api/dentists/'+dentist.id);
    assert.equal(current.version,3);
    assert.equal(current.full_name,'Reviewed Fictitious Dentist Version UI');
    assert.equal(current.specialty,winner.specialty);
    assert.deepEqual(current.availability,winner.availability);
    console.log('OK: two Chrome drafts; specialty/schedule conflict, preserved draft, explicit reload and reviewed save passed.');
  } finally {
    try {
      if(api) {
        if(dentist) await api('DELETE','/api/dentists/'+dentist.id);
        for(const specialty of specialties) await api('DELETE','/api/specialties/'+specialty.id+'?version='+(await api('GET','/api/specialties/'+specialty.id)).version);
        await api('POST','/api/auth/logout');
      }
    } finally { await browser.close(); }
  }
})().catch(()=>{console.error('Dentist browser test failed at: '+stage+'; inspect fictitious fixtures locally if cleanup failed.');process.exitCode=1;});
