// Fictitious data in the private TLS harness; never log credentials or raw errors.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
let stage='start';
process.on('unhandledRejection',()=>{console.error('Exam deletion browser failed at stage: '+stage);process.exit(1);});
(async()=>{
 const credentials=JSON.parse(fs.readFileSync(0,'utf8'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const context=await browser.newContext({ignoreHTTPSErrors:false,viewport:{width:1440,height:1000}});
  const first=await context.newPage(),second=await context.newPage();
  stage='login';await first.goto('https://localhost:18444/login');
  await first.locator('[name=email]').fill(credentials.email);await first.locator('[name=password]').fill(credentials.password);
  const login=first.waitForResponse(r=>r.url().endsWith('/api/auth/login')&&r.request().method()==='POST');
  await first.getByRole('button',{name:'Entrar',exact:true}).click();const logged=await(await login).json();
  await first.getByText('Pacientes cadastrados',{exact:true}).waitFor();
  const headers={'Content-Type':'application/json','X-Session-ID':logged.session_id,'X-CSRF-Token':logged.csrf_token};
  const patient=await first.evaluate(async headers=>{
   const result=await fetch('/api/patients',{method:'POST',headers,body:JSON.stringify({full_name:'Fictitious exam deletion'})});
   if(result.status!==201)throw Error('fixture');return result.json();
  },headers);
  const pageUrl='https://localhost:18444/patients/'+patient.id;
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7ioAAAAASUVORK5CYII=','base64');
  stage='uploads';await first.goto(pageUrl);
  for(const name of ['first-fictitious.png','second-fictitious.png']) {
   await first.locator('input[type=file]').setInputFiles({name,mimeType:'image/png',buffer:png});
   const uploaded=first.waitForResponse(r=>r.url().endsWith('/exams')&&r.request().method()==='POST');
   await first.getByRole('button',{name:'Enviar',exact:true}).click();assert.equal((await uploaded).status(),201);
   await first.getByRole('cell',{name,exact:true}).waitFor();
  }
  await second.goto(pageUrl);
  const row=(page,name)=>page.getByRole('row').filter({has:page.getByRole('cell',{name,exact:true})});
  stage='complete download';const download=first.waitForEvent('download');
  await row(first,'first-fictitious.png').getByRole('button',{name:'Baixar',exact:true}).click();
  const saved=await download;assert.equal(await saved.failure(),null);
  assert.deepEqual(fs.readFileSync(await saved.path()),png);
  stage='image preview';await row(first,'first-fictitious.png').getByRole('button',{name:'Visualizar imagem'}).click();
  await first.getByRole('img',{name:'first-fictitious.png'}).waitFor();
  await first.getByRole('button',{name:'x',exact:true}).click();
  stage='draft and stale confirmation';
  await first.locator('input[type=file]').setInputFiles({name:'draft.png',mimeType:'image/png',buffer:png});
  await first.locator('input[name=notes]').fill('Fictitious upload draft');
  await row(first,'first-fictitious.png').getByRole('button',{name:'Excluir',exact:true}).click();
  await first.getByText('Fictitious exam deletion',{exact:true}).last().waitFor();
  await row(second,'first-fictitious.png').getByRole('button',{name:'Excluir',exact:true}).click();
  async function confirm(page,status) {
   const response=page.waitForResponse(r=>r.url().includes('/api/exams/')&&r.request().method()==='DELETE');
   await page.getByRole('button',{name:'Confirmar exclusão',exact:true}).click();assert.equal((await response).status(),status);
  }
  await confirm(second,204);await confirm(first,404);
  await first.getByRole('button',{name:'Recarregar lista para conferir'}).waitFor();
  assert.equal(await first.locator('input[name=notes]').inputValue(),'Fictitious upload draft');
  assert.equal(await first.locator('input[type=file]').evaluate(el=>el.files[0].name),'draft.png');
  await first.screenshot({path:path.join(__dirname,'../.data/homolog/exam-deletion-review.png'),fullPage:true});
  stage='missing download feedback';await row(first,'first-fictitious.png').getByRole('button',{name:'Baixar',exact:true}).click();
  await first.getByText('Não foi possível baixar o exame. Tente novamente.',{exact:true}).waitFor();
  stage='reload and new confirmation';await first.getByRole('button',{name:'Recarregar lista para conferir'}).click();
  await row(first,'first-fictitious.png').waitFor({state:'hidden'});
  await first.getByRole('button',{name:'Recarregando...',exact:true}).waitFor({state:'hidden'});
  stage='delete reviewed remaining exam';
  await row(first,'second-fictitious.png').getByRole('button',{name:'Excluir',exact:true}).click();await confirm(first,204);
  await first.getByText('Nenhum exame enviado ainda.',{exact:true}).waitFor();
  assert.equal(await first.locator('input[name=notes]').inputValue(),'Fictitious upload draft');
  assert.equal(await first.locator('input[type=file]').evaluate(el=>el.files[0].name),'draft.png');
  await first.screenshot({path:path.join(__dirname,'../.data/homolog/exam-deletion-complete.png'),fullPage:true});
  console.log('OK: Chrome exact download bytes, image preview, two-tab deletion/404, explicit reload/new confirmation and preserved upload draft; missing download shows failure.');
 } finally {await browser.close();}
})().catch(()=>{console.error('Exam deletion browser failed at stage: '+stage);process.exitCode=1;});
