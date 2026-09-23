"""Shared transaction for versioned deletion of simple catalogs."""
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from src.core.domain.exceptions import ConflictError, ValidationError


def delete_catalog_record(session, model, id, version):
    if type(version) is not int or version < 1:
        raise ValidationError('Recarregue o cadastro para obter a versão atual antes de excluir.')
    try:
        item = session.scalar(select(model).where(model.id == id).with_for_update()
                              .execution_options(populate_existing=True))
        if item is None:
            session.rollback()
            return False
        if item.version != version:
            raise ConflictError('Este cadastro foi alterado. Recarregue a lista e confira os dados antes de confirmar outra exclusão.',
                                code='stale_version')
        session.delete(item)
        session.commit()
        return True
    except IntegrityError as error:
        session.rollback()
        if getattr(error.orig, 'sqlstate', None) == '23503':
            raise ConflictError('Este cadastro possui vínculos e não pode ser excluído. Confira os registros vinculados ou inative o cadastro.',
                                code='linked_record') from error
        raise
    except Exception:
        session.rollback()
        raise
