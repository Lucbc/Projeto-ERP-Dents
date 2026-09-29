from src.core.domain.entities import User
from src.core.domain.exceptions import ConflictError, ValidationError


def check_user_version(current: User, version: int) -> None:
    if type(version) is not int or not 0 < version < 2**63 - 1:
        raise ValidationError('Informe uma versão válida do usuário.')
    if current.version != version:
        raise ConflictError('O usuário foi alterado. Carregue os dados atuais e revise antes de continuar.',
                            code='stale_version')
