class DomainError(Exception):
    pass


class RateLimitError(DomainError):
    def __init__(self, retry_after: int):
        super().__init__("Muitas tentativas. Aguarde um minuto e tente novamente.")
        self.retry_after = retry_after


class PayloadTooLargeError(DomainError):
    pass


class StorageUnavailableError(DomainError):
    pass


class ValidationError(DomainError):
    pass


class ConflictError(DomainError):
    pass


class NotFoundError(DomainError):
    pass


class UnauthorizedError(DomainError):
    pass


class ForbiddenError(DomainError):
    pass
