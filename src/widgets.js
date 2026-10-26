// -----------------------------------------------------------------------------
// Dashboard widgets of the Tydom integration (manifest `widgets`).
//
//   - tydom_device : one Tydom device — live tiles, its controls, a history
//                    chart (everything bound to the Gladys device features);
//   - shutter      : ONE shutter — its position, open / stop / close it, and
//                    move it to an exact position;
//   - shutters     : every shutter at a glance, drive them one by one (a
//                    form: which shutter, which order) or all at once;
//   - batteries    : the battery level of every Tydom sensor, worst first.
//
// The widgets only show the devices created in Gladys (`getDevices()`), under
// the name the user gave them. The `build*` functions are PURE: they turn
// those devices and the last values received from tydom2mqtt into a widget
// content; `registerWidgets` wires them to the SDK.
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as CATEGORIES,
  DEVICE_FEATURE_TYPES as TYPES,
  WIDGET_BUTTON_STYLES as BUTTON_STYLES,
  WIDGET_CHART_INTERVALS as CHART_INTERVALS,
  WIDGET_CHART_TYPES as CHART_TYPES,
  WIDGET_COLORS as COLORS,
  WIDGET_TEXT_VARIANTS as TEXT_VARIANTS,
  createLogger,
} from '@gladysassistant/integration-sdk';
import { COVER_STATE } from './tydom/mapping.js';

const logger = createLogger({ name: 'widgets' });

export const WIDGET_KEYS = {
  DEVICE: 'tydom_device',
  SHUTTER: 'shutter',
  SHUTTERS: 'shutters',
  BATTERIES: 'batteries',
};

// The core rate-limits the refresh nudges to 1 per 10 s per widget and drops
// the extra ones: keep a margin so the last change of a burst is not lost.
const REFRESH_INTERVAL_MS = 11_000;

// Battery thresholds (%): at or below LOW the battery must be replaced soon.
export const BATTERY_LOW = 15;
export const BATTERY_WARNING = 30;

const SETPOINT_STEP = 0.5;
const SETPOINT_ACTIONS = { setpoint_down: -SETPOINT_STEP, setpoint_up: SETPOINT_STEP };
const MAX_STATUS_ITEMS = 10;

// --- Texts --------------------------------------------------------------------

