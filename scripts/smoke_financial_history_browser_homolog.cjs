// Credentials arrive through stdin and never appear in output or screenshots.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
let stage='start';
// Playwright route failures may contain request headers; never print raw errors.
process.on('unhandledRejection',()=>{console.error('Financial history browser failed at stage: '+stage);process.exit(1);});
(async()=>{
 const credentials=JSON.parse(fs.readFileSync(0,'utf8'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({ignoreHTTPSErrors:false,viewport:{width:1440,height:1100}});
 try {
  const page=await context.newPage();
  stage='login';await page.goto('https://localhost:18444/login');
  await page.locator('input[name=email]').fill(credentials.email);
  await page.locator('input[name=password]').fill(credentials.password);
  const loginResponse=page.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  const login=await(await loginResponse).json();
  await page.getByText('Pacientes cadastrados',{exact:true}).waitFor();
  const headers={'Content-Type':'application/json','X-Session-ID':login.session_id,'X-CSRF-Token':login.csrf_token};
  const api=(method,url,data)=>page.evaluate(async({method,url,data,headers})=>{
   const response=await fetch(url,{method,headers,body:data?JSON.stringify(data):undefined});
   return {status:response.status,body:response.status===204?null:await response.json()};
  },{method,url,data,headers});
  const created=await api('POST','/api/financial',{entry_type:'income',description:'Fictitious History Browser',amount_cents:12000,due_date:new Date().toISOString().slice(0,10)});
  assert.equal(created.status,201); const entry=created.body,endpoint='/api/financial/'+entry.id;
  const second=await context.newPage();
  for(const tab of [page,second]) await tab.goto('https://localhost:18444/financial');
  const row=tab=>tab.getByRole('row').filter({hasText:entry.description});
  await row(second).getByRole('button',{name:'Editar',exact:true}).click();
  await second.locator('[name=amount]').fill('321.09');
  stage='lost payment response';let paymentBody;let interceptPayment=true;
  await page.route('**'+endpoint+'/mark-paid',async route=>{
   paymentBody=route.request().postDataJSON();
   if(interceptPayment){interceptPayment=false;const response=await route.fetch();assert.equal(response.status(),200);await route.abort('failed');}
   else await route.continue();
  });
  await row(page).getByRole('button',{name:'Baixar',exact:true}).click();
  await page.getByRole('button',{name:'Confirmar baixa integral'}).click();
  await page.getByRole('button',{name:'Consultar/repetir esta operação'}).click();
  await page.getByText('Operação anterior recuperada. Confira o estado atual e o histórico.',{exact:true}).waitFor();
  let history=(await api('GET',endpoint+'/payments')).body;assert.equal(history.length,1);
  stage='old draft cannot rewrite payment';
  const rejected=second.waitForResponse(r=>r.url().endsWith(endpoint)&&r.request().method()==='PUT');
  await second.getByRole('button',{name:'Salvar',exact:true}).click();assert.equal((await rejected).status(),409);
  assert.equal(await second.locator('[name=amount]').inputValue(),'321.09');
  await second.getByRole('button',{name:'Descartar rascunho e carregar atual'}).click();
  await second.getByRole('button',{name:'Fechar formulário'}).waitFor();
  assert.equal(await second.locator('[name=amount]').isDisabled(),true);
  stage='lost reversal response';
  await page.getByRole('button',{name:'Fechar',exact:true}).click();
  await row(page).getByRole('button',{name:'Ver pagamentos'}).click();
  let reversalBody,interceptReverse=true;
  await page.route('**'+endpoint+'/reverse-payment',async route=>{
   reversalBody=route.request().postDataJSON();
   if(interceptReverse){interceptReverse=false;const response=await route.fetch();assert.equal(response.status(),200);await route.abort('failed');}
   else await route.continue();
  });
  await page.getByLabel('Motivo do estorno').fill('Fictitious correction after review');
  await page.getByRole('button',{name:'Estornar registro',exact:true}).click();
  await page.getByRole('button',{name:'Consultar/repetir esta operação'}).click();
  await page.getByText('Operação anterior recuperada. Confira o estado atual e o histórico.',{exact:true}).waitFor();
  history=(await api('GET',endpoint+'/payments')).body;assert.equal(history.length,1);assert.ok(history[0].reversal);
  await page.screenshot({path:path.resolve(__dirname,'../.data/homolog/financial-history-reversal.png'),fullPage:true});
  stage='review and new payment';
  await page.getByRole('button',{name:'Fechar',exact:true}).click();
  await row(page).getByRole('button',{name:'Editar',exact:true}).click();await page.locator('[name=amount]').fill('234.56');
  await page.getByRole('button',{name:'Salvar',exact:true}).click();
  await row(page).getByRole('button',{name:'Baixar',exact:true}).click();
  await page.unroute('**'+endpoint+'/mark-paid');
  await page.getByRole('button',{name:'Confirmar baixa integral'}).click();
  await page.getByText('Operação registrada. Confira o histórico atualizado.',{exact:true}).waitFor();
  const delayed=(await api('POST',endpoint+'/mark-paid',paymentBody)).body;
  assert.equal(delayed.replayed,true);assert.ok(delayed.reversal);assert.equal(delayed.entry.total_cents,23456);
  const delayedReverse=(await api('POST',endpoint+'/reverse-payment',reversalBody)).body;
  assert.equal(delayedReverse.entry.status,'paid');assert.equal(delayedReverse.entry.version,5);
  history=(await api('GET',endpoint+'/payments')).body;assert.equal(history.length,2);
  await page.screenshot({path:path.resolve(__dirname,'../.data/homolog/financial-history-repayment.png'),fullPage:true});
  console.log('Chrome HTTPS: lost payment/reversal responses recover one event; old draft blocked; reversal/correction/new payment preserve history and delayed retries.');
 } finally {await browser.close();}
})().catch(()=>{console.error('Financial history browser failed at stage: '+stage);process.exitCode=1;});
