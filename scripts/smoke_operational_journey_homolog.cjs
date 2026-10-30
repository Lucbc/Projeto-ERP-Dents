// Fictional end-to-end journey. Credentials only through stdin; errors only by stage.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
process.on('unhandledRejection', () => { console.error('Operational journey failed at stage: ' + stage); process.exit(1); });
(async () => {
  const input = JSON.parse(fs.readFileSync(0, 'utf8'));
  const browser = await chromium.launch({channel:'chrome', headless:true});
  const origin = 'https://localhost:18444';
  try {
    const session = async (email, zone) => {
      const page = await (await browser.newContext({timezoneId:zone, viewport:{width:1440,height:1100}})).newPage();
      await page.goto(origin+'/login');
      await page.locator('[name=email]').fill(email);
      await page.locator('[name=password]').fill(input.password);
      const response = page.waitForResponse(r=>r.url().endsWith('/api/auth/login') && r.request().method()==='POST');
      await page.getByRole('button',{name:'Entrar',exact:true}).click();
      const identity = await (await response).json();
      await page.getByRole('region',{name:'Pacientes cadastrados',exact:true}).waitFor();
      const api = async (method,url,data,expected=200) => {
        const result = await page.evaluate(async ({identity,method,url,data}) => {
          const r = await fetch(url,{method,headers:{'Content-Type':'application/json','X-Session-ID':identity.session_id,'X-CSRF-Token':identity.csrf_token},body:data?JSON.stringify(data):undefined});
          return {status:r.status,body:r.status===204?null:await r.json()};
        },{identity,method,url,data});
        assert.equal(result.status,expected,'Unexpected HTTP status'); return result.body;
      };
      return {page,api,identity};
    };
    stage='admin preparation';
    const admin = await session(input.email,'America/Sao_Paulo');
    const dentist = await admin.api('POST','/api/dentists',{full_name:'Dentista Percurso Ficticio',availability:
      ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(day=>({day_of_week:day,start_time:'08:00',end_time:'18:00'}))},201);
    const procedure = await admin.api('POST','/api/procedures',{name:'Procedimento Percurso Ficticio',price_cents:12000,duration_minutes:60},201);
    for (const role of ['reception','dentist']) {
      await admin.api('POST','/api/users',{name:'Operador Ficticio '+role,email:role+'-journey@example.com',password:input.password,role,...(role==='dentist'?{dentist_id:dentist.id}:{})},201);
    }
    // Reception can register/book, but cannot read billing or administer users.
    const matrix = (await admin.api('GET','/api/permissions')).items.find(p=>p.role==='reception');
    for (const actions of Object.values(matrix.permissions)) for (const key of Object.keys(actions)) actions[key]=false;
    for (const resource of ['dashboard','patients','dentists','procedures','appointments']) matrix.permissions[resource].view=true;
    matrix.permissions.patients.create=true; matrix.permissions.patients.update=true;
    matrix.permissions.appointments.create=true;
    await admin.api('PUT','/api/permissions/reception',{version:matrix.version,permissions:matrix.permissions});
    stage='reception login and patient creation';
    const reception = await session('reception-journey@example.com','America/Sao_Paulo'), page=reception.page;
    await page.goto(origin+'/patients');
    await page.getByRole('button',{name:'Novo',exact:true}).click();
    await page.locator('[name=full_name]').fill('Paciente Percurso Ficticio');
    await page.locator('[name=birth_date]').fill('1990-01-15');
    await page.locator('[name=phone]').fill('11999990000');
    const created = page.waitForResponse(r=>r.url().endsWith('/api/patients')&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Salvar',exact:true}).click();
    const patientResponse=await created; assert.equal(patientResponse.status(),201); const patient=await patientResponse.json();
    stage='patient search and reopen';
    await page.getByPlaceholder(/Buscar por nome/).fill(patient.full_name);
    const patientRow=page.getByRole('row').filter({hasText:patient.full_name});
    await patientRow.getByRole('button',{name:'Editar',exact:true}).click();
    assert.equal(await page.locator('[name=birth_date]').inputValue(),'1990-01-15');
    await page.getByRole('button',{name:'Cancelar',exact:true}).click();
    stage='create appointment through reception UI';
    await page.goto(origin+'/appointments');
    await page.getByRole('button',{name:'Nova',exact:true}).click();
    for (const [field,label] of [['patient_id',patient.full_name],['dentist_id',dentist.full_name]]) {
      if (field==='patient_id') { await page.locator('[name=patient_id]').selectOption(patient.id); continue; }
      const group=page.locator('select[name='+field+']').locator('..');
      await group.locator('input').fill(label); await group.getByRole('button',{name:label,exact:true}).click();
    }
    await page.getByLabel(procedure.name,{exact:false}).check();
    await page.locator('[name=start_at]').fill(input.day+'T10:00');
    await page.locator('[name=end_at]').fill(input.day+'T11:00');
    const booked=page.waitForResponse(r=>r.url().endsWith('/api/appointments')&&r.request().method()==='POST');
    await page.getByRole('button',{name:'Salvar',exact:true}).click();
    const bookingResponse=await booked; assert.equal(bookingResponse.status(),201); const appointment=await bookingResponse.json();
    assert.equal(Date.parse(appointment.start_at),Date.parse(input.day+'T13:00:00Z'));
    stage='dentist reads same patient and consultation';
    const clinical=await session('dentist-journey@example.com','UTC');
    assert.notEqual(clinical.identity.session_id,reception.identity.session_id);
    await clinical.page.goto(origin+'/consultation');
    await clinical.page.getByRole('region',{name:'Próxima consulta',exact:true}).getByText(patient.full_name,{exact:true}).waitFor();
    await clinical.page.getByRole('region',{name:'Próxima consulta',exact:true}).getByText(/Início:.*10:00:00.*Fim:.*11:00:00/).waitFor();
    await clinical.page.getByRole('textbox',{name:'Buscar pacientes'}).fill(patient.full_name);
    await clinical.page.getByRole('region',{name:'Pacientes',exact:true}).getByRole('row').filter({hasText:patient.full_name}).getByRole('button',{name:'Abrir',exact:true}).click();
    await clinical.page.getByRole('region',{name:'Dados do paciente',exact:true}).getByText(/15\/01\/1990/).waitFor();
    stage='permission boundaries';
    await reception.api('GET','/api/financial',undefined,403);
    await reception.api('GET','/api/users',undefined,403);
    await clinical.api('POST','/api/financial/from-appointment/'+appointment.id,{status:'pending',idempotency_key:require('node:crypto').randomUUID()},403);
    await page.goto(origin+'/financial');
    await page.getByText('Sem permissão para acessar esta página.',{exact:true}).waitFor();
    stage='authorized billing UI';
    const billing=admin.page;
    await billing.goto(origin+'/financial');
    await billing.getByRole('button',{name:'Gerar da consulta',exact:true}).click();
    await billing.locator('select[name=appointment_id] option[value="'+appointment.id+'"]').waitFor({state:'attached'});
    await billing.locator('[name=appointment_id]').selectOption(appointment.id);
    const generated=billing.waitForResponse(r=>r.url().endsWith('/api/financial/from-appointment/'+appointment.id)&&r.request().method()==='POST');
    await billing.getByRole('button',{name:'Gerar',exact:true}).click();
    const generationResponse=await generated; assert.equal(generationResponse.status(),201); const entry=await generationResponse.json();
    assert.equal(entry.patient_id,patient.id); assert.equal(entry.appointment_id,appointment.id); assert.equal(entry.amount_cents,12000);
    assert.equal(entry.due_date,input.day); assert.equal(entry.status,'pending');
    stage='payment and history UI';
    const row=billing.getByRole('row').filter({hasText:entry.description});
    await row.getByRole('button',{name:'Baixar',exact:true}).click();
    const paid=billing.waitForResponse(r=>r.url().endsWith('/api/financial/'+entry.id+'/mark-paid')&&r.request().method()==='POST');
    await billing.getByRole('button',{name:'Confirmar baixa integral'}).click();
    assert.equal((await paid).status(),200);
    await billing.getByRole('button',{name:'Fechar',exact:true}).click();
    await row.getByRole('button',{name:'Ver pagamentos',exact:true}).click();
    await billing.getByRole('heading',{name:'Pagamentos e estornos',exact:true}).waitFor();
    const paymentCard=billing.locator('article').filter({hasText:'Pagamento ativo'});
    await paymentCard.getByText(/120,00/).waitFor();
    assert.equal(await paymentCard.count(),1);
    await paymentCard.getByText('Paciente: '+patient.full_name,{exact:true}).waitFor();
    const history=await admin.api('GET','/api/financial/'+entry.id+'/payments');
    assert.equal(history.length,1); assert.equal(history[0].total_cents,12000);
    assert.equal(history[0].reference_snapshot.patient.name,patient.full_name);
    const current=await admin.api('GET','/api/financial/'+entry.id);
    assert.equal(current.status,'paid'); assert.equal(current.version,entry.version+1);
    assert.equal((await admin.api('GET','/api/financial?appointment_id='+appointment.id)).total,1);
    assert.equal((await reception.api('GET','/api/patients/'+patient.id)).version,patient.version);
    console.log('PASS: UI patient registration/reopen, booking, independent dentist consultation, denied reception billing/users and dentist generation, authorized generation/payment/history; API links, values, versions and single charge/payment verified.');
  } finally { await browser.close(); }
})().catch(()=>{console.error('Operational journey failed at stage: '+stage);process.exitCode=1;});
