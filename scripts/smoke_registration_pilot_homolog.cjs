const fs = require('node:fs'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
(async () => {
  const credentials = JSON.parse(fs.readFileSync(0, 'utf8'));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const origin = 'https://localhost:18444';
  try {
    const admin = await (await browser.newContext()).newPage();
    const reception = await (await browser.newContext({ timezoneId: 'America/Sao_Paulo' })).newPage();
    const login = async (page, email) => {
      await page.goto(origin + '/login');
      await page.locator('[name=email]').fill(email);
      await page.locator('[name=password]').fill(credentials.password);
      const response = page.waitForResponse(r => r.url().endsWith('/api/auth/login') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      const identity = await (await response).json();
      await page.getByRole('region', { name: 'Pacientes cadastrados', exact: true }).waitFor();
      return identity;
    };
    stage = 'admin login'; const author = await login(admin, credentials.email);
    const api = async (page, identity, method, url, data, expected = 200) => {
      const result = await page.evaluate(async ({identity,method,url,data}) => {
        const response = await fetch(url, {method, headers: {'Content-Type':'application/json',
          'X-Session-ID':identity.session_id,'X-CSRF-Token':identity.csrf_token}, body:data ? JSON.stringify(data):undefined});
        return { status:response.status, body:response.status === 204 ? null : await response.json() };
      }, {identity,method,url,data});
      assert.equal(result.status, expected, 'Unexpected fixture/API status'); return result.body;
    };
    stage = 'individual reception account';
    const account = await api(admin, author, 'POST', '/api/users', {
      name:'Recepcao Piloto Ficticia', email:'pilot-reception@example.com', password:credentials.password, role:'reception'
    }, 201);
    const matrix = (await api(admin, author, 'GET', '/api/permissions')).items.find(p => p.role === 'reception');
    for (const actions of Object.values(matrix.permissions)) {
      for (const action of Object.keys(actions)) actions[action] = false;
    }
    matrix.permissions.patients = {view:true,create:true,update:true,delete:false};
    matrix.permissions.dashboard.view = true;
    await api(admin, author, 'PUT', '/api/permissions/reception', {version:matrix.version,permissions:matrix.permissions});
    const oldest = await api(admin, author, 'POST', '/api/patients', {
      full_name:'Paciente Antigo Jo\u00e3o Gon\u00e7alves Ficticio', preferred_name:'Nome Social Jos\u00e9 Piloto Ficticio', birth_date:'1990-01-15', cpf:'123.456.789-01', phone:'(11) 3333-4444'
    }, 201);
    for(let i=0;i<104;i++) await api(admin, author, 'POST', '/api/patients', {full_name:'Massa Piloto Ficticia '+String(i).padStart(3,'0')},201);
    stage = 'reception permissions'; const receiver = await login(reception, account.email);
    assert.notEqual(author.session_id, receiver.session_id);
    await api(reception,receiver,'GET','/api/users',undefined,403);
    await api(reception,receiver,'GET','/api/financial/summary',undefined,403);
    await api(reception,receiver,'DELETE','/api/patients/'+oldest.id+'?version='+oldest.version,undefined,403);
    await reception.goto(origin+'/patients');
    stage = 'find patient outside first 100';
    await reception.getByText(/Exibindo 100 de 105 pacientes/).waitFor();
    stage = 'pagination beyond 100';
    await reception.getByRole('button',{name:'Próxima página',exact:true}).click();
    await reception.getByText(/Exibindo 5 de 105 pacientes/).waitFor();
    await reception.getByRole('row').filter({hasText:oldest.full_name}).waitFor();
    assert.equal(await reception.getByRole('button',{name:'Próxima página',exact:true}).isDisabled(),true);
    const search = reception.getByPlaceholder(/Buscar por nome/);
    await search.fill(oldest.full_name);
    const oldRow = reception.getByRole('row').filter({hasText:oldest.full_name});
    await oldRow.waitFor();
    await reception.getByText('Página 1 de 1',{exact:true}).waitFor();
    assert.ok((await oldRow.innerText()).includes('15/01/1990'));
    assert.equal(await oldRow.getByRole('button',{name:'Excluir',exact:true}).count(),0);
    await search.fill('123.456.789-01'); await oldRow.waitFor();
    stage = 'normalized CPF, phone and accented names';
    for (const term of ['12345678901', 'nome social jose piloto', '(11) 3333-4444', '1133334444',
                       'joao goncalves', 'JO\u00c3O GON\u00c7ALVES', 'Joa\u0303o Gonc\u0327alves', 'jose piloto']) {
      const loaded = reception.waitForResponse(r => r.url().includes('/api/patients?') &&
        new URL(r.url()).searchParams.get('search') === term && r.request().method() === 'GET');
      await search.fill(term);
      const result = await loaded;
      assert.equal(result.status(), 200);
      const found = await result.json();
      assert.equal(found.total, 1);
      assert.equal(found.items[0].id, oldest.id);
      assert.equal(found.items[0].full_name, oldest.full_name);
      assert.equal(found.items[0].preferred_name, oldest.preferred_name);
      await oldRow.waitFor();
    }
    stage = 'create without CPF';
    await search.fill('');
    await reception.getByRole('button',{name:'Novo',exact:true}).click();
    stage = 'duplicate warning and preserved draft';
    const duplicate = await api(reception, receiver, 'POST', '/api/patients/duplicate-check', {cpf:'12345678901'});
    assert.equal(duplicate.total, 1);
    assert.deepEqual(Object.keys(duplicate.items[0]).sort(), ['active','birth_date','full_name','id','same_cpf']);
    await reception.locator('[name=full_name]').fill(oldest.full_name);
    await reception.locator('[name=birth_date]').fill(oldest.birth_date);
    await reception.locator('[name=notes]').fill('Rascunho ficticio preservado');
    const review = reception.getByRole('region', {name:'Conferência de duplicidade'});
    await review.getByText(/Encontramos 1/).waitFor();
    assert.equal(await reception.getByRole('button',{name:'Salvar',exact:true}).isEnabled(),true);
    await reception.locator('[name=full_name]').fill('Paciente Piloto Cadastro Ficticio');
    await reception.locator('[name=birth_date]').fill('1985-05-17');
    await review.getByText(/Nenhuma correspondência/).waitFor();
    assert.equal(await reception.locator('[name=notes]').inputValue(),'Rascunho ficticio preservado');
    let saved = reception.waitForResponse(r=>r.url().endsWith('/api/patients') && r.request().method()==='POST');
    await reception.getByRole('button',{name:'Salvar',exact:true}).click();
    const createdResponse = await saved; assert.equal(createdResponse.status(),201);
    let patient = await createdResponse.json(); assert.equal(patient.cpf,null);
    patient = await api(admin,author,'PUT','/api/patients/'+patient.id,{version:patient.version,
      phone:'+55 (11) 98765-4321', emergency_contact_phone:'(11) 3333-4444 ramal 20', cpf:'DOC-LEGADO-123456789012'});
    stage = 'edit conflict retains draft';
    await search.fill(patient.full_name);
    const row = reception.getByRole('row').filter({hasText:patient.full_name});
    await row.getByRole('button',{name:'Editar',exact:true}).click();
    assert.equal(await reception.locator('[name=phone]').inputValue(),patient.phone);
    assert.equal(await reception.locator('[name=cpf]').inputValue(),patient.cpf);
    assert.equal(await reception.locator('[name=emergency_contact_phone]').inputValue(),patient.emergency_contact_phone);
    await reception.locator('[name=notes]').fill('Rascunho ficticio da recepcao');
    await api(admin,author,'PUT','/api/patients/'+patient.id,{version:patient.version,preferred_name:'Mudanca concorrente'});
    saved = reception.waitForResponse(r=>r.url().endsWith('/api/patients/'+patient.id) && r.request().method()==='PUT');
    await reception.getByRole('button',{name:'Salvar',exact:true}).click();
    assert.equal((await saved).status(),409);
    assert.equal(await reception.locator('[name=notes]').inputValue(),'Rascunho ficticio da recepcao');
    await reception.getByRole('button',{name:'Descartar rascunho e carregar atual',exact:true}).click();
    await reception.getByRole('button',{name:'Descartar rascunho e carregar atual',exact:true}).waitFor({state:'hidden'});
    await reception.locator('[name=notes]').fill('Cadastro ficticio revisado');
    saved = reception.waitForResponse(r=>r.url().endsWith('/api/patients/'+patient.id) && r.request().method()==='PUT');
    await reception.getByRole('button',{name:'Salvar',exact:true}).click();
    assert.equal((await saved).status(),200);
    stage = 'reopen and similar names';
    await api(admin,author,'POST','/api/patients',{full_name:patient.full_name+' Junior'},201);
    await reception.reload(); await search.fill(patient.full_name);
    await reception.getByRole('row').filter({hasText:patient.full_name+' Junior'}).waitFor();
    const original = reception.getByRole('row').filter({hasText:patient.full_name}).filter({hasNotText:patient.full_name+' Junior'});
    await original.getByRole('button',{name:'Editar',exact:true}).click();
    assert.equal(await reception.locator('[name=birth_date]').inputValue(),'1985-05-17');
    assert.equal(await reception.locator('[name=notes]').inputValue(),'Cadastro ficticio revisado');
    assert.equal(await reception.locator('[name=cpf]').inputValue(),patient.cpf);
    assert.equal(await reception.locator('[name=phone]').inputValue(),patient.phone);
    assert.equal(await reception.locator('[name=emergency_contact_phone]').inputValue(),patient.emergency_contact_phone);
    stage = 'duplicate endpoint respects current permissions';
    matrix.permissions.patients.view = false;
    const currentMatrix = (await api(admin, author, 'GET', '/api/permissions')).items.find(p => p.role === 'reception');
    await api(admin, author, 'PUT', '/api/permissions/reception', {version:currentMatrix.version,permissions:matrix.permissions});
    await api(reception, receiver, 'POST', '/api/patients/duplicate-check', {cpf:'12345678901'},403);
    console.log('PASS: reception, duplicate warning and minimal response, denied duplicate access, preserved draft, searches, pagination, no-CPF create, conflict and reopen.');
  } finally { await browser.close(); }
})().catch(() => { console.error('Registration pilot failed at stage: '+stage); process.exit(1); });
