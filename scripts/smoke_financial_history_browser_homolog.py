"""Serve the current web image over trusted TLS against a disposable API/schema."""
import json
import os
from pathlib import Path
import subprocess
from smoke_bootstrap_homolog import main, docker


def verify(request,email,password,token,container,ready,passed,sql,schema, *, browser_script='smoke_financial_history_browser_homolog.cjs'):
    root=Path(__file__).resolve().parents[1]
    config=root/'.data/homolog/history-browser.conf'
    web=container+'-web'
    config.write_text('''server {
      listen 443 ssl; server_name localhost;
      ssl_certificate /etc/erp-tls/server.crt;
      ssl_certificate_key /etc/erp-tls/server.key;
      root /usr/share/nginx/html; index index.html;
      location /api/ { proxy_pass http://'''+container+''':8000; proxy_set_header Host $host; }
      location / { try_files $uri $uri/ /index.html; }
    }''',encoding='utf-8')
    try:
        docker('run','-d','--name',web,'--label','com.docker.compose.project=erp-dents-homolog',
               '--network','erp-dents-homolog_default','-p','127.0.0.1:18444:443',
               '-v',str(config)+':/etc/nginx/conf.d/default.conf:ro',
               '-v',str(root/'.data/tls/homolog')+':/etc/erp-tls:ro','erp-dents-homolog-web')
        result=subprocess.run(['node',str(root/'scripts'/browser_script)],
                              input=json.dumps({'email':email,'password':password}),text=True,capture_output=True,
                              env={**os.environ,'NODE_EXTRA_CA_CERTS':str(root/'.data/tls/homolog/ca.crt')})
        if result.returncode:
            # Script emits only stage labels, never credentials or request bodies.
            stages=[line for line in result.stderr.splitlines() if line.startswith(('Financial history browser failed at stage: ', 'Catalog deletion browser failed at stage: ', 'Appointment deletion browser failed at stage: '))]
            raise AssertionError(stages[-1] if stages else 'Financial history browser failed; raw diagnostics suppressed')
        passed(result.stdout.strip())
    finally:
        docker('rm','-f',web,check=False)
        config.unlink(missing_ok=True)


if __name__=='__main__':
    main(verify,'last-financial-history-browser.json',extra_env={'PUBLIC_ORIGIN':'https://localhost:18444'})
