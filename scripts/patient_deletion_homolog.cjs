exports.patientDeletionPath = async (get, path) => {
  const current = await get(path);
  const preview = await get(path + '/deletion-preview?version=' + current.version);
  return path + '?version=' + preview.version + '&exams_fingerprint=' + preview.exams_fingerprint;
};
