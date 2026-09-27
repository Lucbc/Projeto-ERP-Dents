"""Explicit fresh-version writes for fixture setup, never for stale-write tests."""
def save_fixture(repository, role, matrix):
    current = repository.get_by_role(role)
    return repository.save(role, matrix, current.version if current else 0)


def update_fixture(use_case, role, matrix, **identity):
    version, _ = use_case.get_versioned(role)
    return use_case.update_for_role(role, matrix, version=version, **identity).permissions
