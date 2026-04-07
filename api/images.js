import { v2 as cloudinary } from 'cloudinary';

const configureCloudinary = () => {
  if (process.env.CLOUDINARY_URL) {
    cloudinary.config(process.env.CLOUDINARY_URL);
    return;
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  try {
    configureCloudinary();
    const cfg = cloudinary.config();
    const missingKeys = [];
    if (!cfg.cloud_name) missingKeys.push('CLOUDINARY_CLOUD_NAME');
    if (!cfg.api_key) missingKeys.push('CLOUDINARY_API_KEY');
    if (!cfg.api_secret) missingKeys.push('CLOUDINARY_API_SECRET');

    if (missingKeys.length > 0) {
      res.status(500).json({ error: `Cloudinary credentials are missing: ${missingKeys.join(', ')}` });
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
    const message = error instanceof Error ? error.message : 'Failed to upload image.';
    res.status(statusCode >= 400 ? statusCode : 500).json({ error: message });
  }
}
