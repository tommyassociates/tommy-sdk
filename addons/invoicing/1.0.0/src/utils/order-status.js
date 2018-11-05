function orderStatus(status) {
  const underscore = status.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
  return window.tommy.i18n.t(`invoicing.order_status.${underscore}`, status);
}
export default orderStatus;
