"""One-shot container initialization. Never follows links or changes file bytes."""
import os
from pathlib import Path


def prepare(base, mounts_file='/proc/self/mountinfo'):
    base = Path(base)
    if not base.is_absolute() or base.is_symlink() or base.resolve() in (Path('/'), Path('/app'), Path('/tmp')):
        raise ValueError('Exam storage must be a dedicated absolute mount')
    mounts = {line.split()[4].replace('\\040', ' ') for line in Path(mounts_file).read_text().splitlines()}
    if str(base.resolve()) not in mounts:
        raise ValueError('Refusing permissions outside a dedicated volume mount')
    updated = skipped = 0
    def secure(path, mode):
        nonlocal updated, skipped
        if path.is_symlink():
            skipped += 1
            return
        os.chown(path, 10001, 10001, follow_symlinks=False)
        os.chmod(path, mode, follow_symlinks=False)
        updated += 1
    secure(base, 0o700)
    def fail(error): raise error
    for root, directories, files in os.walk(base, followlinks=False, onerror=fail):
        for name in directories: secure(Path(root) / name, 0o700)
        for name in files: secure(Path(root) / name, 0o600)
    return {'prepared_entries': updated, 'skipped_links': skipped}


if __name__ == '__main__':
    print(prepare(os.environ.get('EXAMS_BASE_PATH', '/data/exams')))
