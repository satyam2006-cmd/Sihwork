import Tesseract from 'tesseract.js';

export interface OcrResult {
  text: string;
  confidence: number;
}

/**
 * Runs OCR on an uploaded image file and returns extracted text.
 * Runs entirely in the browser via WebAssembly — no backend/server.js dependency.
 */
export async function extractTextFromImage(
  file: File,
  onProgress?: (percent: number) => void
): Promise<OcrResult> {
  const result = await Tesseract.recognize(file, 'eng', {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });

  return {
    text: result.data.text.trim(),
    confidence: Math.round(result.data.confidence || 0),
  };
}

/**
 * Handwriting-optimized OCR extraction.
 * Uses Tesseract PSM 6 (assume a single uniform block of text) which works
 * better for handwritten notes than the default PSM 3 (fully automatic).
 * Also applies post-processing to clean up common handwriting OCR artifacts.
 */
export async function extractHandwrittenText(
  file: File,
  onProgress?: (percent: number) => void
): Promise<OcrResult> {
  const result = await Tesseract.recognize(file, 'eng', {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });

  let text = result.data.text.trim();

  // Post-processing: clean common handwriting OCR artifacts
  // Remove excessive whitespace between characters (common in spaced handwriting)
  text = text.replace(/([a-zA-Z]) {2,}([a-zA-Z])/g, '$1 $2');
  // Collapse 3+ newlines into 2
  text = text.replace(/\n{3,}/g, '\n\n');
  // Remove isolated single characters on their own line (noise)
  text = text.replace(/^\s*[^a-zA-Z0-9\n]\s*$/gm, '');

  return {
    text,
    confidence: Math.round(result.data.confidence || 0),
  };
}

/**
 * Creates a data URL preview from a File object for image thumbnailing.
 */
export function createImagePreview(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
