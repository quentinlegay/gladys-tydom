// -----------------------------------------------------------------------------
// Integration configuration.
//
// The configuration is filled in by the user in Gladys, from the `config_schema`
// declared in `gladys-assistant-integration.json`. The SDK fetches it for you
// (`gladys.getConfig()`) and notifies you of every change through
// `gladys.onConfigUpdated()`.
//
// This module only provides defaults and normalizes the received object, so the
// rest of the code never has to deal with `undefined`.
// -----------------------------------------------------------------------------

// Defaults: they MUST stay consistent with the `default` values declared in the
// `config_schema` of the manifest.
export const DEFAULT_CONFIG = {
  tydom_mac: '',
  tydom_password: '',
  tydom_ip: 'mediation.tydom.com', // remote mode through the Delta Dore cloud
  deltadore_login: '',
  deltadore_password: '',
  tydom_polling_interval: 300, // seconds
  mqtt_host: '',
  mqtt_port: 1883,
  mqtt_user: '',
  mqtt_password: '',
  manage_container: true, // run tydom2mqtt as a Gladys sub-container
};

function trimmed(value, fallback) {
  return typeof value === 'string' ? value.trim() : fallback;
}

/**
 * Merge the user config with the defaults.
 * @param {Record<string, unknown>} raw config returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    // The MAC is what tydom2mqtt sends to the gateway: no separators, upper case.
    tydom_mac: trimmed(raw.tydom_mac, DEFAULT_CONFIG.tydom_mac).replace(/[:-]/g, '').toUpperCase(),
    tydom_password: trimmed(raw.tydom_password, DEFAULT_CONFIG.tydom_password),
    tydom_ip: trimmed(raw.tydom_ip, '') || DEFAULT_CONFIG.tydom_ip,
    deltadore_login: trimmed(raw.deltadore_login, DEFAULT_CONFIG.deltadore_login),
    deltadore_password: trimmed(raw.deltadore_password, DEFAULT_CONFIG.deltadore_password),
    mqtt_host: trimmed(raw.mqtt_host, DEFAULT_CONFIG.mqtt_host),
    mqtt_user: trimmed(raw.mqtt_user, DEFAULT_CONFIG.mqtt_user),
    mqtt_password: trimmed(raw.mqtt_password, DEFAULT_CONFIG.mqtt_password),
    // Force the types: config may arrive as strings from a form.
    tydom_polling_interval: Number(
      raw.tydom_polling_interval ?? DEFAULT_CONFIG.tydom_polling_interval,
    ),
    mqtt_port: Number(raw.mqtt_port ?? DEFAULT_CONFIG.mqtt_port),
    // Anything but an explicit false means true.
    manage_container: raw.manage_container !== false && raw.manage_container !== 'false',
  };
}

/**
 * List what is missing for the integration to work, as a multi-language
 * message, or `null` when the configuration is complete.
 * @param {ReturnType<typeof normalizeConfig>} config
 */
export function missingConfig(config) {
  if (!config.mqtt_host) {
    return {
      en: 'Fill in the MQTT broker host.',
      fr: "Renseignez l'hôte du broker MQTT.",
    };
  }
  if (!config.manage_container) {
    return null;
  }
  if (!config.tydom_mac) {
    return {
      en: 'Fill in the MAC address of the Tydom gateway.',
      fr: "Renseignez l'adresse MAC de la box Tydom.",
    };
  }
  if (!config.tydom_password && !(config.deltadore_login && config.deltadore_password)) {
    return {
      en: 'Fill in the Tydom password, or your Delta Dore account.',
      fr: 'Renseignez le mot de passe Tydom, ou votre compte Delta Dore.',
    };
  }
  return null;
}
