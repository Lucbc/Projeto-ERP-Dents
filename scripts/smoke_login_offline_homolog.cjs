const fs=require('node:fs'), assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
let stage='start';
(async()=>{
  const credentials=JSON.parse(fs.readFileSync(0,'utf8'));
  const diagnosis=process.env.LOGIN_OFFLINE_DIAGNOSIS==='1';
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const context=await browser.newContext(), page=await context.newPage();
    await page.goto('https://localhost:18444/login');
    await page.getByRole('button',{name:'Entrar',exact:true}).waitFor();
    await page.locator('[name=email]').fill(credentials.email);
    await page.locator('[name=password]').fill(credentials.password);
    let logins=0;
    page.on('request',r=>{if(r.url().endsWith('/api/auth/login') && r.method()==='POST') logins++;});
    stage='offline submit';
    await context.setOffline(true);
    await page.waitForFunction(()=>navigator.onLine===false);
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    if(diagnosis) {
      await page.getByRole('button',{name:'Entrando...',exact:true}).waitFor();
      assert.equal(logins,0);
      stage='reconnection executes queued login';
      await context.setOffline(false);
      await page.getByRole('region',{name:'Pacientes cadastrados',exact:true}).waitFor();
      assert.equal(logins,1);
      console.log('DIAGNOSIS: offline submit pauses login and reconnect authenticates automatically without another click.');
      return;
    }
    await page.getByText(/Nada foi enfileirado/).waitFor();
    assert.equal(await page.getByRole('button',{name:'Entrar',exact:true}).isEnabled(),true);
    assert.equal(logins,0);
    stage='reconnection has no queued login';
    await context.setOffline(false);
    await page.waitForFunction(()=>navigator.onLine===true);
    await page.waitForTimeout(1000);
    assert.equal(logins,0);
    assert.equal(await page.getByRole('region',{name:'Pacientes cadastrados',exact:true}).count(),0);
    stage='challenge connection failure remains retryable';
    await page.route('**/api/auth/challenge',route=>route.abort('failed'));
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await page.getByText(/Não foi possível conectar ao servidor/).waitFor();
    assert.equal(logins,0);
    assert.equal(await page.getByRole('button',{name:'Entrar',exact:true}).isEnabled(),true);
    await page.unroute('**/api/auth/challenge');
    stage='explicit retry';
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await page.getByRole('region',{name:'Pacientes cadastrados',exact:true}).waitFor();
    assert.equal(logins,1);
    assert.equal(await page.evaluate(password=>[localStorage,sessionStorage].some(storage=>
      Object.values(storage).some(value=>String(value).includes(password))),credentials.password),false);
    console.log('PASS: offline login not queued; reconnect stays anonymous; connection failure retryable; only explicit retry authenticates; no credential storage.');
  } finally {await browser.close();}
})().catch(()=>{console.error('Registration pilot failed at stage: '+stage);process.exit(1);});
