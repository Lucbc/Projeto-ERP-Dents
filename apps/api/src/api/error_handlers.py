from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

from src.core.domain.exceptions import (
    ConflictError,
    DomainError,
    ForbiddenError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
    RateLimitError,
    PayloadTooLargeError,
    StorageUnavailableError,
    ServiceUnavailableError,
)


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(RequestValidationError)
    async def request_validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        # Input/context can contain passwords or clinical text. Never echo them.
        messages = {"missing": "Campo obrigatório.", "json_invalid": "O conteúdo enviado não é válido.",
                    "string_too_short": "O texto informado é muito curto.", "string_too_long": "O texto informado é muito longo."}
        errors = [{"loc": error["loc"], "type": error["type"],
                   "msg": messages.get(error["type"], "Valor inválido. Revise este campo.")}
                  for error in exc.errors()]
        return JSONResponse(status_code=422, content={"detail": errors})

    @app.exception_handler(DomainError)
    async def domain_exception_handler(request: Request, exc: DomainError) -> JSONResponse:
        status_code = 400

        if isinstance(exc, ValidationError):
            status_code = 400
        elif isinstance(exc, UnauthorizedError):
            status_code = 401
        elif isinstance(exc, ForbiddenError):
            status_code = 403
        elif isinstance(exc, NotFoundError):
            status_code = 404
        elif isinstance(exc, ConflictError):
            content = {"detail": str(exc)}
            if exc.code:
                content["code"] = exc.code
                request_id = getattr(request.state, "request_id", None)
                if request_id:
                    content["request_id"] = request_id
            return JSONResponse(status_code=409, content=content)
        elif isinstance(exc, PayloadTooLargeError):
            status_code = 413
        elif isinstance(exc, StorageUnavailableError):
            status_code = 507
        elif isinstance(exc, ServiceUnavailableError):
            return JSONResponse(status_code=503, content={"detail": str(exc)}, headers={"Retry-After": "10"})

        if isinstance(exc, RateLimitError):
            return JSONResponse(status_code=429, content={"detail": str(exc)},
                                headers={"Retry-After": str(exc.retry_after)})
        return JSONResponse(status_code=status_code, content={"detail": str(exc)})
