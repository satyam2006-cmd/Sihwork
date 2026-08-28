# MedPulse AI

MedPulse AI is a medical intake prototype for SIH-style clinical workflows. It helps a patient complete a guided voice or text check-in, digitizes uploaded medical records, builds a timeline, and routes a structured summary to a doctor dashboard.

## Features

- Patient login or sign-up with sample ABHA and email credentials.
- Doctor portal with sample physician credentials.
- Multilingual patient flow for Gujarati, Marathi, Hindi, English, and a custom "Other" language option.
- Speech input, replayable voice output, Google TTS fallback, and manual typing.
- Simulated interview mode for demos and browser-backed ChatGPT automation mode.
- Medical record upload for images and PDFs.
- Printed OCR with Tesseract.js and local handwritten/vision analysis through Ollama when available.
- Triage classification with red flag detection.
- Doctor-facing clinical summary and patient queue.
- Local persistence through SQLite with JSON fallback.

## Tech Stack

- React 19
- TypeScript
- Vite
- Express
- Tesseract.js
- Puppeteer Extra with stealth plugin
- Optional local Ollama models for OCR and summary generation

## Project Structure

```text
src/
  components/      Patient flow, OCR scan, summary routing, dashboard, settings
  types/           Medical workflow types
  utils/           AI, OCR, and language helpers
data/              Local patient database and JSON fallback data
scratch/           Browser automation experiments and debugging scripts
server.js          Express API, persistence, translation/TTS proxy, browser automation
```

## Prerequisites

- Node.js 20 or newer
- npm
- Python available as `python` for the server's SQLite helper scripts
- A Chromium-compatible browser environment for Puppeteer automation
- Optional: Ollama running locally at `http://localhost:11434`

Optional Ollama models used by the app:

```bash
ollama pull qwen3:0.6b
ollama pull glm-ocr:latest
ollama pull medgemma:latest
```

The app has deterministic fallbacks when local AI models are unavailable, so the prototype can still be explored without Ollama.

## Getting Started

Install dependencies:

```bash
npm install
```

Start the backend API in one terminal:

```bash
npm run server
```

Start the Vite frontend in another terminal:

```bash
npm run dev
```

Open the URL printed by Vite, usually:

```text
http://localhost:5173
```

The frontend expects the backend at:

```text
http://localhost:3001
```

## Demo Credentials

Patient sample:

```text
ABHA ID: 91-8843-1250-9982
Email: mohak@medpulse.local
Password: patient123
```

Doctor sample:

```text
Email: doctor@medpulse.local
Password: doctor123
```

## AI Modes

The settings modal controls the interview backend:

- `simulated`: runs the built-in deterministic triage flow for quick demos.
- `browser`: uses the Express server to drive a local browser session on ChatGPT, then falls back when unavailable.

Summary generation prefers the local MedGemma/Ollama path when available and uses a deterministic fallback if the local service cannot be reached.

## Scripts

```bash
npm run dev      # start the Vite frontend
npm run server   # start the Express backend on port 3001
npm run build    # type-check and build the frontend
npm run preview  # preview the production build
```

## Notes

- This is a prototype and is not a certified medical device.
- Do not use the output as a substitute for clinical judgment.
- The local database file is stored under `data/medpulse.sqlite`.
- Browser automation mode may require a visible Chromium window and may be affected by external website changes.
