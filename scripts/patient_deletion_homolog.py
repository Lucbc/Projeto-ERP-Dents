"""Explicit confirmation for fictitious fixture cleanup in homologation scripts."""
def patient_deletion_path(get, path):
    current = get(path)
    preview = get(path + '/deletion-preview?version=' + str(current['version']))
    return path + '?version=' + str(preview['version']) + '&exams_fingerprint=' + preview['exams_fingerprint']
