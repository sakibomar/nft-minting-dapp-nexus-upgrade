var axios = require('axios');
var path = require('path');
var fs = require('fs');

/* ── Pinata auth from environment ────────────────────────────────── */
var PINATA_KEY = process.env.PINATA_API_KEY || '';
var PINATA_SECRET = process.env.PINATA_SECRET_KEY || '';

/* ── Pinata Dedicated Gateway (bypasses ISP-blocked public gateways) ──
 *
 *  Every Pinata account (even free) gets a dedicated gateway at:
 *    https://<your-subdomain>.mypinata.cloud
 *
 *  This is a UNIQUE domain — completely different from the public
 *  gateways (ipfs.io, dweb.link, etc.) that your ISP blocks.
 *
 *  Set these in your server .env:
 *    PINATA_GATEWAY_URL=https://your-subdomain.mypinata.cloud
 *    PINATA_GATEWAY_KEY=your-gateway-access-token   (optional)
 *
 *  Find both values at: app.pinata.cloud → Gateways
 * ──────────────────────────────────────────────────────────────────── */
var PINATA_GATEWAY = process.env.PINATA_GATEWAY_URL || '';
var PINATA_GATEWAY_KEY = process.env.PINATA_GATEWAY_KEY || '';

// Strip trailing slash for clean URL construction
if (PINATA_GATEWAY) {
  PINATA_GATEWAY = PINATA_GATEWAY.replace(/\/+$/, '');
}

/* ── Public gateways — used as last resort ────────────────────────── */
var GATEWAYS = [
  'https://gateway.pinata.cloud/ipfs/',
  'https://ipfs.io/ipfs/',
  'https://dweb.link/ipfs/',
  'https://w3s.link/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://cf-ipfs.com/ipfs/',
  'https://4everland.io/ipfs/',
];

/* ══════════════════════════════════════════════════════════════════════
   EMBEDDED METADATA CACHE
   Pre-fetched metadata for all existing NFTs.
   When gateways are unreachable, this ensures metadata always loads.
   New NFTs minted after this deploy will still fetch from gateways.
   ══════════════════════════════════════════════════════════════════════ */
