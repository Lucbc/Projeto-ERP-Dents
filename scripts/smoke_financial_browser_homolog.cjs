// Fictitious lost-response regression in Chrome with trusted homologation HTTPS.
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
    const patient=await api('POST','/api/patients',{full_name:'Fictitious Financial UI Patient'});
    cleanup.push('/api/patients/'+patient.id);
    const dentist=await api('POST','/api/dentists',{full_name:'Fictitious Financial UI Dentist',availability:[
      {day_of_week:'monday',start_time:'08:00',end_time:'18:00'}]});
    cleanup.push('/api/dentists/'+dentist.id);
    const procedure=await api('POST','/api/procedures',{name:'Fictitious Financial UI Procedure',price_cents:12000});
    cleanup.push('/api/procedures/'+procedure.id);
    const start=new Date();
    start.setUTCDate(start.getUTCDate()+((8-start.getUTCDay())%7||7));
    start.setUTCHours(13,0,0,0);
    const appointment=await api('POST','/api/appointments',{patient_id:patient.id,dentist_id:dentist.id,
      start_at:start.toISOString(),end_at:new Date(+start+3600000).toISOString(),procedure_ids:[procedure.id]});
    cleanup.push('/api/appointments/'+appointment.id);
    stage='open generation form';
    await page.goto('https://localhost:18443/financial');
    await page.getByRole('button',{name:'Gerar da consulta',exact:true}).click();
    await page.locator('select[name=appointment_id] option[value="'+appointment.id+'"]').waitFor({state:'attached'});
    await page.locator('select[name=appointment_id]').selectOption(appointment.id);
    await page.locator('textarea[name=notes]').fill('Fictitious preserved retry');
    let firstKey, firstId, interceptionFailed=false;
    stage='lose response after successful commit';
    const generationUrl='**/api/financial/from-appointment/'+appointment.id;
    await page.route(generationUrl, async route=>{
      try {
        firstKey=route.request().postDataJSON().idempotency_key;
        const response=await route.fetch();
        assert.equal(response.status(),201);
        firstId=(await response.json()).id;
        cleanup.push('/api/financial/'+firstId);
      } catch { interceptionFailed=true; }
      finally { await route.abort('failed').catch(()=>{}); }
    },{times:1});
    await page.getByRole('button',{name:'Gerar',exact:true}).click();
    await page.getByRole('alert').waitFor();
    assert.equal(interceptionFailed,false);
    assert.equal(await page.locator('textarea[name=notes]').inputValue(),'Fictitious preserved retry');
    assert.ok(firstKey);
    stage='retry recovers persisted result';
    const retryResponse=page.waitForResponse(r=>r.url().endsWith('/api/financial/from-appointment/'+appointment.id));
    await page.getByRole('button',{name:'Gerar',exact:true}).click();
    const response=await retryResponse;
    stage='check retry HTTP status';
    assert.equal(response.status(),201);
    stage='check repeated key';
    assert.equal(response.request().postDataJSON().idempotency_key,firstKey);
    stage='check recovered entry ID';
    assert.equal((await response.json()).id,firstId);
    stage='wait for generation success notification';
    await page.getByRole('status').filter({hasText:'Lancamento financeiro gerado'}).waitFor();
    stage='wait for modal to close';
    await page.locator('select[name=appointment_id]').waitFor({state:'hidden'});
    stage='verify persisted charge count';
    const entries=await api('GET','/api/financial?appointment_id='+appointment.id);
    assert.equal(entries.total,1);
    await page.screenshot({path:path.join(state,'financial-retry.png'),fullPage:true});
    console.log('OK: Chrome lost response after commit; retry retained key and recovered exactly one charge.');
  } finally {
    try {
      if(api) { for(const url of cleanup.reverse()) { const target=url.startsWith('/api/financial/')?url+'?version='+(await api('GET',url)).version:url; await api('DELETE',target); } await api('POST','/api/auth/logout'); }
    } finally { await browser.close(); }
  }
})().catch(()=>{console.error('Financial browser test failed at: '+stage+'; inspect fictitious fixtures locally if cleanup failed.');process.exitCode=1;});
