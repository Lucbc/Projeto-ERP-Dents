from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

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
    @app.exception_handler(DomainError)
    async def domain_exception_handler(_: Request, exc: DomainError) -> JSONResponse:
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
            status_code = 409
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