const T = {
  open: { en: 'Open', fr: 'Ouvrir', de: 'Öffnen', es: 'Abrir' },
  stop: { en: 'Stop', fr: 'Stop', de: 'Stopp', es: 'Parar' },
  close: { en: 'Close', fr: 'Fermer', de: 'Schließen', es: 'Cerrar' },
  openAll: { en: 'Open all', fr: 'Tout ouvrir', de: 'Alle öffnen', es: 'Abrir todo' },
  closeAll: { en: 'Close all', fr: 'Tout fermer', de: 'Alle schließen', es: 'Cerrar todo' },
  stopAll: { en: 'Stop all', fr: 'Tout arrêter', de: 'Alle stoppen', es: 'Parar todo' },
  on: { en: 'On', fr: 'Allumer', de: 'Ein', es: 'Encender' },
  off: { en: 'Off', fr: 'Éteindre', de: 'Aus', es: 'Apagar' },
  opened: { en: 'Open', fr: 'Ouverts', de: 'Offen', es: 'Abiertas' },
  closed: { en: 'Closed', fr: 'Fermés', de: 'Geschlossen', es: 'Cerradas' },
  closedOne: { en: 'Closed', fr: 'Fermé', de: 'Geschlossen', es: 'Cerrada' },
  openOne: { en: 'Open', fr: 'Ouvert', de: 'Offen', es: 'Abierta' },
  unknown: { en: 'Unknown', fr: 'Inconnu', de: 'Unbekannt', es: 'Desconocido' },
  low: { en: 'Low', fr: 'Faible', de: 'Schwach', es: 'Baja' },
  ok: { en: 'OK', fr: 'OK', de: 'OK', es: 'OK' },
  toReplace: { en: 'To replace', fr: 'À changer', de: 'Zu ersetzen', es: 'A cambiar' },
  tracked: { en: 'Tracked', fr: 'Suivies', de: 'Überwacht', es: 'Vigiladas' },
  position: { en: 'Position', fr: 'Position', de: 'Position', es: 'Posición' },
  positionPercent: {
    en: 'Position (%)',
    fr: 'Position (%)',
    de: 'Position (%)',
    es: 'Posición (%)',
  },
  setPosition: { en: 'Position…', fr: 'Position…', de: 'Position…', es: 'Posición…' },
  controlOne: {
    en: 'Control a shutter…',
    fr: 'Piloter un volet…',
    de: 'Rollladen steuern…',
    es: 'Mover una persiana…',
  },
  shutter: { en: 'Shutter', fr: 'Volet', de: 'Rollladen', es: 'Persiana' },
  order: { en: 'Order', fr: 'Ordre', de: 'Befehl', es: 'Orden' },
  positionHint: {
    en: 'Only used with the Position order.',
    fr: "Utilisée seulement avec l'ordre Position.",
    de: 'Nur für den Befehl Position.',
    es: 'Solo se usa con la orden Posición.',
  },
  positionMissing: {
    en: 'Type the position (0-100 %) to send the shutter to.',
    fr: 'Saisissez la position (0-100 %) où amener le volet.',
    de: 'Geben Sie die Position (0-100 %) ein, auf die der Rollladen fahren soll.',
    es: 'Escribe la posición (0-100 %) a la que llevar la persiana.',
  },
  orderUnsupported: {
    en: 'This shutter does not accept this order.',
    fr: "Ce volet n'accepte pas cet ordre.",
    de: 'Dieser Rollladen nimmt diesen Befehl nicht an.',
    es: 'Esta persiana no acepta esta orden.',
  },
  brightness: { en: 'Brightness', fr: 'Luminosité', de: 'Helligkeit', es: 'Brillo' },
  setpoint: { en: 'Setpoint', fr: 'Consigne', de: 'Sollwert', es: 'Consigna' },
  temperature: { en: 'Temperature', fr: 'Température', de: 'Temperatur', es: 'Temperatura' },
  humidity: { en: 'Humidity', fr: 'Humidité', de: 'Feuchtigkeit', es: 'Humedad' },
  power: { en: 'Power', fr: 'Puissance', de: 'Leistung', es: 'Potencia' },
  energy: { en: 'Energy', fr: 'Énergie', de: 'Energie', es: 'Energía' },
  current: { en: 'Current', fr: 'Courant', de: 'Strom', es: 'Corriente' },
  voltage: { en: 'Voltage', fr: 'Tension', de: 'Spannung', es: 'Tensión' },
  battery: { en: 'Battery', fr: 'Batterie', de: 'Batterie', es: 'Batería' },
  motion: { en: 'Motion', fr: 'Mouvement', de: 'Bewegung', es: 'Movimiento' },
  deviceMissing: {
    en: 'This Tydom device no longer exists in Gladys: pick another one in the widget settings.',
    fr: "Cet appareil Tydom n'existe plus dans Gladys : choisissez-en un autre dans les réglages du widget.",
    de: 'Dieses Tydom-Gerät existiert in Gladys nicht mehr: Wählen Sie in den Widget-Einstellungen ein anderes.',
    es: 'Este dispositivo Tydom ya no existe en Gladys: elige otro en los ajustes del widget.',
  },
  noShutter: {
    en: 'No Tydom shutter added in Gladys yet.',
    fr: "Aucun volet Tydom n'est encore ajouté dans Gladys.",
    de: 'Noch kein Tydom-Rollladen in Gladys hinzugefügt.',
    es: 'Todavía no hay ninguna persiana Tydom añadida en Gladys.',
  },
  notAShutter: {
    en: 'This device is not a Tydom shutter: pick a shutter in the widget settings.',
    fr: "Cet appareil n'est pas un volet Tydom : choisissez un volet dans les réglages du widget.",
    de: 'Dieses Gerät ist kein Tydom-Rollladen: Wählen Sie in den Widget-Einstellungen einen Rollladen.',
    es: 'Este dispositivo no es una persiana Tydom: elige una persiana en los ajustes del widget.',
  },
  noBattery: {
    en: 'No battery-powered Tydom device in Gladys.',
    fr: 'Aucun appareil Tydom sur pile dans Gladys.',
    de: 'Kein batteriebetriebenes Tydom-Gerät in Gladys.',
    es: 'Ningún dispositivo Tydom con pilas en Gladys.',
  },
  allBatteriesOk: {
    en: 'All batteries are fine.',
    fr: 'Toutes les piles sont en bon état.',
    de: 'Alle Batterien sind in Ordnung.',
    es: 'Todas las pilas están bien.',
  },
  notConnected: {
    en: 'The MQTT broker is not connected: check the configuration.',
    fr: "Le broker MQTT n'est pas connecté : vérifiez la configuration.",
    de: 'Der MQTT-Broker ist nicht verbunden: Überprüfen Sie die Konfiguration.',
    es: 'El broker MQTT no está conectado: revisa la configuración.',
  },
};

