"""Compatibility exports; exceptions have one canonical identity."""
from .exceptions import (
    ConflictError, DomainError, ForbiddenError, NotFoundError,
    PayloadTooLargeError, RateLimitError, ServiceUnavailableError,
    StorageUnavailableError, UnauthorizedError, ValidationError,
)

__all__ = [
    "ConflictError", "DomainError", "ForbiddenError", "NotFoundError",
    "PayloadTooLargeError", "RateLimitError", "ServiceUnavailableError",
    "StorageUnavailableError", "UnauthorizedError", "ValidationError",
]
