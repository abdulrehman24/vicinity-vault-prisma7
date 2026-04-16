"use client";

const DEFAULT_TTL_MS = 15000;

const globalCache = globalThis;
if (!globalCache.__vaultApiCache) {
  globalCache.__vaultApiCache = new Map();
}
if (!globalCache.__vaultApiInflight) {
  globalCache.__vaultApiInflight = new Map();
}

const responseCache = globalCache.__vaultApiCache;
const inflightCache = globalCache.__vaultApiInflight;

const buildGetCacheKey = (url) => `GET:${url}`;

const handleUnauthorized = () => {
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
};

export const invalidateApiCache = (prefix = "") => {
  const keyPrefix = prefix ? `GET:${prefix}` : "GET:";
  for (const key of responseCache.keys()) {
    if (key.startsWith(keyPrefix)) {
      responseCache.delete(key);
    }
  }
  for (const key of inflightCache.keys()) {
    if (key.startsWith(keyPrefix)) {
      inflightCache.delete(key);
    }
  }
};

export const getJson = async (url, options = {}) => {
  const ttlMs = Number.isFinite(options.ttlMs) ? Number(options.ttlMs) : DEFAULT_TTL_MS;
  const force = Boolean(options.force);
  const cacheKey = buildGetCacheKey(url);
  const now = Date.now();

  if (!force) {
    const cached = responseCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }
    const inFlight = inflightCache.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }
  }

  const requestPromise = fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json"
    }
  })
    .then(async (response) => {
      if (response.status === 401) {
        handleUnauthorized();
        throw new Error("Session expired. Please sign in again.");
      }
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "Request failed");
      }
      responseCache.set(cacheKey, {
        data: payload,
        expiresAt: Date.now() + ttlMs
      });
      return payload;
    })
    .finally(() => {
      inflightCache.delete(cacheKey);
    });

  inflightCache.set(cacheKey, requestPromise);
  return requestPromise;
};

export const sendJson = async (url, init = {}) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error("Session expired. Please sign in again.");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "Request failed");
  }

  return payload;
};

export const notifyDataChanged = (prefixes = []) => {
  prefixes.forEach((prefix) => invalidateApiCache(prefix));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("vault:data-changed"));
  }
};
