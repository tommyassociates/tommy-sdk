function taskStatus(status) {
  const self = this;
  const underscore = status.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
  return self.$t(`tasks.status.${underscore}`, status);
}
export default taskStatus;
