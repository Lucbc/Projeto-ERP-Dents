// Only fictitious records in the disposable schema. Never emit bodies or credentials.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
let stage='start';
process.on('unhandledRejection',()=>{console.error('Consultation refresh browser failed at stage: '+stage);process.exit(1);});
(async()=>{
 const credentials=JSON.parse(fs.readFileSync(0,'utf8'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const origin='https://localhost:18444';
 try {
  const contexts=await Promise.all([0,1].map(()=>browser.newContext({timezoneId:'America/Sao_Paulo',viewport:{width:1440,height:1200}})));
  const [writer,reader]=await Promise.all(contexts.map(c=>c.newPage()));
  const login=async(page,email,password)=>{
   await page.goto(origin+'/login');await page.locator('[name=email]').fill(email);await page.locator('[name=password]').fill(password);
   const response=page.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.request().method()==='POST');
   await page.getByRole('button',{name:'Entrar',exact:true}).click();const identity=await(await response).json();
   await page.getByRole('region',{name:'Pacientes cadastrados',exact:true}).waitFor();return identity;
  };
  stage='writer login';const author=await login(writer,credentials.email,credentials.password);
  const api=(method,url,data)=>writer.evaluate(async({method,url,data,author})=>{
   const r=await fetch(url,{method,headers:{'Content-Type':'application/json','X-Session-ID':author.session_id,'X-CSRF-Token':author.csrf_token},body:data?JSON.stringify(data):undefined});
   return {status:r.status,body:r.status===204?null:await r.json()};
  },{method,url,data,author});
  stage='fixtures';
  const dentist=(await api('POST','/api/dentists',{full_name:'Fictitious Clinical Dentist',availability:
   ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>({day_of_week:day,start_time:'00:00',end_time:'23:59'}))})).body;
  const patients=[];
  for(const name of ['Alpha','Beta'])patients.push((await api('POST','/api/patients',{full_name:'Fictitious Clinical '+name,phone:'111'})).body);
  const start=new Date();start.setUTCDate(start.getUTCDate()+1);start.setUTCHours(12,0,0,0);
  const visits=[];
  for(let i=0;i<2;i++){
   const result=await api('POST','/api/appointments',{patient_id:patients[i].id,dentist_id:dentist.id,procedure_ids:[],start_at:new Date(+start+i*7200000).toISOString(),end_at:new Date(+start+i*7200000+3600000).toISOString()});
   assert.equal(result.status,201);visits.push(result.body);
  }
  const account=(await api('POST','/api/users',{name:'Fictitious Clinical User',email:'clinical-reader@example.com',password:credentials.password,role:'dentist',dentist_id:dentist.id})).body;
  stage='dentist login';const receiver=await login(reader,account.email,credentials.password);assert.notEqual(author.session_id,receiver.session_id);
  stage='initial consultation';await reader.goto(origin+'/consultation');
  const section=name=>reader.getByRole('region',{name,exact:true});
  const next=section('Próxima consulta'),list=section('Pacientes'),detail=section('Dados do paciente');
  await next.getByText(patients[0].full_name,{exact:true}).waitFor();
  const search=reader.getByRole('textbox',{name:'Buscar pacientes'});await search.fill('Fictitious Clinical');
  await list.getByRole('row').filter({hasText:patients[0].full_name}).getByRole('button',{name:'Abrir',exact:true}).click();
  await detail.getByText('Telefone: 111',{exact:true}).waitFor();
  let reads=0,writes=0,detailReads=0;
  const detailPath='/api/consultations/patients/'+patients[0].id;
  reader.on('request',r=>{const pathname=new URL(r.url()).pathname;if(pathname.startsWith('/api/consultations')&&r.method()==='GET'){reads++;if(pathname===detailPath)detailReads++;}
   if(['POST','PUT','DELETE'].includes(r.method())&&pathname.startsWith('/api/'))writes++;});
  stage='remote detail';const started=Date.now();
  assert.equal((await api('PUT','/api/patients/'+patients[0].id,{version:1,phone:'222'})).status,200);
  await detail.getByText('Telefone: 222',{exact:true}).waitFor({timeout:25000});const latency=Date.now()-started;
  assert.ok(latency<25000);assert.equal(await search.inputValue(),'Fictitious Clinical');
  stage='remote reschedule';assert.equal((await api('PUT','/api/appointments/'+visits[0].id,{version:1,start_at:new Date(+start+14400000).toISOString(),end_at:new Date(+start+18000000).toISOString()})).status,200);
  await next.getByText(patients[1].full_name,{exact:true}).waitFor({timeout:25000});await detail.getByText('Telefone: 222',{exact:true}).waitFor();
  assert.equal(await search.inputValue(),'Fictitious Clinical');assert.equal(writes,0);
  stage='transient detail error';const detailPattern=new RegExp('/api/consultations/patients/'+patients[0].id+'(?:\\?.*)?$');
  await reader.route(detailPattern,route=>route.fulfill({status:503,contentType:'application/json',body:'{"detail":"Fictitious unavailable"}'}));
  await detail.getByRole('button',{name:'Atualizar dados do paciente',exact:true}).click();
  await detail.getByText(/Não foi possível atualizar dados do paciente/).waitFor();await detail.getByText('Telefone: 222',{exact:true}).waitFor();
  await reader.screenshot({path:path.resolve(__dirname,'../.data/homolog/consultation-partial-light.png'),fullPage:true});
  await reader.getByRole('button',{name:'Modo escuro',exact:true}).click();
  await reader.screenshot({path:path.resolve(__dirname,'../.data/homolog/consultation-partial-dark.png'),fullPage:true});
  await reader.unroute(detailPattern);await detail.getByRole('button',{name:'Atualizar dados do paciente',exact:true}).click();
  await detail.getByText('Atualização automática ativa.',{exact:true}).waitFor();
  stage='cancel and delete visits';assert.equal((await api('PUT','/api/appointments/'+visits[1].id,{version:1,status:'cancelled'})).status,200);
  await next.getByText(patients[0].full_name,{exact:true}).waitFor({timeout:25000});
  assert.equal((await api('DELETE','/api/appointments/'+visits[0].id+'?version=2')).status,204);
  await next.getByText('Não há próxima consulta agendada.',{exact:true}).waitFor({timeout:25000});
  await detail.getByText('Sem próxima consulta agendada para este paciente.',{exact:true}).waitFor({timeout:25000});
  stage='hidden pause';await reader.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
  await reader.waitForTimeout(1000);const hidden=reads;await reader.waitForTimeout(17000);assert.equal(reads,hidden);
  await reader.evaluate(()=>{delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'));});
  stage='patient deletion';const preview=(await api('GET','/api/patients/'+patients[0].id+'/deletion-preview?version=2')).body;
  assert.equal((await api('DELETE','/api/patients/'+patients[0].id+'?version=2&exams_fingerprint='+encodeURIComponent(preview.exams_fingerprint))).status,204);
  await detail.getByText(/Este paciente não está mais disponível/).waitFor({timeout:25000});
  assert.equal(await detail.getByText('Telefone: 222',{exact:true}).count(),0);assert.equal(await search.inputValue(),'Fictitious Clinical');
  await list.getByRole('row').filter({hasText:patients[0].full_name}).waitFor({state:'hidden',timeout:25000});
  const missingReads=detailReads;await reader.waitForTimeout(17000);assert.equal(detailReads,missingReads);
  await detail.getByRole('button',{name:'Verificar paciente novamente',exact:true}).click();
  await reader.waitForTimeout(1000);assert.equal(detailReads,missingReads+1);assert.equal(await detail.getByText('Telefone: 222',{exact:true}).count(),0);
  stage='permission revocation';const matrix=(await api('GET','/api/permissions')).body.items.find(item=>item.role==='dentist');
  matrix.permissions.consultations.view=false;
  assert.equal((await api('PUT','/api/permissions/dentist',{version:matrix.version,permissions:matrix.permissions})).status,200);
  await reader.getByText('Sem permissão para acessar esta página.',{exact:true}).waitFor({timeout:25000});
  assert.equal(await list.count(),0);assert.equal(await detail.count(),0);assert.equal(writes,0);
  console.log('PASS: admin/dentist sessions; detail update in '+latency+' ms; '+reads+' clinical GETs across scenario; search/selection preserved; reschedule/cancel/delete; 503 recovery; hidden pause; missing detail hidden with manual-only verification; permission revocation; no automatic writes; light/dark.');
 } finally {await browser.close();}
})().catch(()=>{console.error('Consultation refresh browser failed at stage: '+stage);process.exitCode=1;});
