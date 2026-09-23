// Fictitious UI regression. Requires existing Chrome and trusted homologation TLS.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const state = path.resolve(__dirname,'../.data/homolog');
let stage = 'start';
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const context = await browser.newContext({ignoreHTTPSErrors:false,timezoneId:'America/Sao_Paulo',viewport:{width:1366,height:1000}});
  const cleanup=[];
  let api;
  try {
    const page=await context.newPage();
    stage='login';
    await page.goto('https://localhost:18443/login');
    const credentials=JSON.parse(fs.readFileSync(path.join(state,'admin.json'),'utf8'));
    await page.locator('input[name=email]').fill(credentials.email);
    await page.locator('input[name=password]').fill(credentials.password);
    const loginResponse=page.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    const login=await (await loginResponse).json();
    await page.getByText('Pacientes cadastrados',{exact:true}).waitFor();
    const headers={'Content-Type':'application/json','X-Session-ID':login.session_id,'X-CSRF-Token':login.csrf_token};
    api=async(method,url,data)=>page.evaluate(async ({method,url,data,headers})=>{
      const response=await fetch(url,{method,headers,body:data?JSON.stringify(data):undefined});
      if(!response.ok) throw new Error('Fictitious fixture operation failed');
      return response.status===204?null:response.json();
    },{method,url,data,headers});
    stage='fixtures';
    const patient=await api('POST','/api/patients',{full_name:'Fictitious Agenda UI Patient'});
    cleanup.push('/api/patients/'+patient.id);
    const dentist=await api('POST','/api/dentists',{full_name:'Fictitious Agenda UI Dentist',availability:[
      {day_of_week:'monday',start_time:'08:00',end_time:'18:00'}]});
    cleanup.push('/api/dentists/'+dentist.id);
    stage='open appointment form';
    await page.goto('https://localhost:18443/appointments');
    await page.getByRole('button',{name:'Nova',exact:true}).click();
    await page.locator('select[name=patient_id] option[value="'+patient.id+'"]').waitFor({state:'attached'});
    await page.locator('select[name=patient_id]').selectOption(patient.id);
    await page.locator('select[name=dentist_id]').selectOption(dentist.id);
    await page.locator('input[name=start_at]').fill('2030-01-07T10:00');
    await page.locator('input[name=end_at]').fill('2030-01-07T11:00');
    await page.locator('textarea[name=notes]').fill('Rascunho fictício preservado');
    stage='another operator reserves the chosen slot';
    const appointment=await api('POST','/api/appointments',{patient_id:patient.id,dentist_id:dentist.id,
      start_at:'2030-01-07T13:00:00Z',end_at:'2030-01-07T14:00:00Z',status:'scheduled'});
    cleanup.push('/api/appointments/'+appointment.id);
    stage='conflict response preserves form';
    const conflict=page.waitForResponse(r=>r.url().endsWith('/api/appointments')&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Salvar',exact:true}).click();
    assert.equal((await conflict).status(),409);
    await page.getByRole('alert').filter({hasText:'Conflito de agenda'}).waitFor();
    assert.equal(await page.locator('textarea[name=notes]').inputValue(),'Rascunho fictício preservado');
    assert.equal(await page.locator('input[name=start_at]').inputValue(),'2030-01-07T10:00');
    await page.screenshot({path:path.join(state,'agenda-conflict.png'),fullPage:true});
    console.log('OK: real HTTP 409 shown in Chrome; appointment draft and dates preserved.');
  } finally {
    try {
      if(api) { for(const url of cleanup.reverse()) await api('DELETE',url+(url.startsWith('/api/appointments/')?'?version='+(await api('GET',url)).version:'')); await api('POST','/api/auth/logout'); }
    } finally { await browser.close(); }
  }
})().catch(()=>{console.error('Agenda browser test failed at: '+stage+'; inspect fictitious fixtures locally if cleanup failed.');process.exitCode=1;});
