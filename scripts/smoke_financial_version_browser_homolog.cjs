// The paid-entry scenario now requires a disposable schema with immutable history.
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const result=spawnSync(process.env.PYTHON||'python',[path.join(__dirname,'smoke_financial_history_browser_homolog.py')],{stdio:'inherit',env:process.env});
if(result.error) console.error('Configure PYTHON with the interpreter path, or run scripts/smoke_financial_history_browser_homolog.py directly.');
process.exitCode=result.status??1;