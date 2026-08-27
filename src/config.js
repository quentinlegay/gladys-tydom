// -----------------------------------------------------------------------------
// Integration configuration.
//
// Filled in by the user from the `config_schema` declared in
// gladys-assistant-integration.json. This module only provides defaults and
// normalizes the received object, so the rest of the code never has to deal
// with `undefined` or with values that arrived as strings from a form.
// -----------------------------------------------------------------------------

// Defaults: they MUST stay consistent with the `default` values declared in
// the `config_schema` of the manifest.
export const DEFAULT_CONFIG = {
  tydom_mac: '',
  tydom_password: '',
  deltadore_login: '',
  deltadore_password: '',
  tydom_host: '',
  poll_frequency: 300, // seconds between forced /refresh/all
  // Reserved key (NOT in config_schema): because the manifest declares both
  // 'local' and 'cloud' in its `transports` field, Gladys shows a standard
  // "Prefer the local connection" toggle and sends the user's choice here.
  // Read-only for the integration; defaults to true.
  GLADYS_PREFER_LOCAL: true,
};

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw - config returned by the SDK.
 */
export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    tydom_mac: normalizeMac(raw.tydom_mac ?? DEFAULT_CONFIG.tydom_mac),
    tydom_password: String(raw.tydom_password ?? DEFAULT_CONFIG.tydom_password ?? ''),
    deltadore_login: String(raw.deltadore_login ?? DEFAULT_CONFIG.deltadore_login ?? '').trim(),
    deltadore_password: String(raw.deltadore_password ?? DEFAULT_CONFIG.deltadore_password ?? ''),
    tydom_host: String(raw.tydom_host ?? DEFAULT_CONFIG.tydom_host ?? '').trim(),
    poll_frequency: Number(raw.poll_frequency ?? DEFAULT_CONFIG.poll_frequency),
    // The preference is a boolean; anything but an explicit false means true.
    GLADYS_PREFER_LOCAL: raw.GLADYS_PREFER_LOCAL !== false,
  };
}

/**
 * Normalize a Tydom mac as printed on the gateway sticker / found in the
 * Tydom app advanced settings: strip separators, uppercase (the box accepts
 * it case-insensitively but the mediation relay's own tooling always shows
 * it uppercase, which keeps logs and support requests consistent).
 * @param {string} value
 */
function normalizeMac(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-F]/g, '');
}
