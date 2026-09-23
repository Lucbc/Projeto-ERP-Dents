// Only fictitious data. Never print Playwright errors, request headers or credentials.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
let stage='start';
process.on('unhandledRejection',()=>{console.error('Dentist deletion browser failed at stage: '+stage);process.exit(1);});
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
  stage='fixtures';
  const dentist=(await api('POST','/api/dentists',{full_name:'Fictitious deletion dentist',cro:'CRO-SP 000001',
   availability:[{day_of_week:'monday',start_time:'08:00',end_time:'18:00'}]})).body;
  const other=(await api('POST','/api/dentists',{full_name:'Fictitious replacement dentist'})).body;
  const endpoint='/api/dentists/'+dentist.id;
  const createdUser=await api('POST','/api/users',{name:'Fictitious linked deletion account',email:'dentist-browser@example.com',
   password:credentials.password,role:'dentist',dentist_id:dentist.id});
  stage='account fixture HTTP '+createdUser.status;assert.equal(createdUser.status,201);const user=createdUser.body;
  for(const tab of [first,second]) {await tab.goto('https://localhost:18444/dentists');await tab.getByRole('row').filter({hasText:dentist.full_name}).waitFor();}
  stage='edit schedule';
  await first.getByRole('row').filter({hasText:dentist.full_name}).getByRole('button',{name:'Editar',exact:true}).click();
  await first.locator('[name="availability.0.start_time"]').fill('09:00');
  const saved=first.waitForResponse(r=>r.url().endsWith(endpoint)&&r.request().method()==='PUT');
  await first.getByRole('button',{name:'Salvar',exact:true}).click();assert.equal((await saved).status(),200);
  async function remove(status,version) {
   let message;
   second.once('dialog',async dialog=>{message=dialog.message();await dialog.accept();});
   const result=second.waitForResponse(r=>r.url().includes(endpoint)&&r.request().method()==='DELETE');
   await second.getByRole('row').filter({hasText:dentist.full_name}).getByRole('button',{name:'Excluir',exact:true}).click();
   const response=await result;const prefix=stage;stage=prefix+' HTTP status';assert.equal(response.status(),status);
   stage=prefix+' request version';assert.ok(response.url().endsWith('?version='+version));
   stage=prefix+' confirmed name and CRO';assert.ok(message.includes(dentist.full_name)&&message.includes(dentist.cro));
   stage=prefix+' confirmed financial warning';assert.ok(message.includes('Cobranças e pagamentos já registrados permanecem'));
   const body=response.status()===204?null:await response.json();
   stage=prefix+' conflict code '+(['stale_version','linked_record'].includes(body?.code)?body.code:'other');return body;
  }
  stage='stale deletion';assert.equal((await remove(409,1)).code,'stale_version');
  const reload=second.getByRole('button',{name:'Recarregar lista para conferir',exact:true});
  await reload.waitFor();await second.screenshot({path:path.resolve(__dirname,'../.data/homolog/dentist-deletion-stale.png'),fullPage:true});
  await reload.click();await reload.waitFor({state:'hidden'});
  stage='linked account blocks';assert.equal((await remove(409,2)).code,'linked_record');
  stage='linked account banner';
  await reload.waitFor();await second.screenshot({path:path.resolve(__dirname,'../.data/homolog/dentist-deletion-linked.png'),fullPage:true});
  assert.equal((await api('GET','/api/users/'+user.id)).body.dentist_id,dentist.id);
  assert.equal((await api('GET',endpoint)).body.availability[0].start_time,'09:00');
  stage='administrator reassigns account in UI';
  await first.goto('https://localhost:18444/users');
  await first.getByRole('row').filter({hasText:user.email}).getByRole('button',{name:'Editar',exact:true}).click();
  const control=first.locator('select[name=dentist_id]').locator('..');
  await control.locator('input').fill(other.full_name);
  await control.getByRole('button',{name:other.full_name,exact:true}).click();
  const reassigned=first.waitForResponse(r=>r.url().endsWith('/api/users/'+user.id)&&r.request().method()==='PUT');
  await first.getByRole('button',{name:'Salvar',exact:true}).click();assert.equal((await reassigned).status(),200);
  assert.equal((await api('GET','/api/users/'+user.id)).body.dentist_id,other.id);
  stage='reviewed deletion';await reload.click();await reload.waitFor({state:'hidden'});
  await remove(204,2);assert.equal((await api('GET',endpoint)).status,404);
  assert.equal((await api('GET','/api/users/'+user.id)).body.dentist_id,other.id);
  console.log('Chrome HTTPS: stale schedule deletion rejected, linked account protected, administrator reassigns in UI, reload/new confirmation removes only reviewed dentist.');
 } finally {await browser.close();}
})().catch(()=>{console.error('Dentist deletion browser failed at stage: '+stage);process.exitCode=1;});
