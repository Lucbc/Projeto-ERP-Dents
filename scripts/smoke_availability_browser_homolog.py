"""Legacy clock correction through the private trusted TLS browser harness."""
import json
from smoke_bootstrap_homolog import main
from smoke_financial_history_browser_homolog import verify as verify_browser

def verify(request,email,password,token,container,ready,passed,sql,schema):
    status,dentist=request('POST','/api/dentists',{'full_name':'Fictitious legacy clock'},token=token)
    assert status==201
    legacy=[{'day_of_week':'monday','start_time':'08:00:30','end_time':'12:00'}]
    sql(f'''UPDATE "{schema}".dentists SET availability='{json.dumps(legacy)}'::json WHERE id='{dentist['id']}' ''')
    verify_browser(request,email,password,token,container,ready,passed,sql,schema,
        browser_script='smoke_availability_browser_homolog.cjs')

if __name__=='__main__':
    main(verify,'last-availability-browser.json',extra_env={'PUBLIC_ORIGIN':'https://localhost:18444'})
