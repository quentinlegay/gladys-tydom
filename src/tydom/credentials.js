// -----------------------------------------------------------------------------
// Delta Dore account flow: exchange a Delta Dore login/password for the
// Tydom gateway's own password (mac + password is what the box itself
// authenticates with, both locally and through the mediation relay).
//
// Only needed once — the resolved password is meant to be copied into the
// `tydom_password` field so the integration never has to store or replay the
// Delta Dore account password on every (re)connection. Mirrors
// TydomClient.getTydomCredentials in tydom2mqtt.
//
// Uses the global `fetch` (Node 20+), no extra dependency.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import {
  DELTADORE_AUTH_URL,
  DELTADORE_AUTH_GRANT_TYPE,
  DELTADORE_AUTH_CLIENT_ID,
  DELTADORE_AUTH_SCOPE,
  DELTADORE_API_SITES,
} from './const.js';

const logger = createLogger({ name: 'tydom:credentials' });

/**
 * Resolve the Tydom gateway password from a Delta Dore account.
 * @param {string} login - Delta Dore account email.
 * @param {string} password - Delta Dore account password.
 * @param {string} mac - the Tydom gateway mac (identifies which site to read).
 * @returns {Promise<string>} the gateway password.
 * @throws if the account credentials are refused or the mac has no matching site.
 */
export async function fetchGatewayPassword(login, password, mac) {
  const discovery = await fetchJson(DELTADORE_AUTH_URL);
  const signinUrl = discovery.token_endpoint;
  if (!signinUrl) {
    throw new Error('Delta Dore discovery document has no token_endpoint');
  }

  const form = new FormData();
  form.append('username', login);
  form.append('password', password);
  form.append('grant_type', DELTADORE_AUTH_GRANT_TYPE);
  form.append('client_id', DELTADORE_AUTH_CLIENT_ID);
  form.append('scope', DELTADORE_AUTH_SCOPE);

  const tokenResponse = await fetch(signinUrl, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(15_000),
  });
  const tokenBody = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok || !tokenBody.access_token) {
    logger.warn('Delta Dore sign-in refused', tokenBody.error_description || tokenResponse.status);
    throw new Error('Delta Dore account sign-in refused: check the login/password');
  }

  const sites = await fetchJson(`${DELTADORE_API_SITES}${encodeURIComponent(mac)}`, {
    headers: { Authorization: `Bearer ${tokenBody.access_token}` },
  });

  const gatewayPassword = sites?.sites?.[0]?.gateway?.password;
  if (!gatewayPassword) {
    throw new Error(`No Tydom site found for mac "${mac}" on this Delta Dore account`);
  }
  return gatewayPassword;
}

async function fetchJson(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    throw new Error(`Delta Dore HTTP ${response.status} (${url})`);
  }
  return response.json();
}
