// Only fictitious data. Never print Playwright errors, request headers or credentials.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
let stage='start';
process.on('unhandledRejection',()=>{console.error('Catalog deletion browser failed at stage: '+stage);process.exit(1);});
(async()=>{
 const credentials=JSON.parse(fs.readFileSync(0,'utf8'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const context=await browser.newContext({ignoreHTTPSErrors:false,viewport:{width:1440,height:1000}});
  const first=await context.newPage(),second=await context.newPage();
  stage='login';await first.goto('https://localhost:18444/login');
  await first.locator('[name=email]').fill(credentials.email);await first.locator('[name=password]').fill(credentials.password);
  const loginResponse=first.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.request().method()==='POST');
  await first.getByRole('button',{name:'Entrar',exact:true}).click();
  const login=await(await loginResponse).json();await first.getByText('Pacientes cadastrados',{exact:true}).waitFor();
  const headers={'Content-Type':'application/json','X-Session-ID':login.session_id,'X-CSRF-Token':login.csrf_token};
  const api=(method,url,data)=>first.evaluate(async({method,url,data,headers})=>{
   const response=await fetch(url,{method,headers,body:data?JSON.stringify(data):undefined});
   return {status:response.status,body:response.status===204?null:await response.json()};
  },{method,url,data,headers});
  for(const resource of ['procedures','specialties']) {
   stage=resource+' creation';
   const created=await api('POST','/api/'+resource,{name:'Fictitious deletion '+resource});assert.equal(created.status,201);
   const item=created.body,endpoint='/api/'+resource+'/'+item.id;
   for(const tab of [first,second]) {await tab.goto('https://localhost:18444/'+resource);await tab.getByText(item.name,{exact:true}).waitFor();}
   stage=resource+' edit';
   await first.getByRole('row').filter({hasText:item.name}).getByRole('button',{name:'Editar',exact:true}).click();
   await first.locator('[name=name]').fill('Fictitious revised '+resource);
   const saved=first.waitForResponse(r=>r.url().endsWith(endpoint)&&r.request().method()==='PUT');
   await first.getByRole('button',{name:'Salvar',exact:true}).click();assert.equal((await saved).status(),200);
   stage=resource+' stale delete';
   second.once('dialog',dialog=>dialog.accept());
   const rejected=second.waitForResponse(r=>r.url().includes(endpoint)&&r.request().method()==='DELETE');
   await second.getByRole('row').filter({hasText:item.name}).getByRole('button',{name:'Excluir',exact:true}).click();
   const response=await rejected;assert.equal(response.status(),409);assert.ok(response.url().endsWith('?version=1'));
   await second.getByRole('button',{name:'Recarregar lista para conferir'}).waitFor();
   assert.equal((await api('GET',endpoint)).body.version,2);
   await second.screenshot({path:path.resolve(__dirname,'../.data/homolog/catalog-deletion-'+resource+'.png'),fullPage:true});
   await second.getByRole('button',{name:'Recarregar lista para conferir'}).click();
   await second.getByText('Fictitious revised '+resource,{exact:true}).waitFor();
   stage=resource+' reviewed delete';
   second.once('dialog',dialog=>dialog.accept());
   const removed=second.waitForResponse(r=>r.url().includes(endpoint)&&r.request().method()==='DELETE');
   await second.getByRole('row').filter({hasText:'Fictitious revised '+resource}).getByRole('button',{name:'Excluir',exact:true}).click();
   assert.equal((await removed).status(),204);assert.equal((await api('GET',endpoint)).status,404);
  }
  stage='linked procedure';
  const procedure=(await api('POST','/api/procedures',{name:'Fictitious linked deletion'})).body;
  const patient=(await api('POST','/api/patients',{full_name:'Fictitious deletion patient'})).body;
  const dentist=(await api('POST','/api/dentists',{full_name:'Fictitious deletion dentist',availability:
   ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>({day_of_week:day,start_time:'00:00',end_time:'23:59'}))})).body;
  const appointment=await api('POST','/api/appointments',{patient_id:patient.id,dentist_id:dentist.id,procedure_ids:[procedure.id],start_at:'2030-01-07T12:00:00Z',end_at:'2030-01-07T13:00:00Z'});
  assert.equal(appointment.status,201);await second.goto('https://localhost:18444/procedures');
  second.once('dialog',dialog=>dialog.accept());
  const rejected=second.waitForResponse(r=>r.request().method()==='DELETE');
  await second.getByRole('row').filter({hasText:procedure.name}).getByRole('button',{name:'Excluir',exact:true}).click();
  assert.equal((await rejected).status(),409);
  await second.getByText(/Este cadastro possui vínculos/).waitFor();
  assert.equal((await api('GET','/api/procedures/'+procedure.id)).status,200);
  console.log('Chrome HTTPS: both catalogs reject stale deletion, require reload/new confirmation, delete reviewed versions and preserve linked procedures.');
 } finally {await browser.close();}
})().catch(()=>{console.error('Catalog deletion browser failed at stage: '+stage);process.exitCode=1;});
