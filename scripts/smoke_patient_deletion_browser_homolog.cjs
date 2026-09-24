// Fictitious data only; report stage labels, never credentials or raw browser errors.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
let stage='start';
process.on('unhandledRejection',()=>{console.error('Patient deletion browser failed at stage: '+stage);process.exit(1);});
(async()=>{
 const credentials=JSON.parse(fs.readFileSync(0,'utf8'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const context=await browser.newContext({ignoreHTTPSErrors:false,viewport:{width:1440,height:1000}});
  const first=await context.newPage(),second=await context.newPage();
  async function login(page, values) {
   await page.goto('https://localhost:18444/login');
   await page.locator('[name=email]').fill(values.email);await page.locator('[name=password]').fill(values.password);
   const response=page.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.request().method()==='POST');
   await page.getByRole('button',{name:'Entrar',exact:true}).click();
   const result=await(await response).json();await page.getByText('Pacientes cadastrados',{exact:true}).waitFor();return result;
  }
  stage='login';const logged=await login(first,credentials);
  const headers={'Content-Type':'application/json','X-Session-ID':logged.session_id,'X-CSRF-Token':logged.csrf_token};
  const api=(method,url,data)=>first.evaluate(async({method,url,data,headers})=>{
   const response=await fetch(url,{method,headers,body:data?JSON.stringify(data):undefined});
   return {status:response.status,body:response.status===204?null:await response.json()};
  },{method,url,data,headers});
  stage='fixture';const patient=(await api('POST','/api/patients',{full_name:'Fictitious patient deletion'})).body;
  const endpoint='/api/patients/'+patient.id;
  for(const tab of [first,second]) { await tab.goto('https://localhost:18444/patients');await tab.getByText(patient.full_name,{exact:true}).waitFor(); }
  async function open(page,count) {
   await page.getByRole('button',{name:'Excluir',exact:true}).click();
   await page.getByRole('button',{name:'Confirmar exclusão',exact:true}).waitFor();
   await page.getByText(count+' exame(s) serão removidos.',{exact:false}).waitFor();
  }
  async function confirm(page,status,code) {
   const result=page.waitForResponse(r=>r.url().includes(endpoint+'?')&&r.request().method()==='DELETE');
   await page.getByRole('button',{name:'Confirmar exclusão',exact:true}).click();
   const response=await result;assert.equal(response.status(),status);
   if(code)assert.equal((await response.json()).code,code);
  }
  async function reload(page) {
   await page.getByRole('button',{name:'Recarregar lista para conferir'}).click();
   await page.getByRole('button',{name:'Recarregar lista para conferir'}).waitFor({state:'hidden'});
  }
  stage='stale patient';await open(second,0);
  await first.getByRole('button',{name:'Editar',exact:true}).click();
  await first.locator('textarea[name=notes]').fill('Fictitious concurrent edit');
  const saved=first.waitForResponse(r=>r.url().endsWith(endpoint)&&r.request().method()==='PUT');
  await first.getByRole('button',{name:'Salvar',exact:true}).click();assert.equal((await saved).status(),200);
  await confirm(second,409,'stale_version');await reload(second);
  await open(second,0);
  async function upload() {
   await first.goto('https://localhost:18444/patients/'+patient.id);
   await first.locator('input[type=file]').setInputFiles({name:'fictitious.png',mimeType:'image/png',
    buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7ioAAAAASUVORK5CYII=','base64')});
   const response=first.waitForResponse(r=>r.url().endsWith(endpoint+'/exams')&&r.request().method()==='POST');
   await first.getByRole('button',{name:'Enviar',exact:true}).click();
   const result=await response;assert.equal(result.status(),201);return result.json();
  }
  stage='upload after empty confirmation';const original=await upload();
  await confirm(second,409,'stale_exams');await reload(second);await open(second,1);
  stage='same count replacement';assert.equal((await api('DELETE','/api/exams/'+original.id)).status,204);await upload();
  await confirm(second,409,'stale_exams');
  await second.screenshot({path:path.join(__dirname,'../.data/homolog/patient-deletion-stale-exams.png'),fullPage:true});
  stage='restricted account';
  const createdUser=await api('POST','/api/users',{name:'Fictitious restricted operator',email:'patient-browser@example.com',password:credentials.password,role:'reception'});
  stage='restricted account creation '+createdUser.status;assert.equal(createdUser.status,201);const user=createdUser.body;
  const limitedContext=await browser.newContext({ignoreHTTPSErrors:false,viewport:{width:1440,height:1000}});
  const limited=await limitedContext.newPage();stage='restricted login';const limitedLogin=await login(limited,{email:user.email,password:credentials.password});
  stage='restricted permission read';
  const permissions=await limited.evaluate(async marker=> (await(await fetch('/api/permissions/me',
   {headers:{'X-Session-ID':marker}})).json()).permissions,limitedLogin.session_id);
  permissions.patients.delete=true;for(const key of Object.keys(permissions.exams))permissions.exams[key]=false;
  stage='restrict permissions';assert.equal((await api('PUT','/api/permissions/reception',{permissions})).status,200);
  stage='restricted patient page';
  await limited.goto('https://localhost:18444/patients');
  stage='restricted preview';const denied=limited.waitForResponse(r=>r.url().includes('/deletion-preview')&&r.status()===403);
  await limited.getByRole('button',{name:'Excluir',exact:true}).click();await denied;
  await limited.getByRole('button',{name:'Recarregar lista para conferir'}).waitFor();
  assert.equal(await limited.getByRole('button',{name:'Confirmar exclusão',exact:true}).count(),0);
  await limited.screenshot({path:path.join(__dirname,'../.data/homolog/patient-deletion-permission.png'),fullPage:true});
  stage='explicit grant and reviewed deletion';permissions.exams.delete=true;
  assert.equal((await api('PUT','/api/permissions/reception',{permissions})).status,200);
  await reload(limited);await open(limited,1);await confirm(limited,204);
  await limited.getByText('Paciente removido.',{exact:true}).waitFor();
  assert.equal((await api('GET',endpoint)).status,404);
  console.log('OK: Chrome two tabs reject edited patient, new upload and same-count replacement; denied cascade has no confirmation; explicit grant and reviewed deletion succeed.');
 } finally {await browser.close();}
})().catch(()=>{console.error('Patient deletion browser failed at stage: '+stage);process.exitCode=1;});
