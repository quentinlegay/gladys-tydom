// -----------------------------------------------------------------------------
// Protocol constants for the Tydom local/mediation API (Delta Dore).
//
// Reverse-engineered and maintained by the tydom2mqtt project
// (https://github.com/tydom2mqtt/tydom2mqtt); mirrored here so this
// integration talks to the exact same endpoints without a runtime dependency
// on a third-party service beyond Delta Dore's own servers.
// -----------------------------------------------------------------------------

// Delta Dore's public relay: reachable from anywhere, used when the Tydom box
// is not addressable on the local network (no `tydom_host` configured, or the
// user prefers the cloud channel).
export const MEDIATION_URL = 'mediation.tydom.com';

// Delta Dore account (ROPC) flow: exchanges a Delta Dore login/password for a
// short-lived access token, then reads the Tydom gateway's own local password
// from the site configuration. Only needed once (or when the gateway password
// rotates) — see src/tydom/credentials.js.
export const DELTADORE_AUTH_URL =
  'https://deltadoreadb2ciot.b2clogin.com/deltadoreadb2ciot.onmicrosoft.com/v2.0/.well-known/openid-configuration?p=B2C_1_AccountProviderROPC_SignIn';
export const DELTADORE_AUTH_GRANT_TYPE = 'password';
export const DELTADORE_AUTH_CLIENT_ID = '8782839f-3264-472a-ab87-4d4e23524da4';
export const DELTADORE_AUTH_SCOPE =
  'openid profile offline_access https://deltadoreadb2ciot.onmicrosoft.com/iotapi/video_config https://deltadoreadb2ciot.onmicrosoft.com/iotapi/video_allowed https://deltadoreadb2ciot.onmicrosoft.com/iotapi/sites_management_allowed https://deltadoreadb2ciot.onmicrosoft.com/iotapi/sites_management_gateway_credentials https://deltadoreadb2ciot.onmicrosoft.com/iotapi/sites_management_camera_credentials https://deltadoreadb2ciot.onmicrosoft.com/iotapi/comptage_europe_collect_reader https://deltadoreadb2ciot.onmicrosoft.com/iotapi/comptage_europe_site_config_contributor https://deltadoreadb2ciot.onmicrosoft.com/iotapi/pilotage_allowed https://deltadoreadb2ciot.onmicrosoft.com/iotapi/consent_mgt_contributor https://deltadoreadb2ciot.onmicrosoft.com/iotapi/b2caccountprovider_manage_account https://deltadoreadb2ciot.onmicrosoft.com/iotapi/b2caccountprovider_allow_view_account https://deltadoreadb2ciot.onmicrosoft.com/iotapi/tydom_backend_allowed https://deltadoreadb2ciot.onmicrosoft.com/iotapi/websocket_remote_access https://deltadoreadb2ciot.onmicrosoft.com/iotapi/orkestrator_device https://deltadoreadb2ciot.onmicrosoft.com/iotapi/orkestrator_view https://deltadoreadb2ciot.onmicrosoft.com/iotapi/orkestrator_space https://deltadoreadb2ciot.onmicrosoft.com/iotapi/orkestrator_connector https://deltadoreadb2ciot.onmicrosoft.com/iotapi/orkestrator_endpoint https://deltadoreadb2ciot.onmicrosoft.com/iotapi/rule_management_allowed https://deltadoreadb2ciot.onmicrosoft.com/iotapi/collect_read_datas';
export const DELTADORE_API_SITES =
  'https://prod.iotdeltadore.com/sitesmanagement/api/v1/sites?gateway_mac=';

// Tydom `last_usage` values (from GET /configs/file) mapped to the Gladys
// device kind this integration knows how to build. Endpoints whose
// `last_usage` is not listed here are discovered by the box but simply not
// published to Gladys (unsupported, e.g. alarm panels or heating zones).
// Garage doors and gates are deliberately NOT included here: Tydom reports
// their position through a different pair of fields ("level"/"levelCmd"
// instead of "position"/"positionCmd", see tydom2mqtt's sensors/Garage.py)
// with a direction convention this integration has not been validated
// against real hardware — shipping a guess for a motorized garage door is a
// worse failure mode than simply not discovering it yet.
export const COVER_USAGES = new Set(['shutter', 'klineShutter', 'awning']);

export const LIGHT_USAGES = new Set(['light', 'others']);

export const OPENING_SENSOR_USAGES = new Set([
  'window',
  'windowFrench',
  'windowSliding',
  'klineWindowFrench',
  'klineWindowSliding',
  'belmDoor',
  'klineDoor',
]);

// Both usages can carry an `outTemperature` reading (an outdoor probe wired
// to a shutter/dusk controller). `sensorSun`'s other field, `lightPower`, is
// deliberately not read: tydom2mqtt tags it as a power (W) reading rather
// than an illuminance, which is ambiguous enough (and different enough
// hardware) that it stays out of this integration until it can be verified
// against a real sensor.
export const TEMPERATURE_SENSOR_USAGES = new Set(['sensorThermo', 'sensorSun']);

// `/devices/data` elements this integration reads, per device kind. Mirrors
// tydom2mqtt's keyword allow-lists: Tydom sends many diagnostic fields
// (thermicDefect, battDefect, calibrationDefect...) alongside the ones a
// given kind actually needs; only `upToDate` elements in this list are kept.
export const COVER_KEYWORDS = new Set(['position']);
export const LIGHT_KEYWORDS = new Set(['level']);
export const OPENING_SENSOR_KEYWORDS = new Set(['openState']);
export const TEMPERATURE_SENSOR_KEYWORDS = new Set(['outTemperature']);
