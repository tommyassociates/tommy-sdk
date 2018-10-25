function taskStatus(status) {
  const underscore = status.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
  return window.tommy.i18n.t(`tasks.status.${underscore}`, status);
}
export default taskStatus;
