<div align="center">

# Magic Hand Portal - Nguyen Xuan Hai

**Realtime Hand Tracking | MediaPipe | Canvas Effects | React + Vite**

An interactive camera web app that transforms hand gestures into a cinematic portal experience and auto-captures artistic composite photos.

[![Live Demo](https://img.shields.io/badge/Live_Demo-cam.hailamdev.space-00E5FF?style=for-the-badge&logoColor=black)](https://cam.hailamdev.space)
[![Author](https://img.shields.io/badge/Author-Nguyen_Xuan_Hai-111827?style=for-the-badge&logoColor=white)](https://cam.hailamdev.space)

![React](https://img.shields.io/badge/React_19-61DAFB?style=flat-square&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite_6-646CFF?style=flat-square&logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind_4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![MediaPipe](https://img.shields.io/badge/MediaPipe_Hands-FF6F00?style=flat-square&logo=google&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000?style=flat-square&logo=vercel&logoColor=white)

</div>

---

## Portal Engine

The core experience is a realtime hand-gesture pipeline powered by MediaPipe + Canvas:

- Detects two hands and builds a portal frame from finger landmarks
- Applies live visual effects: X-Ray, Scanlines, Glitch, Chromatic
- Adds geometric warp distortion based on hand angle
- Performs 3-second stability hold and auto-capture
- Runs a 2-step compositing flow for final creative output

---

## Route Layout

The app is now split into independent capture experiences:

- `/` - Xray Portal (original 2-step Xray workflow)
- `/photoboth` - PhotoBooth mode (3 continuous shots)

---

## Highlights

- Independent route-per-mode architecture (Xray / PhotoBooth)
- Realtime hand tracking via webcam
- Dynamic portal rendering with warped polygon clipping in Xray mode
- PhotoBooth sequence capture with 3 continuous frames
- Download-ready PNG outputs and snapshots
- Accessibility upgrades: live status announcements, keyboard-focus states, reduced-motion support
- Camera error handling with retry flows

---

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React 19, TypeScript, Vite 6 |
| Styling | Tailwind CSS 4 |
| CV/AI | @mediapipe/hands, @mediapipe/camera_utils |
| Graphics | HTML Canvas API |
| Icons | lucide-react |
| Motion Utilities | motion |
| Hosting | Vercel (target domain: cam.hailamdev.space) |

---

## Getting Started

```bash
git clone <your-public-repo-url>
cd x-ray-portal-hand-gesture
npm install
npm run dev
# Open http://localhost:3000
```

Build for production:

```bash
npm run build
npm run preview
```

---

## Project Structure

```text
.
├── index.html
├── package.json
├── vite.config.ts
├── src/
│   ├── App.tsx         # Realtime hand tracking + portal pipeline
│   ├── main.tsx        # React bootstrap
│   ├── pages/
│   │   └── PhotoBoothPage.tsx
│   └── index.css       # Tailwind + global motion accessibility rules
└── README.md
```

---

<div align="center">

### Author

Made with care by **Nguyen Xuan Hai**

Deploy target: **cam.hailamdev.space**

</div>
