// Private fictional diagnosis. Never print credentials or patient payloads.
const fs=require('node:fs'), assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage='start';
(async()=>{
 const input=JSON.parse(fs.readFileSync(0,'utf8'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await (await browser.newContext({viewport:{width:1440,height:1000}})).newPage();
  const login=async(email)=>{
   await page.goto('https://localhost:18444/login');
   await page.locator('[name=email]').fill(email);await page.locator('[name=password]').fill(input.password);
   const response=page.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.request().method()==='POST');
   await page.getByRole('button',{name:'Entrar',exact:true}).click();
   const identity=await(await response).json();
   await page.getByRole('region',{name:'Pacientes cadastrados',exact:true}).waitFor();return identity;
  };
  let identity=await login(input.email);
  const api=async(method,url,data,status=200)=>{
   const result=await page.evaluate(async({identity,method,url,data})=>{
    const r=await fetch(url,{method,headers:{'Content-Type':'application/json','X-Session-ID':identity.session_id,'X-CSRF-Token':identity.csrf_token},body:data?JSON.stringify(data):undefined});
    return {status:r.status,body:await r.json()};
   },{identity,method,url,data});assert.equal(result.status,status,'Unexpected fixture status');return result.body;
  };
  stage='fixtures';
  const records=[];for(let i=0;i<101;i++)records.push(await api('POST','/api/patients',{full_name:'Fictitious Keyboard '+String(i).padStart(3,'0')},201));
  const dentist=await api('POST','/api/dentists',{full_name:'Fictitious Keyboard Dentist'},201);
  await api('POST','/api/users',{name:'Fictitious Keyboard Operator',email:'keyboard@example.com',password:input.password,role:'dentist',dentist_id:dentist.id},201);
  stage='modal keyboard diagnosis';
  await page.goto('https://localhost:18444/patients');
  const trigger=page.getByRole('button',{name:'Novo',exact:true});await trigger.focus();await page.keyboard.press('Enter');
  const heading=page.getByRole('heading',{name:'Novo paciente',exact:true});await heading.waitFor();
  const panel=heading.locator('../..');
  const inside=()=>panel.evaluate(el=>el.contains(document.activeElement));
  const initialInside=await inside();
  await page.locator('[name=full_name]').focus();
  let tabEscaped=false;for(let i=0;i<65;i++){await page.keyboard.press('Tab');if(!await inside()){tabEscaped=true;break;}}
  await page.locator('[name=full_name]').focus();
  let reverseEscaped=false;for(let i=0;i<8;i++){await page.keyboard.press('Shift+Tab');if(!await inside()){reverseEscaped=true;break;}}
  let writes=0;page.on('request',r=>{if(r.method()==='POST'&&new URL(r.url()).pathname==='/api/patients')writes++;});
  await page.getByRole('button',{name:'Salvar',exact:true}).focus();await page.keyboard.press('Enter');
  await page.getByText('Nome completo e obrigatorio.',{exact:true}).waitFor();
  assert.equal(await page.locator('[name=full_name]').evaluate(el=>el===document.activeElement),true);
  assert.equal(writes,0);
  await page.getByRole('button',{name:'Cancelar',exact:true}).focus();await page.keyboard.press('Enter');await heading.waitFor({state:'detached'});
  const restored=await trigger.evaluate(el=>el===document.activeElement);
  const metrics={initialInside,tabEscaped,reverseEscaped,restored,invalidNameFocused:true};
  fs.writeFileSync('.data/homolog/usability-keyboard.json',JSON.stringify(metrics,null,2));
  if(input.acceptance){
   assert.equal(initialInside,true);assert.equal(tabEscaped,false);assert.equal(reverseEscaped,false);assert.equal(restored,true);
   await trigger.focus();await page.keyboard.press('Enter');await page.getByRole('dialog',{name:'Novo paciente',exact:true}).waitFor();
   await page.keyboard.press('Escape');await heading.waitFor({state:'detached'});assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
   stage='pending save close guard';
   await trigger.focus();await page.keyboard.press('Enter');await heading.waitFor();
   await page.locator('[name=full_name]').fill('Fictitious Pending Draft');
   let release,entered;const gate=new Promise(done=>release=done),started=new Promise(done=>entered=done);
   const pattern=/\/api\/patients$/;
   await page.route(pattern,async route=>{
    if(route.request().method()!=='POST')return route.continue();
    entered();await gate;await route.fulfill({status:422,contentType:'application/json',body:'{"detail":"Fictitious validation failure"}'});
   });
   await page.getByRole('button',{name:'Salvar',exact:true}).focus();await page.keyboard.press('Enter');await started;
   await page.keyboard.press('Escape');assert.equal(await heading.count(),1);
   await page.getByRole('button',{name:'Fechar janela',exact:true}).click();assert.equal(await heading.count(),1);
   const rejected=page.waitForResponse(r=>r.url().endsWith('/api/patients')&&r.request().method()==='POST');release();assert.equal((await rejected).status(),422);
   await page.getByText('Fictitious validation failure',{exact:true}).waitFor();
   assert.equal(await page.locator('[name=full_name]').inputValue(),'Fictitious Pending Draft');
   await page.screenshot({path:'.data/homolog/usability-modal.png',fullPage:false});
   page.once('dialog',dialog=>dialog.accept());
   await page.getByRole('button',{name:'Cancelar',exact:true}).focus();await page.keyboard.press('Enter');await heading.waitFor({state:'detached'});
   await page.unroute(pattern);assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
  }
  stage='consultation outside first hundred';
  await page.context().clearCookies();identity=await login('keyboard@example.com');
  const first=await api('GET','/api/consultations/patients?limit=100&offset=0');assert.equal(first.items.length,100);assert.equal(first.total,101);
  const ids=new Set(first.items.map(x=>x.patient.id));const target=records.find(x=>!ids.has(x.id));assert.ok(target);
  await page.goto('https://localhost:18444/consultation');
  const region=page.getByRole('region',{name:'Pacientes',exact:true});
  await region.getByText(/Exibindo 100 de 101/).waitFor();assert.equal(await region.getByText(target.full_name,{exact:true}).count(),0);
  await page.getByRole('textbox',{name:'Buscar pacientes'}).fill(target.full_name);
  const open=region.getByRole('row').filter({hasText:target.full_name}).getByRole('button',{name:'Abrir',exact:true});
  await open.focus();await page.keyboard.press('Enter');
  await page.getByRole('region',{name:'Dados do paciente',exact:true}).getByText(target.full_name,{exact:true}).waitFor();
  console.log('PASS: patient outside first 100 found and opened by keyboard; invalid name focused without POST; keyboard modal observations saved locally.');
 } finally {await browser.close();}
})().catch(()=>{console.error('Operational journey failed at stage: '+stage);process.exitCode=1;});
