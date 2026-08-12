export function shouldBlockBillingGateDuringRefresh(options = {}) {
  return options.showLoading === true;
}
