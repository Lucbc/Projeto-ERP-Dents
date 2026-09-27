const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
let stage='start';
process.on('unhandledRejection',()=>{console.error('Permissions browser failed at stage: '+stage);process.exit(1);});
(async()=>{
 const credentials=JSON.parse(fs.readFileSync(0,'utf8'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const context=await browser.newContext({ignoreHTTPSErrors:false,viewport:{width:1440,height:1000}});
  const first=await context.newPage(),second=await context.newPage();
  stage='login';await first.goto('https://localhost:18444/login');
  await first.locator('[name=email]').fill(credentials.email);await first.locator('[name=password]').fill(credentials.password);
  const pending=first.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.request().method()==='POST');
  await first.getByRole('button',{name:'Entrar',exact:true}).click();
  const logged=await(await pending).json();await first.getByText('Pacientes cadastrados',{exact:true}).waitFor();
  const headers={'Content-Type':'application/json','X-Session-ID':logged.session_id,'X-CSRF-Token':logged.csrf_token};
  const api=(method,url,data)=>first.evaluate(async({method,url,data,headers})=>{
   const response=await fetch(url,{method,headers,body:data?JSON.stringify(data):undefined});
   return {status:response.status,body:await response.json()};
  },{method,url,data,headers});
  const open=(page,name)=>page.getByRole('button',{name:new RegExp(name)}).click();
  const field=(page,role,action)=>page.getByRole('checkbox',{name:`${role}: Pacientes — ${action}`,exact:true});
  const save=async(page,role)=>{
   const result=page.waitForResponse(r=>r.url().endsWith('/api/permissions/'+role)&&r.request().method()==='PUT');
   await page.getByRole('button',{name:'Salvar Permissões',exact:true}).click();return result;
  };
  stage='load old forms';
  for(const page of [first,second]) {await page.goto('https://localhost:18444/permissions');await page.getByText('Permissões por Perfil',{exact:true}).waitFor();}
  await open(first,'Coordenador');await field(first,'Coordenador','Ver').uncheck();
  await open(first,'Recepcao');await open(second,'Recepcao');
  stage='save one profile';await field(first,'Recepcao','Criar').uncheck();assert.equal((await save(first,'reception')).status(),200);
  await open(first,'Coordenador');assert.equal(await field(first,'Coordenador','Ver').isChecked(),false);
  stage='stale second form';await field(second,'Recepcao','Ver').uncheck();
  const conflict=await save(second,'reception');assert.equal(conflict.status(),409);assert.equal((await conflict.json()).code,'stale_version');
  const reload=second.getByRole('button',{name:'Descartar rascunho e carregar atual',exact:true});await reload.waitFor();
  assert.equal(await second.getByRole('button',{name:'Salvar Permissões',exact:true}).isDisabled(),true);
  stage='failed reload keeps draft';
  await second.route('**/api/permissions',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({detail:'Fictitious unavailable'})}));
  const failed=second.waitForResponse(r=>r.url().endsWith('/api/permissions')&&r.status()===503);
  await reload.click();await failed;
  await second.getByText(/serviço está temporariamente indisponível/).waitFor();
  assert.equal(await field(second,'Recepcao','Ver').isChecked(),false);
  assert.equal(await second.getByRole('button',{name:'Salvar Permissões',exact:true}).isDisabled(),true);
  await second.screenshot({path:path.resolve(__dirname,'../.data/homolog/permission-version-conflict.png'),fullPage:true});
  stage='explicit reload and review';await second.unroute('**/api/permissions');
  const loaded=second.waitForResponse(r=>r.url().endsWith('/api/permissions')&&r.status()===200);
  await reload.click();await loaded;await second.getByText('Permissões atuais carregadas. Revise antes de salvar.',{exact:true}).waitFor();
  assert.equal(await field(second,'Recepcao','Ver').isChecked(),true);assert.equal(await field(second,'Recepcao','Criar').isChecked(),false);
  assert.equal((await api('GET','/api/permissions')).body.items.find(x=>x.role==='reception').version,2);
  await field(second,'Recepcao','Ver').uncheck();assert.equal((await save(second,'reception')).status(),200);
  stage='independent coordinator draft';assert.equal(await field(first,'Coordenador','Ver').isChecked(),false);
  assert.equal((await save(first,'coordinator')).status(),200);
  const result=(await api('GET','/api/permissions')).body.items;
  assert.equal(result.find(x=>x.role==='reception').version,3);assert.equal(result.find(x=>x.role==='coordinator').version,2);
  await first.screenshot({path:path.resolve(__dirname,'../.data/homolog/permission-version-independent.png'),fullPage:true});
  stage='revoked session';assert.equal((await api('POST','/api/auth/logout')).status,200);
  const revoked=await save(second,'reception');assert.equal(revoked.status(),401);
  await second.waitForURL('**/login');
  console.log('PASS: two Chrome tabs reject stale permissions; failed reload keeps draft; explicit review and independent profile drafts persist; revoked session returns to login.');
 } finally {await browser.close();}
})().catch(()=>{console.error('Permissions browser failed at stage: '+stage);process.exitCode=1;});
