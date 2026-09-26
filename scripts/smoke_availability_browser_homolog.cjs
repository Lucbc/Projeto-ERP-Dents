// Only stage labels are reported; fixture and credentials belong to the private harness.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
let stage='start';
process.on('unhandledRejection',()=>{console.error('Availability browser failed at stage: '+stage);process.exit(1);});
(async()=>{
 const credentials=JSON.parse(fs.readFileSync(0,'utf8'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const context=await browser.newContext({ignoreHTTPSErrors:false,viewport:{width:1440,height:1100}});
  const page=await context.newPage();stage='login';
  await page.goto('https://localhost:18444/login');
  await page.locator('[name=email]').fill(credentials.email);await page.locator('[name=password]').fill(credentials.password);
  await page.getByRole('button',{name:'Entrar',exact:true}).click();await page.getByText('Pacientes cadastrados',{exact:true}).waitFor();
  stage='legacy reading';await page.goto('https://localhost:18444/dentists');
  await page.getByText('Fictitious legacy clock',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Editar',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'horários inválidos'}).waitFor();
  const start=page.locator('[name="availability.0.start_time"]'),end=page.locator('[name="availability.0.end_time"]');
  assert.equal(await start.inputValue(),'08:00:30');
  await page.locator('[name=full_name]').fill('Fictitious corrected clock');
  stage='invalid range keeps draft';await start.fill('09:00');await end.fill('08:00');
  let updates=0;page.on('request',request=>{if(request.method()==='PUT'&&request.url().includes('/api/dentists/'))updates++;});
  await page.getByRole('button',{name:'Salvar',exact:true}).click();
  await page.getByText('Horario final deve ser maior que o inicial.',{exact:true}).waitFor();
  assert.equal(updates,0);assert.equal(await page.locator('[name=full_name]').inputValue(),'Fictitious corrected clock');
  await page.screenshot({path:path.join(__dirname,'../.data/homolog/availability-invalid-draft.png'),fullPage:true});
  stage='explicit correction';await end.fill('12:00');
  const response=page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/api/dentists/'));
  await page.getByRole('button',{name:'Salvar',exact:true}).click();const result=await response;
  assert.equal(result.status(),200);const saved=await result.json();assert.equal(saved.version,2);
  assert.deepEqual(saved.availability,[{day_of_week:'monday',start_time:'09:00',end_time:'12:00'}]);
  await page.getByText('Fictitious corrected clock',{exact:true}).waitFor();
  await page.reload();await page.getByText('Segunda 09:00-12:00',{exact:true}).waitFor();
  await page.screenshot({path:path.join(__dirname,'../.data/homolog/availability-corrected.png'),fullPage:true});
  console.log('OK: Chrome reads legacy seconds unchanged, warns, rejects inverted hours without request or draft loss, and saves explicit correction with version increment.');
 } finally {await browser.close();}
})().catch(()=>{console.error('Availability browser failed at stage: '+stage);process.exitCode=1;});
