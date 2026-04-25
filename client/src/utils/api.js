import { API_BASE_URL, SOCKET_URL } from './constants';

const DEFAULT_LOCAL_PORTS = ['5000', '5050'];
const HTTP_URL_RE = /^https?:\/\//i;

let resolvedApiBase = null;

const trimTrailingSlash = (value) => String(value || '').replace(/\/+$/, '');

function unique(values) {
  const seen = new Set();
  const result = [];

  values.forEach((value) => {
    if (value == null) {
      return;
    }

    const normalized = String(value);
    if (seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    result.push(normalized);
  });

  return result;
}

function isHttpUrl(value) {
  return HTTP_URL_RE.test(String(value || ''));
}

function getLocation() {
  return typeof window !== 'undefined' ? window.location : null;
}

function getLocalOrigins() {
  const location = getLocation();
  if (!location || !import.meta.env.DEV) {
    return [];
  }

  const protocol = location.protocol === 'https:' ? 'https:' : 'http:';
  const hosts = unique([
    location.hostname || 'localhost',
    location.hostname === 'localhost' ? '127.0.0.1' : null,
    location.hostname === '127.0.0.1' ? 'localhost' : null,
  ]);

  return hosts
    .flatMap((host) => DEFAULT_LOCAL_PORTS.map((port) => `${protocol}//${host}:${port}`))
    .filter((origin) => origin !== location.origin);
}

function buildAbsoluteUrl(path, base) {
  const normalizedPath = String(path || '').startsWith('/') ? String(path) : `/${path || ''}`;
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

function getConfiguredApiBases() {
  return unique([
    trimTrailingSlash(import.meta.env.VITE_API_PROXY_TARGET),
    trimTrailingSlash(API_BASE_URL),
  ]);
}

function inferBase(path, base) {
  if (base != null) {
    return trimTrailingSlash(base);
  }

  if (isHttpUrl(path)) {
    return trimTrailingSlash(new URL(path).origin);
  }

  return '';
}

function isJsonResponse(response) {
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  return contentType.includes('application/json') || contentType.includes('+json');
}

export function rememberApiBase(base) {
  if (base == null) {
    return;
  }

  resolvedApiBase = trimTrailingSlash(base);
}

export function getApiCandidates() {
  return unique([
    resolvedApiBase,
    '',
    ...getConfiguredApiBases(),
    ...getLocalOrigins(),
  ]);
}

export function getApiUrl(path) {
  if (isHttpUrl(path)) {
    return String(path);
  }

  return buildAbsoluteUrl(path, resolvedApiBase || trimTrailingSlash(API_BASE_URL));
}

export async function fetchApi(path, init = {}, options = {}) {
  const expectJson = options.expectJson === true;
  const isAbsolute = isHttpUrl(path);
  const candidates = isAbsolute ? [null] : getApiCandidates();
  let lastError = null;

  for (const base of candidates) {
    const url = isAbsolute ? String(path) : buildAbsoluteUrl(path, base);

    try {
      const response = await fetch(url, init);

      if (expectJson) {
        if (isJsonResponse(response)) {
          rememberApiBase(inferBase(path, base));
          return response;
        }

        lastError = new Error(
          `Expected JSON from ${url}, received ${response.headers.get('content-type') || 'unknown content type'}`
        );
        continue;
      }

      rememberApiBase(inferBase(path, base));
      return response;
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw error;
      }

      lastError = error;
    }
  }

  throw lastError || new Error(`Failed to reach API for ${path}`);
}

export async function fetchApiJson(path, init = {}) {
  const res = await fetchApi(path, init, { expectJson: true });
  const data = await res.json();
  return { res, data };
}

export function getSocketCandidates() {
  return unique([
    trimTrailingSlash(SOCKET_URL),
    ...getApiCandidates(),
  ]);
}
