"""Bound multipart bodies before parsing, including requests without Content-Length."""
import tempfile
import re

from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse


class ExamUploadLimitMiddleware:
    def __init__(self, app, max_bytes: int):
        self.app, self.max_bytes = app, max_bytes

    async def __call__(self, scope, receive, send):
        if (scope["type"] != "http" or scope["method"] != "POST"
                or not re.fullmatch(r"/api/patients/[^/]+/exams/?", scope["path"])):
            return await self.app(scope, receive, send)
        limit = self.max_bytes + 64 * 1024  # Bounded multipart metadata overhead.
        async def reject():
            await JSONResponse({"detail": "Arquivo ou requisição excede o limite de envio."}, 413)(scope, receive, send)
        for name, value in scope.get("headers", []):
            if name.lower() == b"content-length":
                try:
                    if int(value) > limit: return await reject()
                except ValueError:
                    return await JSONResponse({"detail": "Tamanho da requisição inválido."}, 400)(scope, receive, send)
        buffer = tempfile.SpooledTemporaryFile(max_size=1024 * 1024)
        endpoint_started = False
        try:
            total = 0
            while True:
                message = await receive()
                if message["type"] == "http.disconnect": return
                chunk = message.get("body", b"")
                total += len(chunk)
                if total > limit: return await reject()
                await run_in_threadpool(buffer.write, chunk)
                if not message.get("more_body", False): break
            await run_in_threadpool(buffer.seek, 0)
            remaining = total
            async def replay():
                nonlocal remaining
                chunk = await run_in_threadpool(buffer.read, min(65536, remaining))
                remaining -= len(chunk)
                return {"type": "http.request", "body": chunk, "more_body": remaining > 0}
            endpoint_started = True
            await self.app(scope, replay, send)
        except OSError:
            if endpoint_started: raise
            await JSONResponse({"detail": "Armazenamento temporário indisponível para receber o exame."}, 507)(scope, receive, send)
        finally:
            await run_in_threadpool(buffer.close)
