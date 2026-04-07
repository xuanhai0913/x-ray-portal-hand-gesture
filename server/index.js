import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const serverPort = Number(process.env.SERVER_PORT || 3001);
const distDir = path.resolve(__dirname, '../dist');

const getCloudinaryCredentials = () => {
  return {
    cloudinaryUrl: process.env.CLOUDINARY_URL?.trim(),
    cloudName: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
    apiKey: process.env.CLOUDINARY_API_KEY?.trim(),
    apiSecret: process.env.CLOUDINARY_API_SECRET?.trim(),
  };
};

const configureCloudinary = (credentials) => {
  if (credentials.cloudinaryUrl) {
    cloudinary.config(credentials.cloudinaryUrl);
    return;
  }

  cloudinary.config({
    cloud_name: credentials.cloudName,
    api_key: credentials.apiKey,
    api_secret: credentials.apiSecret,
  });
};

app.use(express.json({ limit: '20mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'image-storage' });
});

app.post('/api/images', async (req, res) => {
  try {
    const credentials = getCloudinaryCredentials();
    const missingKeys = credentials.cloudinaryUrl
      ? []
      : [
          !credentials.cloudName ? 'CLOUDINARY_CLOUD_NAME' : null,
          !credentials.apiKey ? 'CLOUDINARY_API_KEY' : null,
          !credentials.apiSecret ? 'CLOUDINARY_API_SECRET' : null,
        ].filter(Boolean);

    if (missingKeys.length > 0) {
      res.status(500).json({
        error: `Cloudinary credentials are missing: ${missingKeys.join(', ')}. Restart server after updating env variables.`,
      });
      return;
    }

    configureCloudinary(credentials);

    const imageDataUrl = req.body?.imageDataUrl;

    if (typeof imageDataUrl !== 'string') {
      res.status(400).json({ error: 'imageDataUrl is required.' });
      return;
    }

    const match = imageDataUrl.match(/^data:image\/(png|jpe?g|webp);base64,(.+)$/i);
    if (!match) {
      res.status(400).json({ error: 'Unsupported image format.' });
      return;
    }

    if (imageDataUrl.length > 18_000_000) {
      res.status(413).json({ error: 'Image payload too large. Please retry.' });
      return;
    }

    const uploadResult = await cloudinary.uploader.upload(imageDataUrl, {
      folder: process.env.CLOUDINARY_FOLDER || 'x-ray-portal',
      resource_type: 'image',
      overwrite: false,
    });

    res.status(201).json({
      id: uploadResult.public_id,
      imageUrl: uploadResult.secure_url,
      shareUrl: uploadResult.secure_url,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);
    const statusCode =
      typeof error === 'object' && error !== null && 'http_code' in error && Number.isInteger(error.http_code)
        ? Number(error.http_code)
        : 500;
    const message = error instanceof Error ? error.message : 'Failed to save image.';
    res.status(statusCode >= 400 ? statusCode : 500).json({ error: message });
  }
});

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

app.listen(serverPort, () => {
  console.log(`Image server listening at http://localhost:${serverPort}`);
});
