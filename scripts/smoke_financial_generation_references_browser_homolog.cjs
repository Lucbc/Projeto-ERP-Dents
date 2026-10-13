// Disposable fictitious fixtures only. Never print credentials or response bodies.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
let stage='start';
process.on('unhandledRejection',()=>{console.error('Financial refresh browser failed at stage: '+stage);process.exit(1);});
(async()=>{
 const credentials=JSON.parse(fs.readFileSync(0,'utf8')),origin='https://localhost:18444';
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const contexts=await Promise.all([0,1].map(()=>browser.newContext({timezoneId:'America/Sao_Paulo',viewport:{width:1440,height:1100}})));
  const [writer,reader]=await Promise.all(contexts.map(c=>c.newPage()));
  const login=async(page,email)=>{await page.goto(origin+'/login');await page.locator('[name=email]').fill(email);await page.locator('[name=password]').fill(credentials.password);
   const response=page.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.request().method()==='POST');await page.getByRole('button',{name:'Entrar',exact:true}).click();const identity=await(await response).json();await page.getByText('Pacientes cadastrados',{exact:true}).waitFor();return identity;};
  stage='author login';const author=await login(writer,credentials.email);
  const api=async(method,url,data)=>{const result=await writer.evaluate(async({method,url,data,author})=>{
   const response=await fetch(url,{method,headers:{'Content-Type':'application/json','X-Session-ID':author.session_id,'X-CSRF-Token':author.csrf_token},body:data?JSON.stringify(data):undefined});return {status:response.status,body:response.status===204?null:await response.json()};
  },{method,url,data,author});assert.ok([200,201,204].includes(result.status),'Fixture request rejected');return result.body;};
  stage='fixtures';const account=await api('POST','/api/users',{name:'Fictitious Generation Operator',email:'generation-reference@example.com',password:credentials.password,role:'reception'});
  let matrix=(await api('GET','/api/permissions')).items.find(x=>x.role==='reception');
  matrix.permissions.financial={view:true,create:true,update:true,delete:true};matrix.permissions.appointments.view=true;
  const saveMatrix=async()=>{matrix=await api('PUT','/api/permissions/reception',{version:matrix.version,permissions:matrix.permissions});};await saveMatrix();
  const patient=await api('POST','/api/patients',{full_name:'Fictitious Generation Patient'});
  const dentist=await api('POST','/api/dentists',{full_name:'Fictitious Generation Dentist',availability:[{day_of_week:'monday',start_time:'08:00',end_time:'18:00'}]});
  const procedure=await api('POST','/api/procedures',{name:'Fictitious Generation Procedure',duration_minutes:15,price:100});
  const date=new Date();date.setUTCDate(date.getUTCDate()+((8-date.getUTCDay())%7||7));date.setUTCHours(13,0,0,0);const end=new Date(date);end.setUTCHours(14);
  let visit=await api('POST','/api/appointments',{patient_id:patient.id,dentist_id:dentist.id,procedure_ids:[procedure.id],start_at:date.toISOString(),end_at:end.toISOString()});
  stage='reader login';const receiver=await login(reader,account.email);assert.notEqual(receiver.session_id,author.session_id);
  let reads=0,writes=0;reader.on('request',r=>{const p=new URL(r.url()).pathname;if(r.method()==='GET'&&p==='/api/appointments')reads++;if(['POST','PUT','DELETE'].includes(r.method())&&p.startsWith('/api/financial'))writes++;});
  const button=name=>reader.getByRole('button',{name,exact:true}),field=name=>reader.locator('[name="'+name+'"]');
  const ready=()=>reader.getByText('Consultas preparadas para geração.',{exact:true}).waitFor();
  const refresh=async()=>{await button('Atualizar consultas para geração').click();await ready();};
  const select=async()=>field('appointment_id').evaluate((el,id)=>{el.value=id;el.dispatchEvent(new Event('change',{bubbles:true}));},visit.id);
  await reader.goto(origin+'/financial');await button('Gerar da consulta').waitFor();await reader.waitForLoadState('networkidle');assert.equal(reads,0);
  stage='fresh frozen generation';await button('Gerar da consulta').click();await ready();assert.equal(reads,1);await select();await field('notes').fill('Fictitious retained generation');
  const renamed=await api('PUT','/api/patients/'+patient.id,{version:patient.version,full_name:'Fictitious Remote Generation Patient'});
  await reader.waitForTimeout(17000);await reader.evaluate(()=>{window.dispatchEvent(new Event('offline'));window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('focus'));});await reader.waitForTimeout(500);
  assert.equal(reads,1);assert.ok((await field('appointment_id').textContent()).includes(patient.full_name));await refresh();assert.ok((await field('appointment_id').textContent()).includes(renamed.full_name));assert.equal(await field('notes').inputValue(),'Fictitious retained generation');assert.equal(await field('appointment_id').inputValue(),visit.id);
  stage='failure recovery';const pattern=/\/api\/appointments(?:\?.*)?$/;await reader.route(pattern,r=>r.fulfill({status:503,contentType:'application/json',body:'{"detail":"Fictitious unavailable"}'}));await button('Atualizar consultas para geração').click();await reader.getByText('Erro ao preparar consultas para geração. Tente atualizar.',{exact:true}).waitFor();assert.equal(await button('Gerar').isDisabled(),true);await reader.unroute(pattern);await refresh();
  stage='visit outside window';visit=await api('PUT','/api/appointments/'+visit.id,{version:visit.version,start_at:'2030-01-07T13:00:00Z',end_at:'2030-01-07T14:00:00Z'});await refresh();assert.equal(await field('appointment_id').inputValue(),visit.id);assert.equal(await button('Gerar').isDisabled(),true);await reader.getByText('Nenhuma consulta disponível nesta janela.',{exact:true}).waitFor();
  visit=await api('PUT','/api/appointments/'+visit.id,{version:visit.version,start_at:date.toISOString(),end_at:end.toISOString()});await refresh();assert.equal(await button('Gerar').isDisabled(),false);
  for(const dark of [false,true]){await reader.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);await reader.screenshot({path:path.resolve(__dirname,'../.data/homolog/generation-reference-'+(dark?'dark':'light')+'.png'),fullPage:true,animations:'disabled'});}
  await button('Cancelar').click();stage='cancel late preparation';let release,enter;const gate=new Promise(done=>release=done),entered=new Promise(done=>enter=done);
  await reader.route(pattern,async route=>{const response=await route.fetch();enter();await gate;await route.fulfill({response}).catch(()=>{});});await button('Gerar da consulta').click();await entered;await button('Cancelar preparação da geração').click();release();await reader.unroute(pattern);assert.equal(await field('notes').count(),0);
  await button('Gerar da consulta').click();await ready();assert.equal(await field('notes').inputValue(),'');await select();await field('notes').fill('Fictitious uncertain generation');
  stage='lost generation response';const payloads=[];let intercept=true;await reader.route(/\/api\/financial\/from-appointment\//,async route=>{payloads.push(route.request().postDataJSON());if(intercept){intercept=false;const response=await route.fetch();assert.equal(response.status(),201);await route.abort('failed');}else await route.continue();});
  await button('Gerar').click();await button('Consultar/repetir geração').waitFor();assert.equal(await button('Atualizar consultas para geração').isDisabled(),true);
  stage='recovery with removed consultation and revoked reference access';await api('DELETE','/api/appointments/'+visit.id+'?version='+visit.version);matrix.permissions.appointments.view=false;await saveMatrix();await reader.getByText('Sem acesso às consultas para geração.',{exact:true}).waitFor({timeout:25000});
  assert.equal(await reader.evaluate(async id=>(await fetch('/api/appointments',{headers:{'X-Session-ID':id}})).status,receiver.session_id),403);
  await button('Consultar/repetir geração').click();await reader.getByText('Gerar lancamento financeiro da consulta',{exact:true}).waitFor({state:'hidden'});assert.equal(payloads.length,2);assert.deepEqual(payloads[0],payloads[1]);const entries=await api('GET','/api/financial');assert.equal(entries.items.length,1);assert.equal(entries.items[0].amount_cents,10000);assert.equal(writes,2);
  console.log('PASS: independent sessions; no idle reads; frozen options; explicit refresh preserves draft/selection; failure recovery; out-of-window visit blocks new generation; cancellation and reopening; lost response recovered with identical payload/key after real deletion and reference 403; one generated entry and only two explicit requests.');
 }finally{await browser.close();}
})().catch(()=>{console.error('Financial refresh browser failed at stage: '+stage);process.exitCode=1;});
