const fs = require('node:fs'), assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage = 'start';
(async()=>{
  const credentials = JSON.parse(fs.readFileSync(0,'utf8'));
  const browser = await chromium.launch({channel:'chrome',headless:true});
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const origin = 'https://localhost:18444';
    const login = async()=>{
      await page.goto(origin+'/login');
      await page.locator('[name=email]').fill(credentials.email);
      await page.locator('[name=password]').fill(credentials.password);
      const response = page.waitForResponse(r=>r.url().endsWith('/api/auth/login') && r.request().method()==='POST');
      await page.getByRole('button',{name:'Entrar',exact:true}).click();
      const result = await response; assert.equal(result.status(),200);
      const identity = await result.json();
      await page.getByRole('region',{name:'Pacientes cadastrados',exact:true}).waitFor();
      return identity;
    };
    stage = 'login and unsaved draft';
    const identity = await login();
    const cookies = (await context.cookies(origin)).map(c=>c.name+'='+c.value).join('; ');
    await page.getByRole('link',{name:'Pacientes',exact:true}).click();
    await page.getByRole('button',{name:'Novo',exact:true}).click();
    const draft = 'Fictitious Expiring Draft';
    await page.locator('[name=full_name]').fill(draft);
    await page.locator('[name=notes]').fill(draft);
    let writes=0;
    page.on('request',r=>{if(new URL(r.url()).pathname==='/api/patients' && r.method()==='POST') writes++;});
    stage = 'expiry warning';
    await page.getByText(/Sua sessão termina em até 5 minutos/).waitFor();
    const warning = page.getByRole('alert').filter({hasText:'Sua sessão termina'});
    assert.equal(await warning.evaluate(element=>{
      const rect=element.getBoundingClientRect();
      return element.contains(document.elementFromPoint(rect.left+10,rect.top+10));
    }),true);
    await page.screenshot({path:'.data/homolog/session-expiry-warning.png',fullPage:true});
    await page.getByRole('button',{name:'Ocultar aviso',exact:true}).click();
    assert.equal(await page.getByText(/Sua sessão termina em até 5 minutos/).count(),0);
    assert.equal(await page.locator('[name=notes]').inputValue(),draft);
    stage = 'pending navigation decision before expiry';
    await page.goBack();
    await page.getByRole('alertdialog',{name:'Sair do cadastro?'}).waitFor();
    stage = 'real expiry while typing';
    await page.getByRole('button',{name:'Entrar',exact:true}).waitFor({timeout:75000});
    assert.equal(await page.locator('[name=notes]').count(),0);
    assert.equal(await page.getByRole('alertdialog').count(),0);
    assert.equal(writes,0);
    assert.equal(await page.evaluate(value=>[localStorage,sessionStorage].some(storage=>
      Object.values(storage).some(item=>String(item).includes(value))),draft),false);
    stage = 'expired cookie cannot write';
    const rejected = await context.request.post(origin+'/api/patients',{
      headers:{'Cookie':cookies,'Origin':origin,'X-Session-ID':identity.session_id,'X-CSRF-Token':identity.csrf_token},
      data:{full_name:'Fictitious Expired Request'}});
    assert.equal(rejected.status(),401);
    stage = 'same user fresh login';
    await login();
    await page.goto(origin+'/patients');
    await page.getByRole('button',{name:'Novo',exact:true}).click();
    assert.equal(await page.locator('[name=full_name]').inputValue(),'');
    assert.equal(await page.locator('[name=notes]').inputValue(),'');
    console.log('PASS: real session expiry clears unsaved draft; no automatic patient write or draft storage; expired cookie rejected; fresh login does not restore draft.');
  } finally {await browser.close();}
})().catch(()=>{console.error('Registration pilot failed at stage: '+stage);process.exit(1);});
