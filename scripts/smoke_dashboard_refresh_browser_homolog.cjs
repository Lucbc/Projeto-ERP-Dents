// Private fictitious schema. Diagnostics contain stages/counts only, never payloads.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
let stage='start';
process.on('unhandledRejection',()=>{console.error('Dashboard refresh browser failed at stage: '+stage);process.exit(1);});
(async()=>{
 const credentials=JSON.parse(fs.readFileSync(0,'utf8'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const origin='https://localhost:18444';
 try {
  const context=()=>browser.newContext({timezoneId:'America/Sao_Paulo',viewport:{width:1440,height:1000}});
  const writer=await(await context()).newPage(),reader=await(await context()).newPage();
  const login=async(page,email,password)=>{
   stage='login navigation';await page.goto(origin+'/login');
   stage='login fields';await page.locator('[name=email]').fill(email);await page.locator('[name=password]').fill(password);
   const pending=page.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.request().method()==='POST');
   stage='login submission';await page.getByRole('button',{name:'Entrar',exact:true}).click();const identity=await(await pending).json();
   stage='login panel';try{await page.getByRole('region',{name:'Pacientes cadastrados',exact:true}).waitFor();}
   catch(error){await page.screenshot({path:path.resolve(__dirname,'../.data/homolog/dashboard-login-failure.png'),fullPage:true});throw error;}
   return identity;
  };
  stage='writer login';const author=await login(writer,credentials.email,credentials.password);
  const api=(method,url,data)=>writer.evaluate(async({method,url,data,author})=>{
   const response=await fetch(url,{method,headers:{'Content-Type':'application/json','X-Session-ID':author.session_id,'X-CSRF-Token':author.csrf_token},body:data?JSON.stringify(data):undefined});
   return {status:response.status,body:response.status===204?null:await response.json()};
  },{method,url,data,author});
  stage='reader fixture';const account=(await api('POST','/api/users',{name:'Fictitious Dashboard Reader',email:'dashboard-browser@example.com',password:credentials.password,role:'reception'})).body;
  const receiver=await login(reader,account.email,credentials.password);assert.notEqual(author.session_id,receiver.session_id);
  const indicator=name=>reader.getByRole('region',{name,exact:true});
  const patients=indicator('Pacientes cadastrados'),dentists=indicator('Dentistas cadastrados'),agenda=indicator('Consultas de hoje');
  const count=async(region,value)=>region.getByText(String(value),{exact:true}).waitFor({timeout:25000});
  await count(patients,0);await count(dentists,0);await count(agenda,0);
  let reads=0,writes=0;
  reader.on('request',r=>{if(r.url().includes('/api/')){if(r.method()==='GET')reads++;else if(['POST','PUT','DELETE'].includes(r.method()))writes++;}});
  stage='remote creation';const started=Date.now();
  const patient=(await api('POST','/api/patients',{full_name:'Fictitious Dashboard Patient'})).body;
  const dentist=(await api('POST','/api/dentists',{full_name:'Fictitious Dashboard Dentist',availability:
   ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>({day_of_week:day,start_time:'00:00',end_time:'23:59'}))})).body;
  const start=new Date();start.setUTCHours(13,0,0,0);
  const created=await api('POST','/api/appointments',{patient_id:patient.id,dentist_id:dentist.id,procedure_ids:[],start_at:start.toISOString(),end_at:new Date(+start+3600000).toISOString()});
  assert.equal(created.status,201);const url='/api/appointments/'+created.body.id;
  await count(patients,1);await count(dentists,1);await count(agenda,1);await agenda.getByText(patient.full_name,{exact:true}).waitFor();
  const latency=Date.now()-started;assert.ok(latency<25000);assert.equal(writes,0);assert.ok(reads<=8);
  stage='partial error';const patientUrl=/\/api\/patients(?:\?.*)?$/;
  await reader.route(patientUrl,route=>route.fulfill({status:503,contentType:'application/json',body:'{"detail":"Fictitious unavailable"}'}));
  await patients.getByRole('button',{name:'Atualizar pacientes',exact:true}).click();
  await patients.getByText(/Não foi possível atualizar pacientes/).waitFor();await count(patients,1);await count(dentists,1);await count(agenda,1);
  await reader.screenshot({path:path.resolve(__dirname,'../.data/homolog/dashboard-partial-light.png'),fullPage:true});
  await reader.getByRole('button',{name:'Modo escuro',exact:true}).click();
  await reader.screenshot({path:path.resolve(__dirname,'../.data/homolog/dashboard-partial-dark.png'),fullPage:true});
  await reader.unroute(patientUrl);await patients.getByRole('button',{name:'Atualizar pacientes',exact:true}).click();
  await patients.getByText('Atualização automática ativa.',{exact:true}).waitFor();
  stage='remote cancellation';assert.equal((await api('PUT',url,{version:1,status:'cancelled'})).status,200);
  await agenda.getByText('Status: Cancelada',{exact:true}).waitFor({timeout:25000});await count(agenda,1);
  stage='remote deletion';assert.equal((await api('DELETE',url+'?version=2')).status,204);await count(agenda,0);
  stage='hidden pause';await reader.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
  await reader.waitForTimeout(1000);const hiddenReads=reads;await reader.waitForTimeout(17000);assert.equal(reads,hiddenReads);
  await api('POST','/api/patients',{full_name:'Fictitious Dashboard Second Patient'});
  await reader.evaluate(()=>{delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});await count(patients,2);
  stage='resource revocation';
  let matrix=(await api('GET','/api/permissions')).body.items.find(item=>item.role==='reception');
  const save=async()=>{const result=await api('PUT','/api/permissions/reception',{version:matrix.version,permissions:matrix.permissions});assert.equal(result.status,200);matrix=result.body;};
  matrix.permissions.patients.view=false;await save();await patients.getByText(/Sem permissão para consultar pacientes/).waitFor({timeout:25000});
  assert.equal(await patients.getByText('2',{exact:true}).count(),0);await count(dentists,1);await count(agenda,0);
  stage='page revocation';matrix.permissions.dashboard.view=false;await save();
  await reader.getByText('Sem permissão para acessar esta página.',{exact:true}).waitFor({timeout:25000});
  assert.equal(await reader.getByText('Pacientes cadastrados',{exact:true}).count(),0);assert.equal(writes,0);
  const finalReads=reads;await reader.waitForTimeout(17000);assert.ok(reads-finalReads<=2); // Permissions only; no indicators.
  console.log('Dashboard: creation observed in '+latency+' ms; '+reads+' API GETs across multi-action scenario; no automatic writes; hidden interval issued no reads.');
  // Controlled browser clocks/HTTP responses only; server/OS clocks remain untouched.
  for(const [zone,time,expectedDay] of [['America/Sao_Paulo','2026-10-01T02:59:58Z',1],['Asia/Tokyo','2026-10-01T14:59:58Z',2]]){
   stage='local midnight '+zone;
   const clockContext=await browser.newContext({timezoneId:zone,viewport:{width:1440,height:1000}});
   const page=await clockContext.newPage();
   // Install before application timers; use a past boundary so real session expiry is not crossed.
   await page.clock.install({time:new Date(Date.parse(time)-120000)});
   await login(page,credentials.email,credentials.password);
   const ranges=[];
   await page.route(/\/api\/appointments(?:\?.*)?$/,async route=>{
    const query=new URL(route.request().url()).searchParams;ranges.push({from:query.get('from'),to:query.get('to')});
    await route.fulfill({status:200,contentType:'application/json',body:'[]'});
   });
   stage='clock initial load '+zone;await page.goto(origin+'/');
   await page.getByText('Nenhuma consulta para hoje.',{exact:true}).waitFor();
   await page.clock.pauseAt(new Date(time));
   assert.ok(ranges.length>0);const before=ranges.at(-1);
   stage='clock midnight '+zone;
   await page.clock.runFor(3000);await page.waitForTimeout(100);
   await page.waitForFunction(()=>document.querySelector('h1')?.textContent==='Painel');
   const after=ranges.at(-1);assert.notEqual(before.from,after.from);
   const hours=await page.evaluate(range=>[new Date(range.from).getHours(),new Date(range.to).getHours(),new Date(range.from).getDate()],after);
   assert.deepEqual(hours,[0,23,expectedDay]);
   await clockContext.close();
  }
  console.log('PASS: independent sessions, remote counters/cancel/delete, partial error recovery, light/dark, hidden pause, resource/page revocation, controlled midnight in Sao Paulo and Tokyo.');
 } finally {await browser.close();}
})().catch(()=>{console.error('Dashboard refresh browser failed at stage: '+stage);process.exitCode=1;});
