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

const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
const apiKey = process.env.CLOUDINARY_API_KEY;
const apiSecret = process.env.CLOUDINARY_API_SECRET;

if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
  });
}

app.use(express.json({ limit: '20mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'image-storage' });
});

app.post('/api/images', async (req, res) => {
  try {
    if (!cloudName || !apiKey || !apiSecret) {
      res.status(500).json({ error: 'Cloudinary credentials are missing.' });
      return;
    }

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
    res.status(500).json({ error: 'Failed to save image.' });
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
