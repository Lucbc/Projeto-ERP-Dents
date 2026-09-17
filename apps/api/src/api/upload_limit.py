"""Bound multipart bodies before parsing, including requests without Content-Length."""
import tempfile
import re
import asyncio
import time

from starlette.concurrency import run_in_threadpool
from starlette.responses import JSONResponse


class ExamUploadLimitMiddleware:
    def __init__(self, app, max_bytes: int, max_concurrent: int = 2, body_timeout: float = 30):
        self.app, self.max_bytes = app, max_bytes
        self.active = 0
        self.max_concurrent, self.body_timeout = max_concurrent, body_timeout

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
        # No await between admission check and increment: atomic on this event loop.
        if self.active >= self.max_concurrent:
            return await JSONResponse({"detail": "Há envios em andamento. Tente novamente em alguns segundos."},
                503, headers={"Retry-After": "10"})(scope, receive, send)
        self.active += 1
        buffer = None
        endpoint_started = False
        try:
            buffer = tempfile.SpooledTemporaryFile(max_size=1024 * 1024)
            deadline = time.monotonic() + self.body_timeout
            total = 0
            while True:
                message = await asyncio.wait_for(receive(), timeout=max(0.001, deadline - time.monotonic()))
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
        except asyncio.TimeoutError:
            if endpoint_started: raise
            await JSONResponse({"detail": "Tempo de envio excedido. Tente novamente."}, 408)(scope, receive, send)
        except OSError:
            if endpoint_started: raise
            await JSONResponse({"detail": "Armazenamento temporário indisponível para receber o exame."}, 507)(scope, receive, send)
        finally:
            self.active -= 1
            if buffer is not None:
                await run_in_threadpool(buffer.close)
