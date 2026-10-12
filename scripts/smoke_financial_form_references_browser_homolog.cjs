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
  stage='fixtures';const account=await api('POST','/api/users',{name:'Fictitious Finance Operator',email:'financial-reference@example.com',password:credentials.password,role:'reception'});
  let matrix=(await api('GET','/api/permissions')).items.find(x=>x.role==='reception');
  matrix.permissions.financial={view:true,create:true,update:true,delete:true};for(const key of ['patients','dentists','appointments'])matrix.permissions[key].view=true;
  const saveMatrix=async()=>{matrix=await api('PUT','/api/permissions/reception',{version:matrix.version,permissions:matrix.permissions});};await saveMatrix();
  let patient=await api('POST','/api/patients',{full_name:'Fictitious Finance Patient'});
  const dentist=await api('POST','/api/dentists',{full_name:'Fictitious Finance Dentist',availability:[{day_of_week:'monday',start_time:'08:00',end_time:'18:00'}]});
  const procedure=await api('POST','/api/procedures',{name:'Fictitious Finance Procedure',duration_minutes:15,price:100});
  const visit=await api('POST','/api/appointments',{patient_id:patient.id,dentist_id:dentist.id,procedure_ids:[procedure.id],start_at:'2030-01-07T13:00:00Z',end_at:'2030-01-07T14:00:00Z'});
  let entry=await api('POST','/api/financial',{entry_type:'income',description:'Fictitious Reference Entry',amount_cents:12000,due_date:'2030-01-07',patient_id:patient.id,dentist_id:dentist.id,appointment_id:visit.id});
  stage='reader login';const receiver=await login(reader,account.email);assert.notEqual(receiver.session_id,author.session_id);
  let reads=0,writes=0;reader.on('request',r=>{const p=new URL(r.url()).pathname;if(r.method()==='GET'&&p==='/api/patients')reads++;if(['POST','PUT','DELETE'].includes(r.method())&&p.startsWith('/api/financial'))writes++;});
  const button=name=>reader.getByRole('button',{name,exact:true}),field=name=>reader.locator('[name="'+name+'"]');
  const ready=()=>reader.getByText('Referências do lançamento preparadas.',{exact:true}).waitFor();
  const refresh=async()=>{await button('Atualizar referências do lançamento').click();await ready();};
  const row=()=>reader.getByRole('row').filter({hasText:entry.description});
  await reader.goto(origin+'/financial');await row().waitFor();await reader.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Atualizar opções dos filtros')?.disabled);assert.equal(reads,1);
  stage='fresh frozen action';await button('Novo lancamento').click();await ready();assert.equal(reads,2);
  await field('notes').fill('Fictitious retained draft');
  patient=await api('PUT','/api/patients/'+patient.id,{version:patient.version,full_name:'Fictitious Remote Finance Patient'});
  await reader.waitForTimeout(17000);await reader.evaluate(()=>{window.dispatchEvent(new Event('offline'));window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('focus'));});await reader.waitForTimeout(500);
  assert.equal(reads,2);assert.ok((await field('patient_id').textContent()).includes('Fictitious Finance Patient'));
  await refresh();assert.ok((await field('patient_id').textContent()).includes(patient.full_name));assert.equal(await field('notes').inputValue(),'Fictitious retained draft');
  stage='partial failure recovery';const pattern=/\/api\/patients(?:\?.*)?$/;await reader.route(pattern,r=>r.fulfill({status:503,contentType:'application/json',body:'{"detail":"Fictitious unavailable"}'}));
  await button('Atualizar referências do lançamento').click();await reader.getByText('Falha ao preparar referências do lançamento. Tente atualizar.',{exact:true}).waitFor();assert.equal(await button('Salvar').isDisabled(),true);await reader.unroute(pattern);await refresh();
  stage='independent permission revoke grant';matrix.permissions.patients.view=false;await saveMatrix();await reader.getByText('Pacientes: sem acesso ao catálogo; vínculos existentes são mantidos.',{exact:true}).waitFor({timeout:25000});
  assert.equal(await reader.evaluate(async id=>(await fetch('/api/patients',{headers:{'X-Session-ID':id}})).status,receiver.session_id),403);
  assert.ok(!(await field('patient_id').textContent()).includes(patient.full_name));assert.equal(await button('Salvar').isDisabled(),false);
  matrix.permissions.patients.view=true;await saveMatrix();await reader.waitForFunction(name=>document.querySelector('select[name=patient_id]')?.textContent.includes(name),patient.full_name,{timeout:25000});await ready();assert.equal(await field('notes').inputValue(),'Fictitious retained draft');await button('Cancelar').click();
  stage='preserved historical link and real version conflict';await row().getByRole('button',{name:'Editar',exact:true}).click();await ready();assert.equal(await field('appointment_id').inputValue(),visit.id);assert.ok((await field('appointment_id').textContent()).includes('Consulta fora da lista'));
  await field('notes').fill('Fictitious old draft');const oldVersion=entry.version;
  entry=await api('PUT','/api/financial/'+entry.id,{version:entry.version,notes:'Fictitious remote change'});await refresh();
  for(const dark of [false,true]){await reader.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);await reader.screenshot({path:path.resolve(__dirname,'../.data/homolog/financial-reference-'+(dark?'dark':'light')+'.png'),fullPage:true,animations:'disabled'});}
  const conflict=reader.waitForResponse(r=>r.url().endsWith('/api/financial/'+entry.id)&&r.request().method()==='PUT');await button('Salvar').click();const response=await conflict;assert.equal(response.status(),409);assert.equal(response.request().postDataJSON().version,oldVersion);assert.equal(response.request().postDataJSON().appointment_id,visit.id);
  await button('Descartar rascunho e carregar atual').waitFor();await refresh();assert.equal(await button('Salvar').isDisabled(),true);assert.equal(await field('notes').inputValue(),'Fictitious old draft');await button('Cancelar').click();
  stage='cancel late preparation';let release,enter;const gate=new Promise(done=>release=done),entered=new Promise(done=>enter=done);
  await reader.route(pattern,async route=>{const response=await route.fetch();enter();await gate;await route.fulfill({response}).catch(()=>{});});await button('Novo lancamento').click();await entered;await button('Cancelar preparação').click();release();await reader.unroute(pattern);
  assert.equal(await field('notes').count(),0);await button('Novo lancamento').click();await ready();assert.equal(await field('notes').inputValue(),'');
  stage='paid creation recovery with original payload';await field('description').fill('Fictitious paid reference recovery');await field('amount').fill('25');
  await field('status').evaluate(el=>{el.value='paid';el.dispatchEvent(new Event('change',{bubbles:true}));});
  const payloads=[];let intercept=true;await reader.route(/\/api\/financial$/,async route=>{if(route.request().method()!=='POST')return route.continue();payloads.push(route.request().postDataJSON());if(intercept){intercept=false;const response=await route.fetch();assert.equal(response.status(),201);await route.abort('failed');}else await route.continue();});
  await button('Salvar').click();await button('Consultar/repetir criação').waitFor();assert.equal(await button('Atualizar referências do lançamento').isDisabled(),true);await button('Consultar/repetir criação').click();await reader.getByText('Novo lancamento financeiro',{exact:true}).waitFor({state:'hidden'});assert.equal(payloads.length,2);assert.deepEqual(payloads[0],payloads[1]);
  const entries=await api('GET','/api/financial?search=Fictitious%20paid%20reference%20recovery');assert.equal(entries.items.length,1);const payments=await api('GET','/api/financial/'+entries.items[0].id+'/payments');assert.equal(payments.length,1);assert.equal(writes,3);
  console.log('PASS: independent sessions; fresh/frozen options and explicit refresh; optional real 403/grant; partial failure recovery; historical appointment retained; real version conflict; canceled preparation; paid creation lost response recovered with identical key/payload, one entry and one payment; three explicit requests.');
 }finally{await browser.close();}
})().catch(()=>{console.error('Financial refresh browser failed at stage: '+stage);process.exitCode=1;});
