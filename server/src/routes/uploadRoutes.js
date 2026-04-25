/**
 * IPFS Upload Routes — Pinata Integration + Write-Through Cache
 * ==============================================================
 * Provides endpoints for uploading NFT images and metadata JSON
 * to IPFS via the Pinata pinning service. This keeps API keys
 * securely on the server and gives the frontend clean IPFS URIs
 * that MetaMask and other wallets can resolve natively.
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  FIX: Write-through disk cache on upload                   │
 * │  When Pinata returns a CID, we immediately write the data  │
 * │  to the local disk cache (.ipfs-cache/). This guarantees   │
 * │  that newly minted NFTs are instantly available to the      │
 * │  gallery without hitting IPFS gateways — which may be      │
 * │  blocked by the user's ISP.                                │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Endpoints:
 *   POST /api/upload/image    — Upload an image file to Pinata IPFS
 *   POST /api/upload/metadata — Upload ERC-721 metadata JSON to Pinata IPFS
 *   POST /api/upload/seed     — Manually seed the disk cache for a CID
 *   GET  /api/upload/test     — Test the Pinata API connection
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');

// ── Import cache writers from ipfs.js ───────────────────────────────
const { setDiskJson, setDiskBinary } = require('../utils/ipfs');

// ---------------------------------------------------------------------------
// Multer Configuration — in-memory file storage with validation
// ---------------------------------------------------------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          'Invalid file type. Only JPEG, PNG, GIF, WebP, and SVG are allowed.'
        )
      );
    }
  },
});

// ---------------------------------------------------------------------------
// Pinata Configuration
// ---------------------------------------------------------------------------
const PINATA_API_KEY = process.env.PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY;
const PINATA_BASE_URL = 'https://api.pinata.cloud';

/**
 * Checks whether Pinata API keys are configured in the environment.
 * @returns {boolean}
 */
function isPinataConfigured() {
  return (
    PINATA_API_KEY &&
    PINATA_SECRET_KEY &&
    PINATA_API_KEY !== 'your_pinata_api_key' &&
    PINATA_SECRET_KEY !== 'your_pinata_secret_key'
  );
}

// ---------------------------------------------------------------------------
// POST /api/upload/image — Upload image file to Pinata IPFS
// ---------------------------------------------------------------------------

/**
 * @route   POST /api/upload/image
 * @desc    Accepts an image file upload, pins it to IPFS via Pinata,
 *          caches the binary to disk immediately, and returns the
 *          IPFS hash, ipfs:// URI, and gateway URL.
 * @access  Public
 * @body    multipart/form-data with field "image"
 * @returns {{ success: boolean, data: { ipfsHash, ipfsUrl, gatewayUrl } }}
 */
