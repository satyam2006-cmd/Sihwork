import Tesseract from 'tesseract.js';

/**
 * Runs OCR on an uploaded image file and returns extracted text.
 * Runs entirely in the browser via WebAssembly — no backend/server.js dependency.
 */
export async function extractTextFromImage(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  const result = await Tesseract.recognize(file, 'eng', {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });

  return result.data.text.trim();
}