export function isDerivVirtualAccount(account) {
  if (!account?.loginid) return null;
  if (account.is_virtual === true || account.is_virtual === 1 || account.is_virtual === "1") return true;
  if (account.is_virtual === false || account.is_virtual === 0 || account.is_virtual === "0") return false;
  return String(account.loginid).toUpperCase().startsWith("V");
}

export function derivAccountMode(account) {
  if (!account?.loginid) return "unknown";
  return isDerivVirtualAccount(account) ? "demo" : "real";
}

export function isDerivRealAccount(account) {
  return derivAccountMode(account) === "real";
}