var EMBEDDED_METADATA = {
  'QmNQpS1wjchnYcQcgSuGkXJcmxMgzSumbxSuz6c1or4hv4': {"name":"Josehph","description":"Joshesph","image":"ipfs://QmXd6Ak5Lc8N4d5AKz7kAVfckaaBU4XG5QuUhkSCjGimi5","attributes":[{"trait_type":"COCO BERRY","value":"LEMON BERRY"}]},
  'QmPF9xZTRrHm5SYBFE5FKJYzUinzXXWPzmk26YiRtTbAvP': {"name":"Josehph","description":"Joshesph","image":"ipfs://QmXd6Ak5Lc8N4d5AKz7kAVfckaaBU4XG5QuUhkSCjGimi5","attributes":[{"trait_type":"Color","value":"Blue"}]},
  'QmPPXSUaACtHhL6jtYQRHBgC5SsHXLixA2XGoPGNqASqZr': {"name":"jsoh","description":"390202","image":"ipfs://QmXd6Ak5Lc8N4d5AKz7kAVfckaaBU4XG5QuUhkSCjGimi5","attributes":[{"trait_type":"Collection","value":"CN6035 NFT Collection"},{"trait_type":"Standard","value":"ERC-721"},{"trait_type":"Created","value":"2026-03-31T10:16:57.813Z"}]},
  'QmQSvktr7b2zYUPqRCJs6bmwRvdUUuCCNHGY46kP9iobqF': {"name":"The Nashion","description":"Free","image":"ipfs://QmcUGmE7ad9jpPuN9jJps88yyhUSbfFeNWuX9VQ6QqBbNJ","attributes":[{"trait_type":"Male","value":"9999"}]},
  'QmQyJLUHmisxnYbYSQcb3dC5bM6NXNbpjjMwt4Ldyddn4J': {"name":"Josehph","description":"The Lost Doll Pls Cry For Him WOOP WOOP","image":"ipfs://QmTL6G4kXqiMedbXqUcQkz2m8RJfWY7Pr4EyjRPkNKqPWH","attributes":[{"trait_type":"White","value":"19920"}]},
  'QmTDmpUxvkQRsUeak34Z1c6ZmXZVPKXhrKE3QYDDjZehJp': {"name":"Josehph","description":"The Doll That Forgot","image":"ipfs://QmTL6G4kXqiMedbXqUcQkz2m8RJfWY7Pr4EyjRPkNKqPWH","attributes":[{"trait_type":"Collection","value":"CN6035 NFT Collection"},{"trait_type":"Standard","value":"ERC-721"},{"trait_type":"Created","value":"2026-03-31T11:27:24.719Z"}]},
  'QmUf9gZ2u22aTf6x13uRLh3QLSHCVjGf8tvbhdqcMGg1Xx': {"name":"Josehph","description":"Lorei","image":"ipfs://QmTrV32iHZzipqKW62EiEhnpi4UBykhEbA8PPBWBg5F2rf","attributes":[{"trait_type":"Red","value":"Sam"}]},
  'QmUgiGhDe2U42S37uPd7gcLyAnqHSrkqrkhhMeAnyCv5ee': {"name":"APE2","description":"JOJO","image":"ipfs://QmPML1NtXZF75QA3wpG8BX67zGMkm76CH12KDkLqJAE5NT","attributes":[{"trait_type":"Red","value":"82920"}]},
  'QmUmHERmeddoJAfeZxzqdSB61Z1iHBWWpqg7DAWrin5jvv': {"name":"The Nashion","description":"Peace","image":"ipfs://QmVvhzir8fqW1GBYa6EMqUKy1rcBPvSYi86swfYV5KRnE5","attributes":[{"trait_type":"Collection","value":"CN6035 NFT Collection"},{"trait_type":"Standard","value":"ERC-721"},{"trait_type":"Created","value":"2026-03-31T11:52:07.732Z"}]},
  'QmWw69LxeuK3sTvjQvVEZsk9ACzCTrW6wjdJkd7pEdVG7W': {"name":"Josehph","description":"LARA LRA","image":"ipfs://QmPML1NtXZF75QA3wpG8BX67zGMkm76CH12KDkLqJAE5NT","attributes":[{"trait_type":"TEST","value":"JOCO"}]},
  'QmcACZbUTMqCnweKiQvVb4whYJVdud42KvC8wU3ZXZX5sG': {"name":"APE2","description":"HOSJIWW","image":"ipfs://QmPY3w89f3kHKK4nUQqzkkRpD44Xtdam3GaJjf9Ahu7CZD","attributes":[{"trait_type":"Collection","value":"CN6035 NFT Collection"},{"trait_type":"Standard","value":"ERC-721"},{"trait_type":"Created","value":"2026-03-31T11:38:30.068Z"}]},
  'QmcCjUgruxBgmwUfL9H3WHq6chMW5HcBuR8ND1KZYQ4KWb': {"name":"Josehph","description":"LOLO","image":"ipfs://QmPbU2wHJ4uCmPxiApdUdzKN8mrssc39F1fKvHK7qNbXbq","attributes":[{"trait_type":"TUBO","value":"BEN"}]},
  'QmdEkvWkZfy28tijwzxHupzXdX5rUND2SZwYZP19GvfzaC': {"name":"JOSHBLA BLA BLA","description":"COCOCMELEON","image":"ipfs://QmZCX8SkJoY6ssXfXu4fph3DfzRcnhnHZytXQNbGeDbj6t","attributes":[{"trait_type":"Collection","value":"CN6035 NFT Collection"},{"trait_type":"Standard","value":"ERC-721"},{"trait_type":"Created","value":"2026-03-31T09:59:57.392Z"}]},
  'QmdPGS4h4YXcMSfjh23exG88oRRnPjfcWSSqcjLim87yNV': {"name":"The Nashion","description":"THE COUNTRY","image":"ipfs://QmRSPHpj8SW3rBTDkn7m2wEzvkv3x3SzXMmKDEapdjTd6a","attributes":[{"trait_type":"Lorei","value":"32"}]},
};

/* ── Image CID → direct gateway fallback URLs ───────────────────── */
/* When server can't fetch images, client falls back to these */
var IMAGE_GATEWAY_FALLBACKS = {
  'QmXd6Ak5Lc8N4d5AKz7kAVfckaaBU4XG5QuUhkSCjGimi5': true,
  'QmTL6G4kXqiMedbXqUcQkz2m8RJfWY7Pr4EyjRPkNKqPWH': true,
  'QmTrV32iHZzipqKW62EiEhnpi4UBykhEbA8PPBWBg5F2rf': true,
  'QmPML1NtXZF75QA3wpG8BX67zGMkm76CH12KDkLqJAE5NT': true,
  'QmcUGmE7ad9jpPuN9jJps88yyhUSbfFeNWuX9VQ6QqBbNJ': true,
  'QmVvhzir8fqW1GBYa6EMqUKy1rcBPvSYi86swfYV5KRnE5': true,
  'QmPY3w89f3kHKK4nUQqzkkRpD44Xtdam3GaJjf9Ahu7CZD': true,
  'QmPbU2wHJ4uCmPxiApdUdzKN8mrssc39F1fKvHK7qNbXbq': true,
  'QmZCX8SkJoY6ssXfXu4fph3DfzRcnhnHZytXQNbGeDbj6t': true,
  'QmRSPHpj8SW3rBTDkn7m2wEzvkv3x3SzXMmKDEapdjTd6a': true,
};