/** Same text in every language of `T`, with `{n}` replaced. */
function format(text, values) {
  return Object.fromEntries(
    Object.entries(text).map(([lang, s]) => [
      lang,
      s.replace(/\{(\w+)\}/g, (_, key) => String(values[key])),
    ]),
  );
}

function more(count) {
  return format(
    { en: '+{n} more', fr: '+{n} autres', de: '+{n} weitere', es: '+{n} más' },
    { n: count },
  );
}

/** Pick the user's language out of a multi-language text (English fallback). */
function localize(text, language) {
  return text[language] ?? text.en;
}

// --- Device helpers -----------------------------------------------------------

function findFeature(device, category, type) {
  return (device.features ?? []).find((f) => f.category === category && f.type === type);
}

function currentValue(feature, values) {
  const value = values.get(feature.external_id) ?? feature.last_value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function byName(a, b) {
  return String(a.name ?? '').localeCompare(String(b.name ?? ''));
}

// Tiles of the device widget, in display order: the device's own controls
// first, then its sensors. `gauge` for the 0-100 % ones.
const TILES = [
  [CATEGORIES.SHUTTER, TYPES.SHUTTER.POSITION, 'gauge', T.position],
  [CATEGORIES.LIGHT, TYPES.LIGHT.BRIGHTNESS, 'gauge', T.brightness],
  [CATEGORIES.THERMOSTAT, TYPES.THERMOSTAT.TARGET_TEMPERATURE, 'value', T.setpoint],
  [CATEGORIES.TEMPERATURE_SENSOR, TYPES.SENSOR.DECIMAL, 'value', T.temperature],
  [CATEGORIES.HUMIDITY_SENSOR, TYPES.SENSOR.DECIMAL, 'value', T.humidity],
  [CATEGORIES.ENERGY_SENSOR, TYPES.ENERGY_SENSOR.POWER, 'value', T.power],
  [CATEGORIES.ENERGY_SENSOR, TYPES.ENERGY_SENSOR.ENERGY, 'value', T.energy],
  [CATEGORIES.ENERGY_SENSOR, TYPES.ENERGY_SENSOR.CURRENT, 'value', T.current],
  [CATEGORIES.ENERGY_SENSOR, TYPES.ENERGY_SENSOR.VOLTAGE, 'value', T.voltage],
  [CATEGORIES.MOTION_SENSOR, TYPES.SENSOR.BINARY, 'value', T.motion],
  [CATEGORIES.BATTERY, TYPES.BATTERY.INTEGER, 'value', T.battery],
];
const MAX_TILES = 6;

// The history worth a chart, by preference.
const CHARTS = [
  [CATEGORIES.TEMPERATURE_SENSOR, TYPES.SENSOR.DECIMAL, CHART_TYPES.LINE],
  [CATEGORIES.ENERGY_SENSOR, TYPES.ENERGY_SENSOR.POWER, CHART_TYPES.AREA],
  [CATEGORIES.HUMIDITY_SENSOR, TYPES.SENSOR.DECIMAL, CHART_TYPES.LINE],
  [CATEGORIES.SHUTTER, TYPES.SHUTTER.POSITION, CHART_TYPES.STEPLINE],
  [CATEGORIES.LIGHT, TYPES.LIGHT.BRIGHTNESS, CHART_TYPES.STEPLINE],
];

/** Open / stop / close buttons bound to a shutter `state` feature. */
function shutterButtons(state) {
  const id = state.external_id;
  return [
    {
      type: 'button',
      label: T.open,
      icon: 'chevrons-up',
      device_feature: id,
      value: COVER_STATE.OPEN,
    },
    { type: 'button', label: T.stop, icon: 'square', device_feature: id, value: COVER_STATE.STOP },
    {
      type: 'button',
      label: T.close,
      icon: 'chevrons-down',
      device_feature: id,
      value: COVER_STATE.CLOSE,
    },
  ];
}

function deviceButtons(device) {
  const buttons = [];
  const shutter = findFeature(device, CATEGORIES.SHUTTER, TYPES.SHUTTER.STATE);
  if (shutter) buttons.push(...shutterButtons(shutter));
  const binary =
    findFeature(device, CATEGORIES.LIGHT, TYPES.LIGHT.BINARY) ??
    findFeature(device, CATEGORIES.SWITCH, TYPES.SWITCH.BINARY);
  if (binary && !binary.read_only) {
    const id = binary.external_id;
    buttons.push(
      {
        type: 'button',
        label: T.on,
        icon: 'power',
        style: BUTTON_STYLES.PRIMARY,
        device_feature: id,
        value: 1,
      },
      { type: 'button', label: T.off, icon: 'power', device_feature: id, value: 0 },
    );
  }
  const setpoint = findFeature(device, CATEGORIES.THERMOSTAT, TYPES.THERMOSTAT.TARGET_TEMPERATURE);
  if (setpoint && !setpoint.read_only) {
    // Relative orders: the widget reads the setpoint when the button is tapped.
    buttons.push(
      {
        type: 'button',
        label: `−${SETPOINT_STEP} °C`,
        icon: 'minus',
        action: { key: 'setpoint_down' },
      },
      {
        type: 'button',
        label: `+${SETPOINT_STEP} °C`,
        icon: 'plus',
        action: { key: 'setpoint_up' },
      },
    );
  }
  return buttons;
}

/**
 * Content of the `tydom_device` widget: everything is bound to the device
 * features, so the tiles and the chart follow the states live.
 */
export function buildDeviceWidget(device) {
  if (!device) {
    return {
      ttl_seconds: 300,
      components: [{ type: 'text', variant: TEXT_VARIANTS.BODY, text: T.deviceMissing }],
    };
  }
  const components = [];
  for (const [category, type, component, label] of TILES) {
    const feature = findFeature(device, category, type);
    if (!feature || components.length >= MAX_TILES) continue;
    components.push({ type: component, label, device_feature: feature.external_id });
  }
  for (const [category, type, chartType] of CHARTS) {
    const feature = findFeature(device, category, type);
    if (!feature || feature.keep_history === false) continue;
    components.push({
      type: 'chart',
      chart_type: chartType,
      device_features: [feature.external_id],
      interval: CHART_INTERVALS.LAST_DAY,
    });
    break;
  }
  components.push(...deviceButtons(device));
  // Device-bound components follow the states by themselves: only a renamed
  // or deleted device needs a re-pull.
  return { ttl_seconds: 300, components };
}

// --- Shutter (one) -------------------------------------------------------------

function isShutter(device) {
  return Boolean(
    findFeature(device, CATEGORIES.SHUTTER, TYPES.SHUTTER.STATE) ||
    findFeature(device, CATEGORIES.SHUTTER, TYPES.SHUTTER.POSITION),
  );
}

/** The position feature a `shutter` widget can drive, if any. */
function settablePosition(device) {
  const feature = findFeature(device, CATEGORIES.SHUTTER, TYPES.SHUTTER.POSITION);
  return feature && !feature.read_only ? feature : null;
}

// Orders of the "control a shutter" form, in display order.
const SHUTTER_ORDERS = ['open', 'stop', 'close', 'position'];
const ORDER_LABELS = { open: T.open, stop: T.stop, close: T.close, position: T.position };
const ORDER_DONE = {
  open: { en: 'opening', fr: 'ouverture', de: 'öffnet', es: 'abriendo' },
  stop: { en: 'stopped', fr: 'arrêt', de: 'gestoppt', es: 'parada' },
  close: { en: 'closing', fr: 'fermeture', de: 'schließt', es: 'cerrando' },
};

/** Whether a shutter takes at least one order from the widgets. */
function isControllable(device) {
  return Boolean(
    findFeature(device, CATEGORIES.SHUTTER, TYPES.SHUTTER.STATE) || settablePosition(device),
  );
}

/**
 * The feature and value carrying an order to a shutter, `null` when the
 * shutter cannot take it. Open / close fall back to 100 / 0 % on a shutter
 * driven by its position only.
 */
export function shutterOrder(device, order, position) {
  const state = findFeature(device, CATEGORIES.SHUTTER, TYPES.SHUTTER.STATE);
  const settable = settablePosition(device);
  switch (order) {
    case 'open':
      if (state) return { feature: state, value: COVER_STATE.OPEN };
      return settable && { feature: settable, value: 100 };
    case 'close':
      if (state) return { feature: state, value: COVER_STATE.CLOSE };
      return settable && { feature: settable, value: 0 };
    case 'stop':
      return state ? { feature: state, value: COVER_STATE.STOP } : null;
    case 'position':
      return (
        settable && { feature: settable, value: Math.round(Math.min(100, Math.max(0, position))) }
      );
    default:
      return null;
  }
}

/** Toast of an order sent to a shutter. */
function orderSent(device, order, value) {
  if (order === 'position') {
    return format(
      { en: '{name}: {p} %', fr: '{name} : {p} %', de: '{name}: {p} %', es: '{name}: {p} %' },
      { name: device.name, p: value },
    );
  }
  return Object.fromEntries(
    Object.entries(ORDER_DONE[order]).map(([lang, done]) => [
      lang,
      `${device.name}${lang === 'fr' ? ' : ' : ': '}${done}`,
    ]),
  );
}

/**
 * The "Control a shutter…" button: a form to pick ONE shutter among
 * `shutters` and the order to send it. `null` when none takes an order.
 */
function controlButton(shutters, values) {
  const controllable = shutters.filter(isControllable);
  if (controllable.length === 0) return null;
  const [first] = controllable;
  const positionFeature = settablePosition(first);
  const current = positionFeature ? currentValue(positionFeature, values) : null;
  return {
    type: 'button',
    label: T.controlOne,
    icon: 'sliders',
    style: BUTTON_STYLES.PRIMARY,
    action: {
      key: 'control',
      fields: [
        {
          key: 'shutter',
          type: 'select',
          label: T.shutter,
          required: true,
          options: controllable.map((d) => ({
            value: d.external_id,
            // A device name is the same in every language.
            label: { en: String(d.name ?? d.external_id).slice(0, 40) },
          })),
          default: first.external_id,
        },
        {
          key: 'order',
          type: 'select',
          display: 'radio',
          label: T.order,
          required: true,
          options: SHUTTER_ORDERS.map((order) => ({ value: order, label: ORDER_LABELS[order] })),
          default: 'open',
        },
        {
          key: 'position',
          type: 'number',
          label: T.positionPercent,
          description: T.positionHint,
          required: false,
          min: 0,
          max: 100,
          ...(controllable.length === 1 && current !== null && { default: Math.round(current) }),
        },
      ],
    },
  };
}

/**
 * Content of the `shutter` widget: the position gauge and chart are bound to
 * the device features (live); the "Position…" button opens a 0-100 % form
 * pre-filled with the last position received.
 */
export function buildShutterWidget(device, values = new Map()) {
  if (!device) {
    return {
      ttl_seconds: 300,
      components: [{ type: 'text', variant: TEXT_VARIANTS.BODY, text: T.deviceMissing }],
    };
  }
  if (!isShutter(device)) {
    return {
      ttl_seconds: 300,
      components: [{ type: 'text', variant: TEXT_VARIANTS.BODY, text: T.notAShutter }],
    };
  }
  const components = [];
  const position = findFeature(device, CATEGORIES.SHUTTER, TYPES.SHUTTER.POSITION);
  if (position) {
    components.push({ type: 'gauge', label: T.position, device_feature: position.external_id });
  }
  const battery = findFeature(device, CATEGORIES.BATTERY, TYPES.BATTERY.INTEGER);
  if (battery) {
    components.push({ type: 'value', label: T.battery, device_feature: battery.external_id });
  }
  if (position && position.keep_history !== false) {
    components.push({
      type: 'chart',
      chart_type: CHART_TYPES.STEPLINE,
      device_features: [position.external_id],
      interval: CHART_INTERVALS.LAST_DAY,
    });
  }
  const state = findFeature(device, CATEGORIES.SHUTTER, TYPES.SHUTTER.STATE);
  if (state) components.push(...shutterButtons(state));
  const settable = settablePosition(device);
  if (settable) {
    const current = currentValue(settable, values);
    components.push({
      type: 'button',
      label: T.setPosition,
      icon: 'sliders',
      style: BUTTON_STYLES.PRIMARY,
      action: {
        key: 'set_position',
        fields: [
          {
            key: 'position',
            type: 'number',
            label: T.positionPercent,
            required: true,
            min: 0,
            max: 100,
            ...(current !== null && { default: Math.round(current) }),
          },
        ],
      },
    });
  }
  // The form default is the only inline value: re-pulled on position changes.
  return { ttl_seconds: 300, components };
}

// --- Shutters -----------------------------------------------------------------

/** The shutters a `shutters` widget instance shows, sorted by name. */
export function selectShutters(devices, settings = {}) {
  const chosen =
    Array.isArray(settings.devices) && settings.devices.length > 0
      ? new Set(settings.devices)
      : null;
  return devices
    .filter((d) => !chosen || chosen.has(d.external_id))
    .filter(isShutter)
    .sort(byName);
}

function shutterStatus(position, language) {
  if (position === null) return { value: localize(T.unknown, language), color: COLORS.NEUTRAL };
  if (position <= 0) return { value: localize(T.closedOne, language), color: COLORS.NEUTRAL };
  if (position >= 100) return { value: localize(T.openOne, language), color: COLORS.SUCCESS };
  return { value: `${Math.round(position)} %`, color: COLORS.INFO };
}

/** Content of the `shutters` widget. */
export function buildShuttersWidget(devices, values, { settings, language = 'en' } = {}) {
  const shutters = selectShutters(devices, settings);
  if (shutters.length === 0) {
    return {
      ttl_seconds: 300,
      components: [{ type: 'text', variant: TEXT_VARIANTS.BODY, text: T.noShutter }],
    };
  }
  let opened = 0;
  let closed = 0;
  const items = shutters.map((device) => {
    const feature = findFeature(device, CATEGORIES.SHUTTER, TYPES.SHUTTER.POSITION);
    const position = feature ? currentValue(feature, values) : null;
    if (position !== null) {
      if (position > 0) opened += 1;
      else closed += 1;
    }
    return { label: device.name, icon: 'sun', ...shutterStatus(position, language) };
  });
  const components = [
    { type: 'value', label: T.opened, value: opened, icon: 'sun', color: COLORS.PRIMARY },
    { type: 'value', label: T.closed, value: closed, icon: 'moon', color: COLORS.NEUTRAL },
    { type: 'status', items: items.slice(0, MAX_STATUS_ITEMS) },
  ];
  if (items.length > MAX_STATUS_ITEMS) {
    components.push({
      type: 'text',
      variant: TEXT_VARIANTS.CAPTION,
      text: more(items.length - MAX_STATUS_ITEMS),
    });
  }
  const control = controlButton(shutters, values);
  if (control) components.push(control);
  components.push(
    { type: 'button', label: T.openAll, icon: 'chevrons-up', action: { key: 'open' } },
    { type: 'button', label: T.stopAll, icon: 'square', action: { key: 'stop' } },
    {
      type: 'button',
      label: T.closeAll,
      icon: 'chevrons-down',
      action: { key: 'close', confirm: true },
    },
  );
  return { ttl_seconds: 60, components };
}

// --- Batteries ----------------------------------------------------------------

function batteryOf(device, values) {
  const level = findFeature(device, CATEGORIES.BATTERY, TYPES.BATTERY.INTEGER);
  const defect = findFeature(device, CATEGORIES.BATTERY_LOW, TYPES.BATTERY_LOW.BINARY);
  if (!level && !defect) return null;
  return {
    level: level ? currentValue(level, values) : null,
    low: defect ? currentValue(defect, values) === 1 : false,
  };
}

function batteryStatus({ level, low }, language) {
  const value = level !== null ? `${Math.round(level)} %` : localize(low ? T.low : T.ok, language);
  if (low || (level !== null && level <= BATTERY_LOW))
    return { value, color: COLORS.DANGER, rank: 0 };
  if (level !== null && level <= BATTERY_WARNING) return { value, color: COLORS.WARNING, rank: 1 };
  return { value, color: COLORS.SUCCESS, rank: 2 };
}

/** Content of the `batteries` widget: the weakest batteries first. */
export function buildBatteriesWidget(devices, values, { settings = {}, language = 'en' } = {}) {
  const rows = devices
    .map((device) => ({ device, battery: batteryOf(device, values) }))
    .filter((row) => row.battery)
    .map(({ device, battery }) => ({
      device,
      level: battery.level,
      ...batteryStatus(battery, language),
    }))
    .sort(
      (a, b) =>
        a.rank - b.rank || (a.level ?? 101) - (b.level ?? 101) || byName(a.device, b.device),
    );
  if (rows.length === 0) {
    return {
      ttl_seconds: 600,
      components: [{ type: 'text', variant: TEXT_VARIANTS.BODY, text: T.noBattery }],
    };
  }
  const toReplace = rows.filter((row) => row.color === COLORS.DANGER).length;
  const components = [
    {
      type: 'value',
      label: T.toReplace,
      value: toReplace,
      icon: 'battery',
      color: toReplace > 0 ? COLORS.DANGER : COLORS.SUCCESS,
    },
    { type: 'value', label: T.tracked, value: rows.length, icon: 'battery-charging' },
  ];
  const shown = settings.only_low ? rows.filter((row) => row.color !== COLORS.SUCCESS) : rows;
  if (shown.length === 0) {
    components.push({ type: 'text', variant: TEXT_VARIANTS.CAPTION, text: T.allBatteriesOk });
  } else {
    components.push({
      type: 'status',
      items: shown.slice(0, MAX_STATUS_ITEMS).map((row) => ({
        label: row.device.name,
        value: row.value,
        icon: 'battery',
        color: row.color,
      })),
    });
    if (shown.length > MAX_STATUS_ITEMS) {
      components.push({
        type: 'text',
        variant: TEXT_VARIANTS.CAPTION,
        text: more(shown.length - MAX_STATUS_ITEMS),
      });
    }
  }
  return { ttl_seconds: 600, components };
}

// --- Refresh nudges -----------------------------------------------------------

/**
 * At most one `requestWidgetRefresh` per widget and per `intervalMs`; a change
 * during the quiet period is sent at its end, never dropped.
 */
export class RefreshThrottle {
  constructor(gladys, { intervalMs = REFRESH_INTERVAL_MS } = {}) {
    this.gladys = gladys;
    this.intervalMs = intervalMs;
    this.lastSent = new Map();
    this.timers = new Map();
  }

  request(key) {
    if (this.timers.has(key)) return;
    const wait = Math.max(0, (this.lastSent.get(key) ?? -Infinity) + this.intervalMs - Date.now());
    const timer = setTimeout(() => {
      this.timers.delete(key);
      this.lastSent.set(key, Date.now());
      this.gladys.requestWidgetRefresh(key);
    }, wait);
    timer.unref?.();
    this.timers.set(key, timer);
  }

  stop() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}

// Which inline-value widgets show a feature category (the device widget is
// bound to the features: it needs no nudge; the shutter one only for the
// default of its position form).
const REFRESHED_BY_CATEGORY = {
  [CATEGORIES.SHUTTER]: [WIDGET_KEYS.SHUTTERS, WIDGET_KEYS.SHUTTER],
  [CATEGORIES.BATTERY]: [WIDGET_KEYS.BATTERIES],
  [CATEGORIES.BATTERY_LOW]: [WIDGET_KEYS.BATTERIES],
};

// --- Wiring -------------------------------------------------------------------

/**
 * Register the widget handlers.
 * @param {object} gladys  SDK instance
 * @param {import('./tydom/bridge.js').TydomBridge} bridge
 * @returns {RefreshThrottle} to stop on shutdown
 */
export function registerWidgets(gladys, bridge, options = {}) {
  const throttle = new RefreshThrottle(gladys, options);

  gladys.onWidgetGet(WIDGET_KEYS.DEVICE, async ({ settings }) => {
    const devices = await gladys.getDevices();
    return buildDeviceWidget(devices.find((d) => d.external_id === settings.device));
  });

  gladys.onWidgetAction(WIDGET_KEYS.DEVICE, async (actionKey, _params, { settings }) => {
    const delta = SETPOINT_ACTIONS[actionKey];
    if (delta === undefined) throw new Error(`Unknown action ${actionKey}`);
    const devices = await gladys.getDevices();
    const device = devices.find((d) => d.external_id === settings.device);
    const feature =
      device && findFeature(device, CATEGORIES.THERMOSTAT, TYPES.THERMOSTAT.TARGET_TEMPERATURE);
    if (!feature) throw new Error('This device has no setpoint');
    if (!bridge.connected) return T.notConnected;
    const current = currentValue(feature, bridge.values);
    if (current === null) throw new Error('The current setpoint is not known yet');
    const min = feature.min ?? -Infinity;
    const max = feature.max ?? Infinity;
    const target = Math.min(max, Math.max(min, Math.round((current + delta) * 2) / 2));
    await bridge.setValue(feature.external_id, target);
    return format(
      {
        en: 'Setpoint: {t} °C',
        fr: 'Consigne : {t} °C',
        de: 'Sollwert: {t} °C',
        es: 'Consigna: {t} °C',
      },
      { t: target },
    );
  });

  gladys.onWidgetGet(WIDGET_KEYS.SHUTTER, async ({ settings }) => {
    const devices = await gladys.getDevices();
    return buildShutterWidget(
      devices.find((d) => d.external_id === settings.device),
      bridge.values,
    );
  });

  gladys.onWidgetAction(WIDGET_KEYS.SHUTTER, async (actionKey, _params, { settings, values }) => {
    if (actionKey !== 'set_position') throw new Error(`Unknown action ${actionKey}`);
    // An older core drops the `fields` and relays the action without values.
    const target = Number(values?.position);
    if (values?.position === undefined || !Number.isFinite(target)) {
      throw new Error('No position received: update Gladys to set a position');
    }
    const devices = await gladys.getDevices();
    const device = devices.find((d) => d.external_id === settings.device);
    const order = device && shutterOrder(device, 'position', target);
    if (!order) throw new Error('This device has no settable position');
    if (!bridge.connected) return T.notConnected;
    await bridge.setValue(order.feature.external_id, order.value);
    return orderSent(device, 'position', order.value);
  });

  gladys.onWidgetGet(WIDGET_KEYS.SHUTTERS, async ({ settings, language }) =>
    buildShuttersWidget(await gladys.getDevices(), bridge.values, { settings, language }),
  );

  gladys.onWidgetAction(WIDGET_KEYS.SHUTTERS, async (actionKey, params, context) => {
    if (actionKey === 'control') return controlOne(context);
    return controlAll(actionKey, context);
  });

  // "Control a shutter…": the order typed in the form, to ONE shutter.
  async function controlOne({ settings, values }) {
    // An older core drops the `fields` and relays the action without values.
    if (!values?.shutter || !SHUTTER_ORDERS.includes(values.order)) {
      throw new Error('No shutter or order received: update Gladys to use this form');
    }
    const device = selectShutters(await gladys.getDevices(), settings).find(
      (d) => d.external_id === values.shutter,
    );
    if (!device) throw new Error('This shutter is no longer in the widget');
    const position = Number(values.position);
    if (values.order === 'position' && (values.position == null || !Number.isFinite(position))) {
      return T.positionMissing;
    }
    const order = shutterOrder(device, values.order, position);
    if (!order) return T.orderUnsupported;
    if (!bridge.connected) return T.notConnected;
    await bridge.setValue(order.feature.external_id, order.value);
    return orderSent(device, values.order, order.value);
  }

  // "Open / stop / close all".
  async function controlAll(actionKey, { settings }) {
    const value = { open: COVER_STATE.OPEN, stop: COVER_STATE.STOP, close: COVER_STATE.CLOSE }[
      actionKey
    ];
    if (value === undefined) throw new Error(`Unknown action ${actionKey}`);
    if (!bridge.connected) return T.notConnected;
    const targets = selectShutters(await gladys.getDevices(), settings)
      .map((d) => findFeature(d, CATEGORIES.SHUTTER, TYPES.SHUTTER.STATE))
      .filter(Boolean);
    const results = await Promise.allSettled(
      targets.map((f) => bridge.setValue(f.external_id, value)),
    );
    const failed = results.filter((r) => r.status === 'rejected');
    for (const r of failed) logger.warn(`Shutter command failed: ${r.reason?.message}`);
    const sent = targets.length - failed.length;
    if (failed.length > 0) {
      return format(
        {
          en: '{ok} shutter(s) ordered, {ko} failed.',
          fr: '{ok} volet(s) commandé(s), {ko} en échec.',
          de: '{ok} Rollladen/-läden angesteuert, {ko} fehlgeschlagen.',
          es: '{ok} persiana(s) accionada(s), {ko} con error.',
        },
        { ok: sent, ko: failed.length },
      );
    }
    return format(
      {
        en: '{ok} shutter(s) ordered.',
        fr: '{ok} volet(s) commandé(s).',
        de: '{ok} Rollladen/-läden angesteuert.',
        es: '{ok} persiana(s) accionada(s).',
      },
      { ok: sent },
    );
  }

  gladys.onWidgetGet(WIDGET_KEYS.BATTERIES, async ({ settings, language }) =>
    buildBatteriesWidget(await gladys.getDevices(), bridge.values, { settings, language }),
  );

  bridge.on('state', (feature) => {
    for (const key of REFRESHED_BY_CATEGORY[feature.feature?.category] ?? []) {
      throttle.request(key);
    }
  });

  return throttle;
}
