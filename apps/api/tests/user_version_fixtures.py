"""Fresh versions for unrelated fixtures; never use in stale-form tests."""
def version_of(owner, user_id):
    repository = getattr(owner, 'user_repository', owner)
    current = repository.get(user_id)
    return current.version if current else 1


def update_fixture(owner, user_id, data, **identity):
    version = version_of(owner, user_id)
    if identity:
        return owner.update(user_id, {**data, 'version': version}, **identity)
    return owner.update(user_id, data, version)


def delete_fixture(owner, user_id, **identity):
    version = version_of(owner, user_id)
    return owner.delete(user_id, version=version, **identity)


def password_fixture(owner, user_id, password, **identity):
    return owner.set_password(user_id, password, version=version_of(owner, user_id), **identity)


def own_password_fixture(owner, user_id, current, new, **identity):
    return owner.change_password(user_id, current, new, version=version_of(owner, user_id), **identity)
