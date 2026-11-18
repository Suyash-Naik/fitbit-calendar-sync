/**
 * Separate OAuth flow for the Google Health API.
 *
 * Why: the Health API rejects tokens that carry any non-health scope
 * (403 DISALLOWED_OAUTH_SCOPES). ScriptApp.getOAuthToken() always carries the
 * script's Calendar/UrlFetch/trigger scopes, so we mint a health-only token
 * with our own OAuth client and keep its refresh token in UserProperties.
 *
 * Setup (once): see docs/guide.md, steps A7 and B4. Then run authorizeHealth()
 * and open the logged URL.
 */

const HEALTH_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
];
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

const PROP_CLIENT_ID = 'HEALTH_CLIENT_ID';         // Script property (set by hand)
const PROP_CLIENT_SECRET = 'HEALTH_CLIENT_SECRET'; // Script property (set by hand)
const PROP_REFRESH = 'HEALTH_REFRESH_TOKEN';       // User property (set by authCallback)
const PROP_ACCESS = 'HEALTH_ACCESS_TOKEN';
const PROP_EXPIRES_AT = 'HEALTH_ACCESS_EXPIRES_AT';

/** Run from the editor: logs the URL to open for the one-time Health consent. */
function authorizeHealth() {
  const client = getHealthClient_();
  const state = ScriptApp.newStateToken()
    .withMethod('authCallback')
    .withTimeout(3600)
    .createToken();
  const url = GOOGLE_AUTH_URL + '?' + toQueryString_({
    client_id: client.id,
    redirect_uri: healthRedirectUri_(),
    response_type: 'code',
    scope: HEALTH_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent', // always return a refresh token
    state: state,
  });
  console.log('Redirect URI (must be registered on the OAuth client):\n%s', healthRedirectUri_());
  console.log('Open this URL in your browser and approve both health permissions:\n%s', url);
}

/** OAuth redirect target. Must stay a global, non-underscore function. */
function authCallback(request) {
  const p = request.parameter || {};
  if (p.error) {
    return HtmlService.createHtmlOutput('❌ Authorization failed: ' + p.error);
  }
  const client = getHealthClient_();
  const tokens = postToken_({
    code: p.code,
    client_id: client.id,
    client_secret: client.secret,
    redirect_uri: healthRedirectUri_(),
    grant_type: 'authorization_code',
  });
  if (!tokens.refresh_token) {
    return HtmlService.createHtmlOutput('❌ No refresh token returned. Run authorizeHealth() again.');
  }
  const props = PropertiesService.getUserProperties();
  props.setProperty(PROP_REFRESH, tokens.refresh_token);
  storeAccessToken_(tokens);
  return HtmlService.createHtmlOutput(
    '✅ Google Health authorized (scopes: ' + tokens.scope + '). You can close this tab.');
}

/** Returns a valid health-only access token, refreshing if needed. */
function getHealthAccessToken_() {
  const props = PropertiesService.getUserProperties();
  const cached = props.getProperty(PROP_ACCESS);
  const expiresAt = Number(props.getProperty(PROP_EXPIRES_AT) || 0);
  if (cached && Date.now() < expiresAt - 60 * 1000) return cached;

  const refresh = props.getProperty(PROP_REFRESH);
  if (!refresh) {
    throw healthAuthError_('Not authorized yet. Run authorizeHealth() and open the logged URL.');
  }
  const client = getHealthClient_();
  let tokens;
  try {
    tokens = postToken_({
      refresh_token: refresh,
      client_id: client.id,
      client_secret: client.secret,
      grant_type: 'refresh_token',
    });
  } catch (e) {
    if (/invalid_grant/.test(e.message)) {
      throw healthAuthError_('Health authorization expired or was revoked ' +
        '(Testing mode expires it after 7 days). Run authorizeHealth() again.');
    }
    throw e;
  }
  return storeAccessToken_(tokens);
}

/** Run from the editor to forget the stored Health tokens. */
function resetHealthAuth() {
  const props = PropertiesService.getUserProperties();
  [PROP_REFRESH, PROP_ACCESS, PROP_EXPIRES_AT].forEach(function (k) { props.deleteProperty(k); });
  console.log('Health tokens cleared. Run authorizeHealth() to authorize again.');
}

function healthRedirectUri_() {
  return 'https://script.google.com/macros/d/' + ScriptApp.getScriptId() + '/usercallback';
}

function getHealthClient_() {
  const sp = PropertiesService.getScriptProperties();
  const id = sp.getProperty(PROP_CLIENT_ID);
  const secret = sp.getProperty(PROP_CLIENT_SECRET);
  if (!id || !secret) {
    throw healthAuthError_('Missing script properties ' + PROP_CLIENT_ID + ' / ' + PROP_CLIENT_SECRET +
      '. Add them under Project Settings → Script properties (docs/guide.md B4).');
  }
  return { id: id, secret: secret };
}

function postToken_(payload) {
  const res = UrlFetchApp.fetch(GOOGLE_TOKEN_URL, {
    method: 'post',
    payload: payload, // form-encoded
    muteHttpExceptions: true,
  });
  const body = res.getContentText();
  if (res.getResponseCode() !== 200) {
    throw new Error('Token endpoint HTTP ' + res.getResponseCode() + ': ' + body.slice(0, 500));
  }
  return JSON.parse(body);
}

function storeAccessToken_(tokens) {
  const props = PropertiesService.getUserProperties();
  props.setProperty(PROP_ACCESS, tokens.access_token);
  props.setProperty(PROP_EXPIRES_AT, String(Date.now() + Number(tokens.expires_in || 3600) * 1000));
  return tokens.access_token;
}

function healthAuthError_(msg) {
  const err = new Error(msg);
  err.isHealthAuthError = true;
  return err;
}
