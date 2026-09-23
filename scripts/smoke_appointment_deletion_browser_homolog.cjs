// Private fictitious schema only. Never emit Playwright diagnostics or credentials.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
let stage='start';
process.on('unhandledRejection',()=>{console.error('Appointment deletion browser failed at stage: '+stage);process.exit(1);});
(async()=>{
 const credentials=JSON.parse(fs.readFileSync(0,'utf8'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const context=await browser.newContext({ignoreHTTPSErrors:false,timezoneId:'America/Sao_Paulo',viewport:{width:1440,height:1000}});
  const list=await context.newPage(),calendar=await context.newPage();
  stage='login';await list.goto('https://localhost:18444/login');
  await list.locator('[name=email]').fill(credentials.email);await list.locator('[name=password]').fill(credentials.password);
  const loginResponse=list.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.request().method()==='POST');
  await list.getByRole('button',{name:'Entrar',exact:true}).click();
  const login=await(await loginResponse).json();await list.getByText('Pacientes cadastrados',{exact:true}).waitFor();
  const headers={'Content-Type':'application/json','X-Session-ID':login.session_id,'X-CSRF-Token':login.csrf_token};
  const api=(method,url,data)=>list.evaluate(async({method,url,data,headers})=>{
   const response=await fetch(url,{method,headers,body:data?JSON.stringify(data):undefined});
   return {status:response.status,body:response.status===204?null:await response.json()};
  },{method,url,data,headers});
  stage='fixtures';
  const patient=(await api('POST','/api/patients',{full_name:'Fictitious deletion calendar patient'})).body;
  const dentist=(await api('POST','/api/dentists',{full_name:'Fictitious deletion calendar dentist',availability:
   ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>({day_of_week:day,start_time:'00:00',end_time:'23:59'}))})).body;
  const procedure=(await api('POST','/api/procedures',{name:'Fictitious deletion procedure',price_cents:12000})).body;
  const start=new Date();start.setUTCHours(13,0,0,0);
  const localInput=(date)=>new Date(+date-3*3600000).toISOString().slice(0,16);
  for(const scenario of ['calendar','list']) {
   stage=scenario+' create';
   const created=await api('POST','/api/appointments',{patient_id:patient.id,dentist_id:dentist.id,
    procedure_ids:[procedure.id],start_at:start.toISOString(),end_at:new Date(+start+3600000).toISOString()});
   assert.equal(created.status,201);const appointment=created.body,url='/api/appointments/'+appointment.id;
   const payload={status:scenario==='calendar'?'paid':'pending',idempotency_key:randomUUID()};
   const generated=await api('POST','/api/financial/from-appointment/'+appointment.id,payload);assert.equal(generated.status,201);
   const entry=generated.body,financialUrl='/api/financial/'+entry.id;
   const history=(await api('GET',financialUrl+'/payments')).body;
   await list.goto('https://localhost:18444/appointments');
   await list.getByRole('row').filter({hasText:patient.full_name}).waitFor();
   await calendar.goto('https://localhost:18444/calendar');
   await calendar.locator('.rbc-event').filter({hasText:patient.full_name}).first().click();
   const editor=scenario==='calendar'?list:calendar,deleter=scenario==='calendar'?calendar:list;
   if(editor===list) await list.getByRole('row').filter({hasText:patient.full_name}).getByRole('button',{name:'Editar',exact:true}).click();
   await editor.locator('[name=start_at]').fill(localInput(new Date(+start+7200000)));
   await editor.locator('[name=end_at]').fill(localInput(new Date(+start+10800000)));
   await editor.locator('[name=notes]').fill('Fictitious rescheduled appointment');
   stage=scenario+' reschedule';
   const saved=editor.waitForResponse(r=>r.url().endsWith(url)&&r.request().method()==='PUT');
   await editor.getByRole('button',{name:'Salvar',exact:true}).click();assert.equal((await saved).status(),200);
   if(deleter===calendar) {
    await calendar.locator('[name=notes]').fill('Fictitious unsaved draft');
    await calendar.locator('[name=start_at]').fill(localInput(new Date(+start+14400000)));
   }
   const deleteButton=()=>deleter===list?list.getByRole('row').filter({hasText:patient.full_name}).getByRole('button',{name:'Excluir',exact:true}):calendar.getByRole('button',{name:'Excluir',exact:true});
   async function remove(status,version) {
    let message;
    deleter.once('dialog',async dialog=>{message=dialog.message();await dialog.accept();});
    const response=deleter.waitForResponse(r=>r.url().includes(url)&&r.request().method()==='DELETE');
    await deleteButton().click();const result=await response;
    assert.equal(result.status(),status);assert.ok(result.url().endsWith('?version='+version));
    assert.ok(message.includes(patient.full_name));assert.ok(message.includes('não cancela cobranças nem pagamentos'));
    return message;
   }
   stage=scenario+' stale deletion';const message=await remove(409,1);
   assert.equal((await api('GET',url)).body.version,2);
   if(deleter===calendar) {
    assert.ok(message.includes('rascunho não serão aplicadas'));
    assert.ok(message.includes('10:00:00'));assert.ok(!message.includes('14:00:00'));
    assert.equal(await calendar.locator('[name=notes]').inputValue(),'Fictitious unsaved draft');
   }
   const reload=deleter.getByRole('button',{name:deleter===list?'Recarregar lista para conferir':'Descartar rascunho e carregar consulta atual',exact:true});
   await reload.waitFor();await reload.scrollIntoViewIfNeeded();
   await deleter.screenshot({path:path.resolve(__dirname,'../.data/homolog/appointment-deletion-'+scenario+'.png'),fullPage:true});
   await reload.click();await reload.waitFor({state:'hidden'});
   if(deleter===calendar) assert.equal(await calendar.locator('[name=notes]').inputValue(),'Fictitious rescheduled appointment');
   // Keep the calendar's saved version open while the list removes it.
   if(deleter===list) await calendar.locator('.rbc-event').filter({hasText:patient.full_name}).first().click();
   stage=scenario+' reviewed deletion';await remove(204,2);assert.equal((await api('GET',url)).status,404);
   const current=(await api('GET',financialUrl)).body;
   assert.equal(current.appointment_id,null);assert.equal(current.version,entry.version);assert.equal(current.status,entry.status);
   assert.equal(current.total_cents,entry.total_cents);assert.deepEqual(current.reference_snapshot,entry.reference_snapshot);
   assert.deepEqual((await api('GET',financialUrl+'/payments')).body,history);
   assert.equal((await api('POST','/api/financial/from-appointment/'+appointment.id,payload)).body.id,entry.id);
   if(deleter===list) {
    stage='calendar absence';await calendar.locator('[name=notes]').fill('Fictitious absent draft');
    calendar.once('dialog',dialog=>dialog.accept());
    const absent=calendar.waitForResponse(r=>r.url().includes(url)&&r.request().method()==='DELETE');
    await calendar.getByRole('button',{name:'Excluir',exact:true}).click();assert.equal((await absent).status(),404);
    await calendar.getByText(/A consulta não está mais disponível/).waitFor();
    assert.equal(await calendar.locator('[name=notes]').inputValue(),'Fictitious absent draft');
    await calendar.getByRole('button',{name:'Cancelar',exact:true}).click();
   }
  }
  console.log('Chrome HTTPS: list/calendar reject stale deletions after rescheduling, preserve drafts, require explicit review/new confirmation, handle absence and preserve charges/history.');
 } finally {await browser.close();}
})().catch(()=>{console.error('Appointment deletion browser failed at stage: '+stage);process.exitCode=1;});
