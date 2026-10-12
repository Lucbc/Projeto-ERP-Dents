// Disposable fictitious fixtures only. Never print credentials or response bodies.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
let stage='start';
process.on('unhandledRejection',()=>{console.error('Agenda refresh browser failed at stage: '+stage);process.exit(1);});
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
  stage='fixtures';const account=await api('POST','/api/users',{name:'Fictitious Reference Operator',email:'appointment-reference@example.com',password:credentials.password,role:'reception'});
  let matrix=(await api('GET','/api/permissions')).items.find(x=>x.role==='reception');
  matrix.permissions.appointments={view:true,create:true,update:true,delete:true};for(const key of ['patients','dentists','procedures'])matrix.permissions[key].view=true;
  const saveMatrix=async()=>{matrix=await api('PUT','/api/permissions/reception',{version:matrix.version,permissions:matrix.permissions});};await saveMatrix();
  const patient=await api('POST','/api/patients',{full_name:'Fictitious Reference Patient'});
  const dentist=await api('POST','/api/dentists',{full_name:'Fictitious Reference Dentist',availability:[{day_of_week:'monday',start_time:'08:00',end_time:'18:00'}]});
  let procedure=await api('POST','/api/procedures',{name:'Fictitious Reference Procedure',duration_minutes:15,price:100});
  let visit=await api('POST','/api/appointments',{patient_id:patient.id,dentist_id:dentist.id,procedure_ids:[procedure.id],start_at:'2030-01-07T13:00:00Z',end_at:'2030-01-07T14:00:00Z'});
  stage='reader login';const receiver=await login(reader,account.email);assert.notEqual(receiver.session_id,author.session_id);
  let reads=0,writes=0;reader.on('request',r=>{const p=new URL(r.url()).pathname;if(r.method()==='GET'&&p==='/api/procedures')reads++;if(['POST','PUT','DELETE'].includes(r.method())&&p.startsWith('/api/appointments'))writes++;});
  const button=name=>reader.getByRole('button',{name,exact:true}),field=name=>reader.locator('[name="'+name+'"]');
  const ready=()=>reader.getByText('Cadastros preparados para esta consulta. Atualizar as opções mantém os horários preenchidos.',{exact:true}).waitFor();
  const refresh=async()=>{await button('Atualizar cadastros do formulário').click();await ready();};
  await reader.goto(origin+'/appointments');await reader.getByRole('row').filter({hasText:patient.full_name}).waitFor();
  await button('Atualizar cadastros dos filtros').waitFor();await reader.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Atualizar cadastros dos filtros')?.disabled);assert.equal(reads,1);
  stage='automatic duration and frozen options';await button('Nova').click();await ready();assert.equal(reads,2);
  await field('start_at').fill('2030-01-07T10:00');await reader.getByRole('checkbox').check();assert.equal(await field('end_at').inputValue(),'2030-01-07T10:15');await field('notes').fill('Fictitious retained draft');
  procedure=await api('PUT','/api/procedures/'+procedure.id,{version:procedure.version,name:'Fictitious Remote Procedure',duration_minutes:60});
  await reader.waitForTimeout(17000);await reader.evaluate(()=>{window.dispatchEvent(new Event('offline'));window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('focus'));});await reader.waitForTimeout(500);
  assert.equal(reads,2);assert.equal(await field('end_at').inputValue(),'2030-01-07T10:15');assert.equal(await reader.getByText(procedure.name,{exact:true}).count(),0);
  stage='explicit refresh preserves automatic and manual end';await refresh();assert.equal(await field('end_at').inputValue(),'2030-01-07T10:15');await reader.getByText('Duração sugerida: 60 min',{exact:true}).waitFor();
  await button('Aplicar duração sugerida').click();assert.equal(await field('end_at').inputValue(),'2030-01-07T11:00');await field('end_at').fill('2030-01-07T12:00');
  procedure=await api('PUT','/api/procedures/'+procedure.id,{version:procedure.version,duration_minutes:90});await refresh();assert.equal(await field('end_at').inputValue(),'2030-01-07T12:00');assert.equal(await field('notes').inputValue(),'Fictitious retained draft');
  for(const dark of [false,true]){await reader.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);await reader.screenshot({path:path.resolve(__dirname,'../.data/homolog/appointment-reference-'+(dark?'dark':'light')+'.png'),fullPage:true,animations:'disabled'});}
  stage='partial failure and recovery';const pattern=/\/api\/procedures(?:\?.*)?$/;await reader.route(pattern,r=>r.fulfill({status:503,contentType:'application/json',body:'{"detail":"Fictitious unavailable"}'}));
  await button('Atualizar cadastros do formulário').click();await reader.getByText('Procedimentos: não foi possível carregar. Tente novamente.',{exact:true}).waitFor();assert.equal(await button('Salvar').isDisabled(),true);await reader.unroute(pattern);await refresh();assert.equal(await field('end_at').inputValue(),'2030-01-07T12:00');
  stage='independent permission revoke grant';matrix.permissions.procedures.view=false;await saveMatrix();await reader.getByText('Procedimentos: sem acesso ao cadastro.',{exact:true}).waitFor({timeout:25000});assert.equal(await button('Salvar').isDisabled(),true);
  assert.equal(await reader.evaluate(async id=>(await fetch('/api/procedures',{headers:{'X-Session-ID':id}})).status,receiver.session_id),403);
  assert.equal(await reader.getByText(procedure.name,{exact:true}).count(),0);matrix.permissions.procedures.view=true;await saveMatrix();await ready();assert.equal(await field('notes').inputValue(),'Fictitious retained draft');await button('Cancelar').click();
  stage='fresh reopening';await button('Nova').click();await ready();await reader.getByRole('checkbox').check();await reader.getByText('Duração sugerida: 90 min',{exact:true}).waitFor();await button('Cancelar').click();
  stage='captured version real conflict';await reader.getByRole('row').filter({hasText:patient.full_name}).getByRole('button',{name:'Editar',exact:true}).click();await ready();const end=await field('end_at').inputValue(),oldVersion=visit.version;
  visit=await api('PUT','/api/appointments/'+visit.id,{version:visit.version,notes:'Fictitious remote change'});await refresh();assert.equal(await field('end_at').inputValue(),end);
  const conflict=reader.waitForResponse(r=>r.url().endsWith('/api/appointments/'+visit.id)&&r.request().method()==='PUT');await button('Salvar').click();const response=await conflict;assert.equal(response.status(),409);assert.equal(response.request().postDataJSON().version,oldVersion);await button('Descartar rascunho e carregar atual').waitFor();await button('Cancelar').click();
  stage='cancel late preparation';let release,enter;const gate=new Promise(done=>release=done),entered=new Promise(done=>enter=done);
  await reader.route(pattern,async route=>{const response=await route.fetch();enter();await gate;await route.fulfill({response}).catch(()=>{});});await button('Nova').click();await entered;await button('Cancelar').click();release();await reader.unroute(pattern);
  assert.equal(await field('notes').count(),0);await button('Nova').click();await ready();assert.equal(await field('notes').inputValue(),'');assert.equal(writes,1);
  console.log('PASS: independent sessions; fresh options per action; no polling/reconnect replacement; automatic and manual end retained; explicit duration application; partial failure recovery; real independent 403/grant and version 409; canceled preparation; one explicit write.');
 }finally{await browser.close();}
})().catch(()=>{console.error('Agenda refresh browser failed at stage: '+stage);process.exitCode=1;});
