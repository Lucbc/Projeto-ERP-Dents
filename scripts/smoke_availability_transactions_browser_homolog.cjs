const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
let stage='start';
(async()=>{
 const credentials=JSON.parse(fs.readFileSync(0,'utf8'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const context=await browser.newContext({ignoreHTTPSErrors:false,timezoneId:'America/Sao_Paulo',viewport:{width:1440,height:1100}});
  const dentist=await context.newPage(),booking=await context.newPage();stage='login';
  await dentist.goto('https://localhost:18444/login');
  await dentist.locator('[name=email]').fill(credentials.email);await dentist.locator('[name=password]').fill(credentials.password);
  await dentist.getByRole('button',{name:'Entrar',exact:true}).click();await dentist.getByText('Pacientes cadastrados',{exact:true}).waitFor();
  async function save(page,resource,status){
   const response=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/api/'+resource+'/'));
   await page.getByRole('button',{name:'Salvar',exact:true}).click();const result=await response;assert.equal(result.status(),status);
   return result.json();
  }
  stage='open two drafts';await dentist.goto('https://localhost:18444/dentists');
  await dentist.getByRole('button',{name:'Editar',exact:true}).click();
  await booking.goto('https://localhost:18444/appointments');
  await booking.locator('input[type=date]').nth(0).fill('2030-01-07');
  await booking.locator('input[type=date]').nth(1).fill('2030-01-07');
  await booking.getByRole('row').filter({hasText:'Fictitious policy patient'}).getByRole('button',{name:'Editar',exact:true}).click();
  stage='dentist conflict';await dentist.locator('[name="availability.0.start_time"]').fill('12:00');
  assert.equal((await save(dentist,'dentists',409)).code,'availability_conflict');
  await dentist.getByRole('button',{name:'Atualizar disponibilidade para revisar'}).waitFor();
  assert.equal(await dentist.locator('[name="availability.0.start_time"]').inputValue(),'12:00');
  assert.equal(await dentist.getByRole('button',{name:'Salvar',exact:true}).isDisabled(),true);
  await dentist.screenshot({path:path.join(__dirname,'../.data/homolog/availability-policy-blocked.png'),fullPage:true});
  stage='explicit cancellation';await booking.locator('[name=status]').selectOption('cancelled');await save(booking,'appointments',200);
  await booking.locator('[name=status]').waitFor({state:'hidden'});
  await dentist.getByRole('button',{name:'Atualizar disponibilidade para revisar'}).click();
  await dentist.getByText(/Dados atualizados\. Revise/).waitFor();
  assert.equal(await dentist.locator('[name="availability.0.start_time"]').inputValue(),'12:00');
  await save(dentist,'dentists',200);
  stage='reactivation conflict preserves draft';
  await booking.getByRole('row').filter({hasText:'Fictitious policy patient'}).getByRole('button',{name:'Editar',exact:true}).click();
  await booking.locator('[name=status]').selectOption('confirmed');await booking.locator('[name=notes]').fill('Fictitious retained draft');
  assert.equal((await save(booking,'appointments',409)).code,'availability_conflict');
  const reload=booking.getByRole('button',{name:'Atualizar disponibilidade para revisar'});await reload.waitFor();
  await booking.route('**/api/dentists?**',route=>route.fulfill({status:503,contentType:'application/json',body:'{"detail":"Fictitious unavailable"}'}));
  stage='failed reference refresh';const failed=booking.waitForResponse(r=>r.url().includes('/api/dentists?')&&r.status()===503);
  await reload.click();await failed;
  await booking.getByText('O serviço está temporariamente indisponível. Confira o resultado da operação antes de tentar novamente.',{exact:true}).waitFor();
  assert.equal(await booking.getByRole('button',{name:'Salvar',exact:true}).isDisabled(),true);
  assert.equal(await booking.locator('[name=notes]').inputValue(),'Fictitious retained draft');
  await booking.unroute('**/api/dentists?**');
  stage='review and compatible reactivation';await reload.click();await booking.getByText(/Dados atualizados\. Revise/).waitFor();
  await booking.locator('[name=start_at]').fill('2030-01-07T13:00');await booking.locator('[name=end_at]').fill('2030-01-07T14:00');
  assert.equal(await booking.locator('[name=notes]').inputValue(),'Fictitious retained draft');
  await booking.screenshot({path:path.join(__dirname,'../.data/homolog/availability-policy-reviewed.png'),fullPage:true});
  const saved=await save(booking,'appointments',200);assert.equal(saved.status,'confirmed');assert.equal(saved.notes,'Fictitious retained draft');
  console.log('OK: Chrome two tabs block incompatible dentist change, preserve drafts, require cancellation and successful reference refresh, then accept compatible reactivation.');
 } finally {await browser.close();}
})().catch(()=>{console.error('Availability browser failed at stage: '+stage);process.exitCode=1;});
