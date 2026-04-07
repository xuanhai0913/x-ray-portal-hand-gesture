import { v2 as cloudinary } from 'cloudinary';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

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
    res.status(500).json({ error: 'Failed to upload image.' });
  }
}
