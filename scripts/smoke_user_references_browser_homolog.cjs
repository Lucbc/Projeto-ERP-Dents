// Private fictitious fixtures only. Never emit credentials, headers or bodies.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
process.on('unhandledRejection', () => { console.error('User refresh browser failed at stage: ' + stage); process.exit(1); });
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
  const account=await api('POST','/api/users',{name:'Fictitious Reference Operator',email:'reference-operator@example.com',password:credentials.password,role:'reception'});
  let matrix=(await api('GET','/api/permissions')).items.find(x=>x.role==='reception');
  matrix.permissions.users={view:true,create:true,update:true,delete:true};matrix.permissions.dentists.view=true;
  const saveMatrix=async()=>{matrix=await api('PUT','/api/permissions/reception',{version:matrix.version,permissions:matrix.permissions});};await saveMatrix();
  let dentist=await api('POST','/api/dentists',{full_name:'Fictitious Reference Original',cro:'FICT-REF',specialty_ids:[],availability:[],active:true});
  const target=await api('POST','/api/users',{name:'Fictitious Reference Target',email:'reference-target@example.com',password:credentials.password,role:'dentist',dentist_id:dentist.id});
  stage='reader login';const receiver=await login(reader,account.email);assert.notEqual(receiver.session_id,author.session_id);
  let reads=0,writes=0;reader.on('request',r=>{const p=new URL(r.url()).pathname;if(r.method()==='GET'&&p==='/api/dentists')reads++;if(['POST','PUT','DELETE'].includes(r.method())&&p.startsWith('/api/users'))writes++;});
  const button=name=>reader.getByRole('button',{name,exact:true});
  const options=()=>reader.locator('select[name=dentist_id]').textContent();
  const ready=()=>reader.getByText('As opções de dentistas permanecem como estavam ao abrir ou atualizar este formulário.',{exact:true}).waitFor();
  const open=async()=>{await button('Novo').click();await ready();};
  const update=async()=>{await button('Atualizar dentistas do formulário').click();await ready();};
  await reader.goto(origin+'/users');await reader.getByRole('row').filter({hasText:target.name}).waitFor();assert.equal(reads,0);
  stage='new action current references';await open();assert.equal(reads,1);assert.ok((await options()).includes(dentist.full_name));
  await reader.locator('input[name=name]').fill('Fictitious retained draft');await reader.locator('input[name=password]').fill(credentials.password);
  dentist=await api('PUT','/api/dentists/'+dentist.id,{version:dentist.version,full_name:'Fictitious Reference Remote'});
  stage='freeze through remote change and reconnect';await reader.waitForTimeout(17000);
  await reader.evaluate(()=>{window.dispatchEvent(new Event('offline'));window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('focus'));});
  await reader.waitForTimeout(1000);assert.equal(reads,1);assert.ok((await options()).includes('Fictitious Reference Original'));
  assert.equal(await reader.locator('input[name=name]').inputValue(),'Fictitious retained draft');assert.ok(await reader.locator('input[name=password]').inputValue()===credentials.password);
  stage='explicit update preserves draft';await update();assert.equal(reads,2);assert.ok((await options()).includes(dentist.full_name));assert.ok(await reader.locator('input[name=password]').inputValue()===credentials.password);
  await button('Cancelar').click();dentist=await api('PUT','/api/dentists/'+dentist.id,{version:dentist.version,full_name:'Fictitious Reference Latest'});
  await open();assert.equal(reads,3);assert.ok((await options()).includes(dentist.full_name));assert.equal(await reader.locator('input[name=password]').inputValue(),'');
  stage='failed reference and retry';await reader.locator('input[name=name]').fill('Fictitious retry draft');
  const pattern=/\/api\/dentists(?:\?.*)?$/;await reader.route(pattern,route=>route.fulfill({status:503,contentType:'application/json',body:'{"detail":"Fictitious unavailable"}'}));
  await button('Atualizar dentistas do formulário').click();await reader.getByText(/Não foi possível carregar os dentistas/).waitFor();assert.equal(await button('Salvar').isDisabled(),true);assert.ok(!(await options()).includes(dentist.full_name));
  for(const dark of [false,true]){await reader.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);await reader.screenshot({path:path.resolve(__dirname,'../.data/homolog/user-reference-'+(dark?'dark':'light')+'.png'),fullPage:true,animations:'disabled'});}
  await reader.unroute(pattern);await update();assert.equal(await reader.locator('input[name=name]').inputValue(),'Fictitious retry draft');
  stage='independent reference permission revoke and grant';matrix.permissions.dentists.view=false;await saveMatrix();
  await reader.getByText(/Sem acesso aos dentistas/).waitFor({timeout:25000});assert.ok(!(await options()).includes(dentist.full_name));assert.equal(await button('Salvar').isDisabled(),true);
  assert.equal(await reader.evaluate(async id=>(await fetch('/api/dentists',{headers:{'X-Session-ID':id}})).status,receiver.session_id),403);
  matrix.permissions.dentists.view=true;await saveMatrix();await ready();assert.ok((await options()).includes(dentist.full_name));assert.equal(await reader.locator('input[name=name]').inputValue(),'Fictitious retry draft');await button('Cancelar').click();
  stage='cancel pending preparation';let release;const gate=new Promise(resolve=>release=resolve);let intercepted=false;
  await reader.route(pattern,async route=>{const response=await route.fetch();intercepted=true;await gate;await route.fulfill({response}).catch(()=>{});});
  await button('Novo').click();await reader.getByText(/Carregando dentistas para este formulário/).waitFor();
  await reader.waitForFunction(()=>document.querySelector('input[name=name]').matches(':disabled'));await button('Cancelar').click();
  release();await reader.unroute(pattern);assert.equal(await reader.locator('input[name=name]').count(),0);await open();assert.equal(await reader.locator('input[name=name]').inputValue(),'');await button('Cancelar').click();
  stage='captured edit version';await reader.getByRole('row').filter({hasText:target.name}).getByRole('button',{name:'Editar',exact:true}).click();await ready();
  assert.equal(await reader.locator('select[name=dentist_id]').inputValue(),dentist.id);
  await api('PUT','/api/users/'+target.id,{version:target.version,name:'Fictitious Reference Renamed Target'});
  await reader.getByRole('cell',{name:'Fictitious Reference Renamed Target',exact:true}).waitFor({timeout:25000});
  await update();const conflict=reader.waitForResponse(r=>r.url().endsWith('/api/users/'+target.id)&&r.request().method()==='PUT');await button('Salvar').click();
  const response=await conflict;assert.equal(response.status(),409);assert.equal(response.request().postDataJSON().version,target.version);await button('Descartar e carregar atual').waitFor();assert.equal(writes,1);
  console.log('PASS: independent sessions; new actions read current references; no reference polling; reconnect preserves draft/options/secret; explicit reload and retry; real independent 403/grant; canceled preparation cannot reopen; captured version still conflicts; one explicit write.');
 } finally {await browser.close();}
})().catch(()=>{console.error('User refresh browser failed at stage: '+stage);process.exitCode=1;});
