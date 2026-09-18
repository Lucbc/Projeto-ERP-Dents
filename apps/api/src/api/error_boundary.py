"""HTTP failures without SQL, credentials or patient data in responses/logs."""
import errno
import logging
from uuid import uuid4
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError, OperationalError, TimeoutError as PoolTimeout


def failure_response(exc, request_id):
    state = getattr(getattr(exc, "orig", None), "sqlstate", None)
    status, message = 500, "Não foi possível concluir a operação. Confira os dados antes de tentar novamente."
    if isinstance(exc, IntegrityError) and state == "23505":
        status, message = 409, "Já existe um registro com esses dados. Revise o cadastro."
    elif isinstance(exc, IntegrityError) and state == "23503":
        status, message = 409, "O registro possui vínculos ou uma referência não está mais disponível. Atualize os dados e confira os vínculos."
    elif isinstance(exc, IntegrityError) and state in ("23502", "23514"):
        status, message = 422, "Os dados não atendem às regras do cadastro. Revise os campos informados."
    elif state in ("40001", "40P01"):
        status, message = 409, "Outra operação alterou estes dados ao mesmo tempo. Atualize a tela antes de tentar novamente."
    elif isinstance(exc, (OperationalError, PoolTimeout)) and (not state or state.startswith("08") or state in ("57P01", "57P02", "57P03", "53300")):
        status, message = 503, "O banco de dados está temporariamente indisponível. Confira o resultado da operação antes de tentar novamente."
    elif isinstance(exc, OSError) and exc.errno in (errno.ENOSPC, errno.EDQUOT):
        status, message = 507, "O servidor está sem espaço para concluir a operação. Avise o responsável pelo sistema."
    headers = {"Retry-After": "10"} if status == 503 else {}
    return JSONResponse({"detail": message, "request_id": request_id}, status_code=status, headers=headers)


class SafeErrorMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        request_id = uuid4().hex
        started = False

        async def safe_send(message):
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
                headers = [(k, v) for k, v in message.get("headers", []) if k.lower() not in (b"x-request-id", b"cache-control")]
                message = {**message, "headers": headers + [(b"x-request-id", request_id.encode()), (b"cache-control", b"no-store")]}
            await send(message)

        try:
            await self.app(scope, receive, safe_send)
        except Exception as exc:
            # No exception text/traceback, bodies, headers or raw URLs in logs.
            route = getattr(scope.get("route"), "path", "unmatched")
            logging.getLogger(__name__).error("Request failed id=%s type=%s route=%s", request_id, type(exc).__name__, route)
            if started:
                raise RuntimeError("Response interrupted; reference " + request_id) from None
            await failure_response(exc, request_id)(scope, receive, safe_send)
