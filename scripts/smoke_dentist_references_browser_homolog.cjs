// Private fictitious fixtures only. Never emit credentials, headers or bodies.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
process.on('unhandledRejection', () => { console.error('Dentist refresh browser failed at stage: ' + stage); process.exit(1); });
(async () => {
 const credentials = JSON.parse(fs.readFileSync(0, 'utf8'));
 const browser = await chromium.launch({ channel: 'chrome', headless: true });
 const origin = 'https://localhost:18444';
 try {
  const context = () => browser.newContext({ timezoneId: 'America/Sao_Paulo', viewport: { width: 1440, height: 1100 } });
  const writer = await (await context()).newPage(), reader = await (await context()).newPage();
  const login = async (page, email) => {
   await page.goto(origin + '/login'); await page.locator('[name=email]').fill(email); await page.locator('[name=password]').fill(credentials.password);
   const response = page.waitForResponse(r => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST');
   await page.getByRole('button', { name: 'Entrar', exact: true }).click(); const identity = await (await response).json();
   await page.getByRole('region', { name: 'Pacientes cadastrados', exact: true }).waitFor(); return identity;
  };
  stage = 'author login'; const author = await login(writer, credentials.email);
  const api = async (method, url, data) => {
   const result = await writer.evaluate(async ({ method, url, data, author }) => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', 'X-Session-ID': author.session_id, 'X-CSRF-Token': author.csrf_token }, body: data ? JSON.stringify(data) : undefined });
    return { status: r.status, body: r.status === 204 ? null : await r.json() };
   }, { method, url, data, author });
   assert.ok([200, 201, 204].includes(result.status), 'Fixture request rejected'); return result.body;
  };
  stage='fixtures';
  const account=await api('POST','/api/users',{name:'Fictitious Specialty Operator',email:'specialty-operator@example.com',password:credentials.password,role:'reception'});
  let matrix=(await api('GET','/api/permissions')).items.find(x=>x.role==='reception');
  matrix.permissions.dentists={view:true,create:true,update:true,delete:true};matrix.permissions.specialties.view=true;
  const saveMatrix=async()=>{matrix=await api('PUT','/api/permissions/reception',{version:matrix.version,permissions:matrix.permissions});};await saveMatrix();
  let specialty=await api('POST','/api/specialties',{name:'Fictitious Specialty Original'});
  let target=await api('POST','/api/dentists',{full_name:'Fictitious Specialty Dentist',specialty:specialty.name,availability:[{day_of_week:'monday',start_time:'08:00',end_time:'18:00'}]});
  stage='reader login';const receiver=await login(reader,account.email);assert.notEqual(receiver.session_id,author.session_id);
  let reads=0,writes=0;reader.on('request',r=>{const p=new URL(r.url()).pathname;if(r.method()==='GET'&&p==='/api/specialties')reads++;if(['POST','PUT','DELETE'].includes(r.method())&&p.startsWith('/api/dentists'))writes++;});
  const button=name=>reader.getByRole('button',{name,exact:true});
  const options=()=>reader.locator('select[name=specialty]').textContent();
  const ready=()=>reader.getByText('As opções de especialidades permanecem como estavam ao abrir ou atualizar este formulário.',{exact:true}).waitFor();
  const update=async()=>{await button('Atualizar especialidades do formulário').click();await ready();};
  await reader.goto(origin+'/dentists');await reader.getByRole('row').filter({hasText:target.full_name}).waitFor();assert.equal(reads,0);
  stage='edit with current references';await reader.getByRole('row').filter({hasText:target.full_name}).getByRole('button',{name:'Editar',exact:true}).click();await ready();assert.equal(reads,1);
  await reader.locator('input[name=full_name]').fill('Fictitious retained dentist');await reader.locator('[name="availability.0.start_time"]').fill('09:00');
  specialty=await api('PUT','/api/specialties/'+specialty.id,{version:specialty.version,name:'Fictitious Specialty Remote',active:false});
  stage='freeze through remote change and reconnect';await reader.waitForTimeout(17000);
  await reader.evaluate(()=>{window.dispatchEvent(new Event('offline'));window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('focus'));});await reader.waitForTimeout(1000);
  assert.equal(reads,1);assert.ok(!(await options()).includes(specialty.name));assert.equal(await reader.locator('[name="availability.0.start_time"]').inputValue(),'09:00');
  stage='explicit update preserves historic name and draft';await update();assert.equal(reads,2);assert.ok((await options()).includes('(inativa)'));assert.ok((await options()).includes('(fora do cadastro atual)'));
  assert.equal(await reader.locator('select[name=specialty]').inputValue(),'Fictitious Specialty Original');assert.equal(await reader.locator('input[name=full_name]').inputValue(),'Fictitious retained dentist');
  for(const dark of [false,true]){await reader.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);await reader.screenshot({path:path.resolve(__dirname,'../.data/homolog/dentist-reference-'+(dark?'dark':'light')+'.png'),fullPage:true,animations:'disabled'});}
  stage='captured version conflict';const oldVersion=target.version;target=await api('PUT','/api/dentists/'+target.id,{version:target.version,full_name:'Fictitious Specialty Renamed Dentist'});
  await reader.getByRole('cell',{name:target.full_name,exact:true}).waitFor({timeout:25000});await update();
  const conflict=reader.waitForResponse(r=>r.url().endsWith('/api/dentists/'+target.id)&&r.request().method()==='PUT');await button('Salvar').click();const response=await conflict;
  assert.equal(response.status(),409);assert.equal(response.request().postDataJSON().version,oldVersion);assert.equal(response.request().postDataJSON().availability[0].start_time,'09:00');await button('Descartar rascunho e carregar atual').waitFor();await button('Cancelar').click();
  stage='fresh options on reopen';await button('Novo').click();await ready();assert.ok((await options()).includes(specialty.name));assert.equal(await reader.locator('select[name=specialty]').inputValue(),'');
  await reader.locator('input[name=full_name]').fill('Fictitious retry draft');
  stage='failure and recovery';const pattern=/\/api\/specialties(?:\?.*)?$/;
  await reader.route(pattern,route=>route.fulfill({status:503,contentType:'application/json',body:'{"detail":"Fictitious unavailable"}'}));
  await button('Atualizar especialidades do formulário').click();await reader.getByText(/Não foi possível carregar as especialidades/).waitFor();assert.equal(await button('Salvar').isDisabled(),true);await reader.unroute(pattern);await update();
  assert.equal(await reader.locator('input[name=full_name]').inputValue(),'Fictitious retry draft');
  stage='independent permission revoke and grant';matrix.permissions.specialties.view=false;await saveMatrix();await reader.getByText(/Sem acesso às especialidades/).waitFor({timeout:25000});
  assert.ok(!(await options()).includes(specialty.name));assert.equal(await button('Salvar').isDisabled(),true);
  assert.equal(await reader.evaluate(async id=>(await fetch('/api/specialties',{headers:{'X-Session-ID':id}})).status,receiver.session_id),403);
  matrix.permissions.specialties.view=true;await saveMatrix();await ready();assert.equal(await reader.locator('input[name=full_name]').inputValue(),'Fictitious retry draft');await button('Cancelar').click();
  stage='cancel pending preparation';let release,enter;const gate=new Promise(resolve=>release=resolve),entered=new Promise(resolve=>enter=resolve);
  await reader.route(pattern,async route=>{const response=await route.fetch();enter();await gate;await route.fulfill({response}).catch(()=>{});});
  await button('Novo').click();await entered;await reader.getByText(/Carregando especialidades para este formulário/).waitFor();await button('Cancelar').click();release();await reader.unroute(pattern);
  assert.equal(await reader.locator('input[name=full_name]').count(),0);await button('Novo').click();await ready();assert.equal(await reader.locator('input[name=full_name]').inputValue(),'');assert.equal(writes,1);
  console.log('PASS: independent sessions; current specialty options per action; no polling/reconnect replacement; historic and inactive labels; hours/draft/version preserved; real 409; retry; independent real 403/grant; canceled late preparation; one explicit write.');
 } finally {await browser.close();}
})().catch(()=>{console.error('Dentist refresh browser failed at stage: '+stage);process.exitCode=1;});