/* ── Disk cache — survives server restarts ───────────────────────── */
var CACHE_DIR = path.join(__dirname, '..', '.ipfs-cache');
try {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
} catch (e) {
  console.warn('⚠️ Could not create IPFS cache dir:', e.message);
}

function safeCacheKey(cid) {
  return cid.replace(/[\/\\:?*"<>|]/g, '_');
}

function getDiskJson(cid) {
  try {
    var p = path.join(CACHE_DIR, safeCacheKey(cid) + '.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) { /* ignore */ }
  return null;
}

function setDiskJson(cid, data) {
  try {
    var p = path.join(CACHE_DIR, safeCacheKey(cid) + '.json');
    fs.writeFileSync(p, JSON.stringify(data));
    console.log('💾 Metadata cached to disk: ' + cid.substring(0, 16) + '...');
  } catch (e) { /* ignore */ }
}

function getDiskBinary(cid) {
  try {
    var binPath = path.join(CACHE_DIR, safeCacheKey(cid) + '.bin');
    var metaPath = path.join(CACHE_DIR, safeCacheKey(cid) + '.meta');
    if (fs.existsSync(binPath) && fs.existsSync(metaPath)) {
      return {
        data: fs.readFileSync(binPath),
        contentType: fs.readFileSync(metaPath, 'utf-8').trim(),
      };
    }
  } catch (e) { /* ignore */ }
  return null;
}

function setDiskBinary(cid, buf, contentType) {
  try {
    var binPath = path.join(CACHE_DIR, safeCacheKey(cid) + '.bin');
    var metaPath = path.join(CACHE_DIR, safeCacheKey(cid) + '.meta');
    fs.writeFileSync(binPath, buf);
    fs.writeFileSync(metaPath, contentType || 'application/octet-stream');
    console.log('💾 Image cached to disk: ' + cid.substring(0, 16) + '...');
  } catch (e) { /* ignore */ }
}

/* ── In-memory cache (fast, session-only) ────────────────────────── */
var memJsonCache = {};
var memBinaryCache = {};

/**
 * Extract CID from any IPFS URI format (ipfs://, gateway URL, bare CID).
 */
function extractCid(uri) {
  if (!uri || typeof uri !== 'string') return null;
  if (uri.startsWith('ipfs://')) return uri.slice(7);
  var m = uri.match(/\/ipfs\/([a-zA-Z0-9].+)/);
  if (m) return m[1];
  if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-zA-Z0-9]{50,})/.test(uri)) return uri;
  return null;
}

/**
 * Convert any IPFS URI to a gateway URL.
 * Prefers the dedicated Pinata gateway if configured.
 */
function toGatewayUrl(uri) {
  var cid = extractCid(uri);
  if (!cid) return uri;
  if (PINATA_GATEWAY) return PINATA_GATEWAY + '/ipfs/' + cid;
  return GATEWAYS[0] + cid;
}

/**
 * Build axios config — add Pinata auth headers for the Pinata gateway.
 */
function buildAxiosConfig(gwUrl, timeout, responseType) {
  var config = { timeout: timeout, responseType: responseType };
  if (PINATA_KEY && gwUrl.indexOf('pinata.cloud') !== -1) {
    config.headers = {
      'pinata_api_key': PINATA_KEY,
      'pinata_secret_api_key': PINATA_SECRET,
    };
  }
  return config;
}

/**
 * Build the dedicated Pinata gateway URL for a CID.
 * Returns null if the dedicated gateway is not configured.
 */
function buildPinataGatewayUrl(cid) {
  if (!PINATA_GATEWAY) return null;
  var url = PINATA_GATEWAY + '/ipfs/' + cid;
  if (PINATA_GATEWAY_KEY) {
    url += '?pinataGatewayToken=' + PINATA_GATEWAY_KEY;
  }
  return url;
}

/**
 * Try to fetch JSON from the Pinata dedicated gateway.
 * Returns the parsed JSON or null on failure.
 */
function tryPinataGatewayJson(cid, timeout) {
  var url = buildPinataGatewayUrl(cid);
  if (!url) return Promise.resolve(null);

  console.log('🔑 Trying Pinata dedicated gateway for: ' + cid.substring(0, 16) + '...');
  return axios
    .get(url, { timeout: timeout, responseType: 'json' })
    .then(function (res) {
      if (res.data && typeof res.data === 'object') {
        console.log('✅ Pinata dedicated gateway HIT for: ' + cid.substring(0, 16) + '...');
        return res.data;
      }
      return null;
    })
    .catch(function () {
      console.log('❌ Pinata dedicated gateway miss for: ' + cid.substring(0, 16) + '...');
      return null;
    });
}

/**
 * Try to fetch binary from the Pinata dedicated gateway.
 * Returns { data: Buffer, contentType: string } or null on failure.
 */
function tryPinataGatewayBinary(cid, timeout) {
  var url = buildPinataGatewayUrl(cid);
  if (!url) return Promise.resolve(null);

  console.log('🔑 Trying Pinata dedicated gateway (image) for: ' + cid.substring(0, 16) + '...');
  return axios
    .get(url, { timeout: timeout, responseType: 'arraybuffer' })
    .then(function (res) {
      if (res.status === 200) {
        console.log('✅ Pinata dedicated gateway image HIT for: ' + cid.substring(0, 16) + '...');
        return {
          data: Buffer.from(res.data),
          contentType: res.headers['content-type'] || 'application/octet-stream',
        };
      }
      return null;
    })
    .catch(function () {
      console.log('❌ Pinata dedicated gateway image miss for: ' + cid.substring(0, 16) + '...');
      return null;
    });
}

/**
 * Fetch JSON from IPFS.
 * Priority: memory → disk → embedded → Pinata dedicated gateway → public gateways.
 */
function fetchJson(cid, timeout) {
  if (timeout === undefined) timeout = 20000;

  // 1. Memory cache
  if (memJsonCache[cid]) return Promise.resolve(memJsonCache[cid]);

  // 2. Disk cache
  var disk = getDiskJson(cid);
  if (disk) {
    memJsonCache[cid] = disk;
    return Promise.resolve(disk);
  }

  // 3. Embedded metadata cache (hardcoded fallback)
  if (EMBEDDED_METADATA[cid]) {
    console.log('✅ Loaded from embedded cache: ' + cid.substring(0, 16) + '...');
    memJsonCache[cid] = EMBEDDED_METADATA[cid];
    setDiskJson(cid, EMBEDDED_METADATA[cid]);
    return Promise.resolve(EMBEDDED_METADATA[cid]);
  }

  // 4. Pinata dedicated gateway (bypasses ISP blocks)
  return tryPinataGatewayJson(cid, timeout).then(function (pinataData) {
    if (pinataData) {
      memJsonCache[cid] = pinataData;
      setDiskJson(cid, pinataData);
      return pinataData;
    }

    // 5. Public gateways — race all (last resort)
    var promises = GATEWAYS.map(function (gw) {
      var url = gw + cid;
      return axios
        .get(url, buildAxiosConfig(url, timeout, 'json'))
        .then(function (res) {
          if (res.data && typeof res.data === 'object') return res.data;
          throw new Error('Invalid response');
        });
    });

    return Promise.any(promises)
      .then(function (data) {
        memJsonCache[cid] = data;
        setDiskJson(cid, data);
        console.log('✅ Cached metadata for CID: ' + cid.substring(0, 16) + '...');
        return data;
      })
      .catch(function () {
        console.warn('⚠️ All gateways failed for JSON CID: ' + cid.substring(0, 16) + '...');
        return null;
      });
  });
}

/**
 * Fetch binary (image) from IPFS.
 * Priority: memory → disk → Pinata dedicated gateway → public gateways.
 */
function fetchBinary(cid, timeout) {
  if (timeout === undefined) timeout = 20000;

  // 1. Memory cache
  if (memBinaryCache[cid]) {
    return Promise.resolve({
      data: memBinaryCache[cid].data,
      contentType: memBinaryCache[cid].contentType,
    });
  }

  // 2. Disk cache
  var disk = getDiskBinary(cid);
  if (disk) {
    memBinaryCache[cid] = disk;
    return Promise.resolve(disk);
  }

  // 3. Pinata dedicated gateway (bypasses ISP blocks)
  return tryPinataGatewayBinary(cid, timeout).then(function (pinataResult) {
    if (pinataResult) {
      memBinaryCache[cid] = pinataResult;
      setDiskBinary(cid, pinataResult.data, pinataResult.contentType);
      return pinataResult;
    }

    // 4. Public gateways — race all (last resort)
    var promises = GATEWAYS.map(function (gw) {
      var url = gw + cid;
      return axios
        .get(url, buildAxiosConfig(url, timeout, 'arraybuffer'))
        .then(function (res) {
          if (res.status === 200) {
            return {
              data: Buffer.from(res.data),
              contentType: res.headers['content-type'] || 'application/octet-stream',
            };
          }
          throw new Error('Bad status');
        });
    });

    return Promise.any(promises)
      .then(function (result) {
        memBinaryCache[cid] = result;
        setDiskBinary(cid, result.data, result.contentType);
        console.log('✅ Cached image for CID: ' + cid.substring(0, 16) + '...');
        return result;
      })
      .catch(function () {
        console.warn('⚠️ All gateways failed for binary CID: ' + cid.substring(0, 16) + '...');
        return null;
      });
  });
}

/**
 * Resolve a tokenURI into structured metadata.
 * Handles: data URIs, IPFS URIs, HTTP URIs.
 */
function resolveTokenMetadata(tokenURI) {
  var fallback = { name: '', description: '', image: '', imageUrl: '', attributes: [] };
  if (!tokenURI) return Promise.resolve(fallback);

  // Case 1: base64 data URI
  if (tokenURI.startsWith('data:application/json;base64,')) {
    try {
      var b64 = tokenURI.split(',')[1];
      var metadata = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
      return Promise.resolve(buildResult(metadata));
    } catch (e) {
      return Promise.resolve(fallback);
    }
  }

  // Case 2: IPFS URI
  var cid = extractCid(tokenURI);
  if (cid) {
    return fetchJson(cid).then(function (data) {
      if (data) return buildResult(data);
      return fallback;
    });
  }

  // Case 3: HTTP URI
  if (tokenURI.startsWith('http://') || tokenURI.startsWith('https://')) {
    return axios.get(tokenURI, { timeout: 20000 })
      .then(function (res) {
        if (res.data && typeof res.data === 'object') return buildResult(res.data);
        return fallback;
      })
      .catch(function () {
        return fallback;
      });
  }

  return Promise.resolve(fallback);
}

function buildResult(metadata) {
  var rawImage = metadata.image || metadata.image_url || '';
  var imageCid = extractCid(rawImage);

  // Primary: serve through server proxy /api/ipfs/:cid
  // Fallback: if image gateways also fail, client can try direct gateway URL
  var imageUrl = imageCid ? '/api/ipfs/' + imageCid : rawImage;

  // Prefer dedicated gateway URL for direct fallback
  var directGatewayUrl = '';
  if (imageCid) {
    if (PINATA_GATEWAY) {
      directGatewayUrl = PINATA_GATEWAY + '/ipfs/' + imageCid;
      if (PINATA_GATEWAY_KEY) {
        directGatewayUrl += '?pinataGatewayToken=' + PINATA_GATEWAY_KEY;
      }
    } else {
      directGatewayUrl = GATEWAYS[0] + imageCid;
    }
  }

  return {
    name: metadata.name || '',
    description: metadata.description || '',
    image: rawImage,
    imageUrl: imageUrl,
    directGatewayUrl: directGatewayUrl,
    attributes: metadata.attributes || [],
  };
}

/* ══════════════════════════════════════════════════════════════════════
   STARTUP LOG
   ══════════════════════════════════════════════════════════════════════ */
if (PINATA_GATEWAY) {
  console.log('🔑 Pinata dedicated gateway configured: ' + PINATA_GATEWAY);
  if (PINATA_GATEWAY_KEY) {
    console.log('🔑 Pinata gateway key: configured');
  }
} else {
  console.log('ℹ️  No PINATA_GATEWAY_URL set — using public gateways only');
  console.log('   Tip: Set PINATA_GATEWAY_URL in .env for ISP-proof IPFS access');
}

/* ══════════════════════════════════════════════════════════════════════
   EXPORTS
   ─────────────────────────────────────────────────────────────────────
   setDiskJson & setDiskBinary are exported so uploadRoutes.js can
   write-through to the disk cache immediately on upload, guaranteeing
   newly minted NFTs are cached before any gallery fetch occurs.
   ══════════════════════════════════════════════════════════════════════ */
module.exports = {
  extractCid: extractCid,
  toGatewayUrl: toGatewayUrl,
  fetchJson: fetchJson,
  fetchBinary: fetchBinary,
  resolveTokenMetadata: resolveTokenMetadata,
  setDiskJson: setDiskJson,
  setDiskBinary: setDiskBinary,
  GATEWAYS: GATEWAYS,
};