router.post('/image', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, error: 'No image file provided.' });
    }

    if (!isPinataConfigured()) {
      return res.status(503).json({
        success: false,
        error:
          'IPFS storage (Pinata) is not configured. Please add PINATA_API_KEY and PINATA_SECRET_KEY to the server .env file.',
      });
    }

    // Build multipart form data for Pinata API
    const formData = new FormData();
    formData.append('file', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype,
    });

    const pinataMetadata = JSON.stringify({
      name: `NFT Image — ${req.file.originalname}`,
    });
    formData.append('pinataMetadata', pinataMetadata);

    // Pin file to IPFS via Pinata
    const response = await axios.post(
      `${PINATA_BASE_URL}/pinning/pinFileToIPFS`,
      formData,
      {
        maxBodyLength: Infinity,
        headers: {
          ...formData.getHeaders(),
          pinata_api_key: PINATA_API_KEY,
          pinata_secret_api_key: PINATA_SECRET_KEY,
        },
      }
    );

    const ipfsHash = response.data.IpfsHash;
    const ipfsUrl = `ipfs://${ipfsHash}`;
    const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;

    // ┌─────────────────────────────────────────────────────────┐
    // │  WRITE-THROUGH CACHE: Save image binary to disk cache  │
    // │  so /api/ipfs/:cid serves it instantly — no gateway.   │
    // └─────────────────────────────────────────────────────────┘
    setDiskBinary(ipfsHash, req.file.buffer, req.file.mimetype);
    console.log(`  📌 Image pinned to IPFS: ${ipfsHash}`);
    console.log(`  💾 Image cached to disk: ${ipfsHash}`);

    res.status(201).json({
      success: true,
      data: {
        ipfsHash,
        ipfsUrl,
        gatewayUrl,
      },
    });
  } catch (error) {
    if (error.message && error.message.includes('Invalid file type')) {
      return res.status(400).json({ success: false, error: error.message });
    }
    console.error(
      '❌ Pinata image upload error:',
      (error.response && error.response.data) || error.message
    );
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/upload/metadata — Upload ERC-721 metadata JSON to Pinata IPFS
// ---------------------------------------------------------------------------

/**
 * @route   POST /api/upload/metadata
 * @desc    Accepts ERC-721 compliant metadata (name, description, image),
 *          pins it as a JSON file to IPFS via Pinata, caches it to disk
 *          immediately, and returns the IPFS tokenURI.
 * @access  Public
 * @body    { name: string, description: string, image: string, attributes?: Array }
 * @returns {{ success: boolean, data: { ipfsHash, tokenURI, gatewayUrl, metadata } }}
 */
router.post('/metadata', async (req, res, next) => {
  try {
    const { name, description, image, attributes } = req.body;

    // Validate required fields
    if (!name || !name.trim()) {
      return res
        .status(400)
        .json({ success: false, error: 'NFT name is required.' });
    }
    if (!image || !image.trim()) {
      return res
        .status(400)
        .json({ success: false, error: 'Image URL or IPFS hash is required.' });
    }

    if (!isPinataConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'IPFS storage (Pinata) is not configured.',
      });
    }

    // Build ERC-721 compliant metadata object
    const metadata = {
      name: name.trim(),
      description: (description || '').trim(),
      image: image.trim(),
      attributes: attributes || [
        { trait_type: 'Collection', value: 'CN6035 NFT Collection' },
        { trait_type: 'Standard', value: 'ERC-721' },
        { trait_type: 'Created', value: new Date().toISOString() },
      ],
    };

    // Pin metadata JSON to IPFS via Pinata
    const response = await axios.post(
      `${PINATA_BASE_URL}/pinning/pinJSONToIPFS`,
      {
        pinataContent: metadata,
        pinataMetadata: { name: `${name.trim()} — Metadata` },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          pinata_api_key: PINATA_API_KEY,
          pinata_secret_api_key: PINATA_SECRET_KEY,
        },
      }
    );

    const ipfsHash = response.data.IpfsHash;
    const tokenURI = `ipfs://${ipfsHash}`;
    const gatewayUrl = `https://gateway.pinata.cloud/ipfs/${ipfsHash}`;

    // ┌──────────────────────────────────────────────────────────┐
    // │  WRITE-THROUGH CACHE: Save metadata JSON to disk cache  │
    // │  so fetchJson() finds it instantly — no gateway needed.  │
    // └──────────────────────────────────────────────────────────┘
    setDiskJson(ipfsHash, metadata);
    console.log(`  📌 Metadata pinned to IPFS: ${ipfsHash}`);
    console.log(`  💾 Metadata cached to disk: ${ipfsHash}`);

    res.status(201).json({
      success: true,
      data: {
        ipfsHash,
        tokenURI,
        gatewayUrl,
        metadata,
      },
    });
  } catch (error) {
    console.error(
      '❌ Metadata upload error:',
      (error.response && error.response.data) || error.message
    );
    next(error);
  }
});

// ---------------------------------------------------------------------------
// POST /api/upload/seed — Manually seed the disk cache for any CID
// ---------------------------------------------------------------------------

/**
 * @route   POST /api/upload/seed
 * @desc    Pushes metadata JSON directly into the server disk cache for a
 *          given CID. Use this to recover NFTs whose metadata was pinned
 *          to Pinata before the write-through cache fix was deployed.
 *          The gallery will serve this cached data instantly — no gateway needed.
 * @access  Public
 * @body    { cid: string, metadata: object }
 * @returns {{ success: boolean, message: string }}
 */
router.post('/seed', function (req, res) {
  try {
    var cid = req.body.cid;
    var metadata = req.body.metadata;

    if (!cid || typeof cid !== 'string') {
      return res
        .status(400)
        .json({ success: false, error: 'cid (string) is required.' });
    }
    if (!metadata || typeof metadata !== 'object') {
      return res
        .status(400)
        .json({ success: false, error: 'metadata (object) is required.' });
    }

    setDiskJson(cid, metadata);
    console.log('💾 Manually seeded cache for CID: ' + cid);

    res.json({
      success: true,
      message: 'Cache seeded for CID: ' + cid,
    });
  } catch (error) {
    console.error('❌ Cache seed error:', error.message);
    res
      .status(500)
      .json({ success: false, error: 'Failed to seed cache.' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/upload/test — Test Pinata API connection
// ---------------------------------------------------------------------------

/**
 * @route   GET /api/upload/test
 * @desc    Tests whether the Pinata API keys are valid and the service is reachable.
 * @access  Public
 * @returns {{ success: boolean, configured: boolean, message: string }}
 */
router.get('/test', async (_req, res) => {
  if (!isPinataConfigured()) {
    return res.json({
      success: false,
      configured: false,
      message:
        'Pinata API keys not configured. Add PINATA_API_KEY and PINATA_SECRET_KEY to server .env.',
    });
  }

  try {
    const response = await axios.get(
      `${PINATA_BASE_URL}/data/testAuthentication`,
      {
        headers: {
          pinata_api_key: PINATA_API_KEY,
          pinata_secret_api_key: PINATA_SECRET_KEY,
        },
      }
    );

    res.json({
      success: true,
      configured: true,
      message: response.data.message || 'Pinata connection successful.',
    });
  } catch (error) {
    res.json({
      success: false,
      configured: true,
      message: 'Pinata API keys are invalid or Pinata is unreachable.',
    });
  }
});

module.exports = router;
