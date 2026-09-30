// Private fictitious schema only. Emit stage names, never request bodies or secrets.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
let stage='start';
process.on('unhandledRejection',()=>{console.error('Agenda refresh browser failed at stage: '+stage);process.exit(1);});
(async()=>{
 const credentials=JSON.parse(fs.readFileSync(0,'utf8'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const contexts=await Promise.all([0,1].map(()=>browser.newContext({timezoneId:'America/Sao_Paulo',viewport:{width:1440,height:1000}})));
  const [writer,reader]=await Promise.all(contexts.map(c=>c.newPage()));
  const identities=[];
  for(const page of [writer,reader]) {
   stage='login';await page.goto('https://localhost:18444/login');
   await page.locator('[name=email]').fill(credentials.email);await page.locator('[name=password]').fill(credentials.password);
   const response=page.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.request().method()==='POST');
   await page.getByRole('button',{name:'Entrar',exact:true}).click();identities.push(await(await response).json());
   await page.getByText('Pacientes cadastrados',{exact:true}).waitFor();
  }
  assert.notEqual(identities[0].session_id,identities[1].session_id);
  const api=(method,url,data)=>writer.evaluate(async({method,url,data,identity})=>{
   const response=await fetch(url,{method,headers:{'Content-Type':'application/json','X-Session-ID':identity.session_id,'X-CSRF-Token':identity.csrf_token},body:data?JSON.stringify(data):undefined});
   return {status:response.status,body:response.status===204?null:await response.json()};
  },{method,url,data,identity:identities[0]});
  stage='fixtures';
  const patient=(await api('POST','/api/patients',{full_name:'Fictitious Live Patient'})).body;
  const dentist=(await api('POST','/api/dentists',{full_name:'Fictitious Live Dentist',availability:
   ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>({day_of_week:day,start_time:'00:00',end_time:'23:59'}))})).body;
  const start=new Date();start.setUTCHours(13,0,0,0);
  const payload={patient_id:patient.id,dentist_id:dentist.id,procedure_ids:[],start_at:start.toISOString(),end_at:new Date(+start+3600000).toISOString()};
  let reads=0,writes=0;
  const listRequest=r=>r.request().method()==='GET'&&new URL(r.url()).pathname==='/api/appointments';
  reader.on('request',r=>{if(new URL(r.url()).pathname==='/api/appointments'&&r.method()==='GET')reads++;if(['POST','PUT','DELETE'].includes(r.method()))writes++;});
  const refresh=()=>reader.getByRole('button',{name:'Atualizar agenda',exact:true});
  const listUrl=/\/api\/appointments(?:\?.*)?$/;
  const waitList=()=>reader.waitForResponse(listRequest,{timeout:25000});
  for(const mode of ['list','calendar']) {
   stage=mode+' initial';await reader.goto('https://localhost:18444/'+(mode==='list'?'appointments':'calendar'));
   await reader.getByText('Atualização automática ativa.',{exact:true}).waitFor();
   const day=start.toISOString().slice(0,10);
   if(mode==='list'){
    await reader.locator('input[type=date]').nth(0).fill(day);
    await reader.locator('input[type=date]').nth(1).fill(day);
    await reader.getByText('Atualização automática ativa.',{exact:true}).waitFor();
   }
   const manual=waitList();await refresh().click();await manual;
   if(mode==='calendar')await reader.getByRole('button',{name:'Modo escuro',exact:true}).click();
   const period=mode==='calendar'?await reader.locator('select').first().inputValue():null;
   const item=()=>mode==='list'?reader.getByRole('row').filter({hasText:patient.full_name}):reader.locator('.rbc-event').filter({hasText:patient.full_name});
   const beforeReads=reads,beforeWrites=writes;
   stage=mode+' remote creation';const started=Date.now();const observed=waitList();const created=await api('POST','/api/appointments',payload);assert.equal(created.status,201);
   const id=created.body.id,url='/api/appointments/'+id;await observed;await item().first().waitFor({timeout:25000});
   const creationMs=Date.now()-started;assert.ok(creationMs<25000);
   assert.ok(reads-beforeReads<=2);assert.equal(writes,beforeWrites);
   stage=mode+' draft';if(mode==='list')await item().getByRole('button',{name:'Editar',exact:true}).click();else await item().first().click();
   await reader.locator('[name=notes]').fill('Fictitious unsaved draft');const originalEnd=await reader.locator('[name=end_at]').inputValue();
   stage=mode+' remote reschedule';const changed=waitList();assert.equal((await api('PUT',url,{version:1,start_at:new Date(+start+7200000).toISOString(),end_at:new Date(+start+10800000).toISOString()})).status,200);
   const remote=await(await changed).json();assert.equal(remote.find(x=>x.id===id).version,2);
   assert.equal(await reader.locator('[name=notes]').inputValue(),'Fictitious unsaved draft');assert.equal(await reader.locator('[name=end_at]').inputValue(),originalEnd);
   assert.equal(writes,beforeWrites);
   stage=mode+' server failure';await reader.route(listUrl,route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'Fictitious unavailable'})}));
   await reader.evaluate(()=>window.dispatchEvent(new Event('focus')));await reader.getByText(/Não foi possível atualizar a agenda/).waitFor();
   assert.equal(await reader.locator('[name=notes]').inputValue(),'Fictitious unsaved draft');await item().first().waitFor();
   await reader.screenshot({path:path.resolve(__dirname,'../.data/homolog/agenda-refresh-'+mode+'.png'),fullPage:true});
   stage=mode+' recovery';await reader.unroute(listUrl);await reader.evaluate(()=>window.dispatchEvent(new Event('focus')));await reader.getByText('Atualização automática ativa.',{exact:true}).waitFor();
   stage=mode+' stale save';const stale=reader.waitForResponse(r=>r.url().endsWith(url)&&r.request().method()==='PUT');
   await reader.getByRole('button',{name:'Salvar',exact:true}).click();assert.equal((await stale).status(),409);
   assert.equal(await reader.locator('[name=notes]').inputValue(),'Fictitious unsaved draft');
   await reader.getByRole('button',{name:'Cancelar',exact:true}).click();
   stage=mode+' visible status';await reader.route(listUrl,route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'Fictitious unavailable'})}));
   await refresh().click();await reader.getByText(/Não foi possível atualizar a agenda/).waitFor();
   await reader.screenshot({path:path.resolve(__dirname,'../.data/homolog/agenda-refresh-status-'+mode+'.png'),fullPage:true});
   await reader.unroute(listUrl);await refresh().click();await reader.getByText('Atualização automática ativa.',{exact:true}).waitFor();
   stage=mode+' remote cancellation';const cancelled=waitList();assert.equal((await api('PUT',url,{version:2,status:'cancelled'})).status,200);assert.equal((await(await cancelled).json()).find(x=>x.id===id).status,'cancelled');
   if(mode==='list'){await item().getByText('Cancelada',{exact:true}).waitFor();assert.equal(await reader.locator('input[type=date]').nth(0).inputValue(),day);assert.equal(await reader.locator('input[type=date]').nth(1).inputValue(),day);}
   else {await reader.waitForFunction(()=>document.querySelector('.rbc-event')?.style.opacity==='0.55');assert.equal(await reader.locator('select').first().inputValue(),period);}
   stage=mode+' hidden';await reader.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
   const hiddenReads=reads;await reader.waitForTimeout(17000);assert.equal(reads,hiddenReads);
   stage=mode+' visible deletion';assert.equal((await api('DELETE',url+'?version=3')).status,204);
   const resumed=waitList();await reader.evaluate(()=>{delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});await resumed;await item().first().waitFor({state:'hidden'});
   console.log(mode+': remote creation observed in '+creationMs+' ms; '+(reads-beforeReads)+' list reads across the scenario; hidden interval issued no reads.');
  }
  console.log('PASS: independent sessions; remote create/reschedule/cancel/delete in list/calendar, bounded reads, preserved drafts and stale versions, no automatic writes, 503 recovery, controlled visibility pause/resume, light/dark screenshots.');
 } finally {await browser.close();}
})().catch(()=>{console.error('Agenda refresh browser failed at stage: '+stage);process.exitCode=1;});
