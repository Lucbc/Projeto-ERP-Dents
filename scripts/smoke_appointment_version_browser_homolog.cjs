// Real list/calendar drafts in Chrome, using fictitious homologation fixtures only.
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const state=path.resolve(__dirname,'../.data/homolog');
let stage='start';
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({ignoreHTTPSErrors:false,timezoneId:'America/Sao_Paulo',viewport:{width:1366,height:1000}});
  let api;
  const cleanup=[];
  try {
    const list=await context.newPage();
    stage='login';
    await list.goto('https://localhost:18443/login');
    const credentials=JSON.parse(fs.readFileSync(path.join(state,'admin.json'),'utf8'));
    await list.locator('input[name=email]').fill(credentials.email);
    await list.locator('input[name=password]').fill(credentials.password);
    const loginResponse=list.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.request().method()==='POST');
    await list.getByRole('button',{name:'Entrar',exact:true}).click();
    const login=await(await loginResponse).json();
    await list.getByText('Pacientes cadastrados',{exact:true}).waitFor();
    const headers={'Content-Type':'application/json','X-Session-ID':login.session_id,'X-CSRF-Token':login.csrf_token};
    api=async(method,url,data)=>list.evaluate(async({method,url,data,headers})=>{
      const response=await fetch(url,{method,headers,body:data?JSON.stringify(data):undefined});
      if(!response.ok) throw new Error('Fictitious fixture operation failed');
      return response.status===204?null:response.json();
    },{method,url,data,headers});
    stage='fixtures';
    const patient=await api('POST','/api/patients',{full_name:'Fictitious Version Calendar Patient'});
    cleanup.push('/api/patients/'+patient.id);
    const dentist=await api('POST','/api/dentists',{full_name:'Fictitious Version Calendar Dentist',availability:
      ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day_of_week=>({day_of_week,start_time:'00:00',end_time:'23:59'}))});
    cleanup.push('/api/dentists/'+dentist.id);
    const procedures=[];
    for(const suffix of ['A','B']) {
      const procedure=await api('POST','/api/procedures',{name:'Fictitious Edit Procedure '+suffix,price_cents:1000,duration_minutes:15});
      procedures.push(procedure.id);cleanup.push('/api/procedures/'+procedure.id);
    }
    const start=new Date();start.setUTCHours(13,0,0,0);
    const appointment=await api('POST','/api/appointments',{patient_id:patient.id,dentist_id:dentist.id,
      start_at:start.toISOString(),end_at:new Date(+start+3600000).toISOString(),procedure_ids:[procedures[0]]});
    const url='/api/appointments/'+appointment.id;
    cleanup.push(url);
    const calendar=await context.newPage();
    async function openList(){await list.goto('https://localhost:18443/appointments');await list.getByRole('row').filter({hasText:patient.full_name}).getByRole('button',{name:'Editar',exact:true}).click();}
    async function openCalendar(){await calendar.goto('https://localhost:18443/calendar');await calendar.locator('.rbc-event').filter({hasText:patient.full_name}).first().click();}
    async function save(page,status){const response=page.waitForResponse(r=>r.url().endsWith(url)&&r.request().method()==='PUT');await page.getByRole('button',{name:'Salvar',exact:true}).click();assert.equal((await response).status(),status);}
    async function recover(page,name){
      const reload=page.getByRole('button',{name:/Descartar rascunho e carregar (consulta )?atual/});
      await reload.waitFor();await reload.scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(state,name+'.png'),fullPage:true});
      await reload.click();await reload.waitFor({state:'hidden'});
    }
    stage='open list and calendar drafts';
    await openList();await openCalendar();
    await list.locator('textarea[name=notes]').fill('List winner');
    await calendar.locator('textarea[name=notes]').fill('Calendar draft');
    await calendar.getByRole('checkbox',{name:/Fictitious Edit Procedure A/}).uncheck();
    await calendar.getByRole('checkbox',{name:/Fictitious Edit Procedure B/}).check();
    stage='calendar conflict preserves draft and procedure selection';
    await save(list,200);await save(calendar,409);
    assert.equal(await calendar.locator('textarea[name=notes]').inputValue(),'Calendar draft');
    assert.equal(await calendar.getByRole('checkbox',{name:/Fictitious Edit Procedure B/}).isChecked(),true);
    assert.deepEqual((await api('GET',url)).procedure_ids,[procedures[0]]);
    await recover(calendar,'calendar-version-conflict');
    assert.equal(await calendar.locator('textarea[name=notes]').inputValue(),'List winner');
    assert.equal(await calendar.getByRole('checkbox',{name:/Fictitious Edit Procedure A/}).isChecked(),true);
    await calendar.locator('textarea[name=notes]').fill('Calendar reviewed');await save(calendar,200);
    stage='list conflict after calendar edit';
    await openList();await openCalendar();
    await list.locator('textarea[name=notes]').fill('List stale draft');
    await calendar.locator('textarea[name=notes]').fill('Calendar winner');
    await save(calendar,200);await save(list,409);
    assert.equal(await list.locator('textarea[name=notes]').inputValue(),'List stale draft');
    await recover(list,'list-version-conflict');
    assert.equal(await list.locator('textarea[name=notes]').inputValue(),'Calendar winner');
    await list.locator('textarea[name=notes]').fill('List reviewed');await save(list,200);
    const current=await api('GET',url);
    assert.equal(current.version,5);assert.equal(current.notes,'List reviewed');
    assert.deepEqual(current.procedure_ids,[procedures[0]]);
    console.log('OK: list and calendar reject stale drafts, preserve selections, reload explicitly and save reviewed versions.');
  } finally {
    if (api) { const originalApi = api; api = async (method, url, ...args) => {
      if (method === 'DELETE' && /^\/api\/patients\/[^/?]+$/.test(url))
        url = await require('./patient_deletion_homolog.cjs').patientDeletionPath(p => originalApi('GET', p), url);
      return originalApi(method, url, ...args);
    }; }

    try { if(api) {for(const url of cleanup.reverse()) await api('DELETE',url+(/^\/api\/(procedures|appointments|dentists)\//.test(url)?'?version='+(await api('GET',url)).version:''));await api('POST','/api/auth/logout');} }
    finally {await browser.close();}
  }
})().catch(()=>{console.error('Appointment version browser test failed at: '+stage+'; inspect fictitious fixtures locally if cleanup failed.');process.exitCode=1;});
