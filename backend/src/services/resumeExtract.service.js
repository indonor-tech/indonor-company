import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { AppError } from '../utils/errors.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');

function usable(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length >= 40) return true;
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(clean) && clean.length >= 12;
}

function kindOf(file) {
  const name = String(file.originalname || '').toLowerCase();
  const type = String(file.mimetype || '').toLowerCase();
  const bytes = file.buffer || Buffer.alloc(0);
  const ascii = bytes.subarray(0, 8).toString('latin1');
  if (ascii.startsWith('%PDF') || type.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (ascii.startsWith('PK') && (name.endsWith('.docx') || type.includes('wordprocessingml'))) return 'docx';
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && (name.endsWith('.doc') || type.includes('msword'))) return 'doc';
  if (name.endsWith('.docx') || type.includes('wordprocessingml')) return 'docx';
  if (name.endsWith('.doc') || type === 'application/msword') return 'doc';
  if (ascii.startsWith('{\\rtf') || name.endsWith('.rtf') || type.includes('rtf')) return 'rtf';
  if ((bytes[0] === 0x89 && bytes[1] === 0x50) || type === 'image/png' || name.endsWith('.png')) return 'image';
  if ((bytes[0] === 0xff && bytes[1] === 0xd8) || type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|tif{1,2})$/.test(name)) return 'image';
  if (type.startsWith('text/') || name.endsWith('.txt')) return 'text';
  if (ascii.startsWith('%PDF')) return 'pdf';
  return 'unknown';
}

async function fromPdfParse(buffer) {
  try {
    const result = await pdfParse(buffer);
    return result.text || '';
  } catch {
    return '';
  }
}

async function fromPdfJs(buffer) {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
    const document = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      disableFontFace: true,
      isEvalSupported: false,
      useSystemFonts: true,
      verbosity: 0
    }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => ('str' in item ? item.str : '')).join(' '));
    }
    return pages.join('\n');
  } catch {
    return '';
  }
}

function jpegSlices(buffer) {
  const bytes = Buffer.from(buffer);
  const images = [];
  let index = 0;
  while (index < bytes.length - 1) {
    if (bytes[index] !== 0xff || bytes[index + 1] !== 0xd8) {
      index += 1;
      continue;
    }
    let end = index + 2;
    while (end < bytes.length - 1 && !(bytes[end] === 0xff && bytes[end + 1] === 0xd9)) end += 1;
    if (end >= bytes.length - 1) break;
    const slice = bytes.subarray(index, end + 2);
    if (slice.length > 20 * 1024) images.push(slice);
    index = end + 2;
    if (images.length >= 8) break;
  }
  return images;
}

async function fromOcr(buffers) {
  if (!buffers.length) return '';
  try {
    const tesseract = await import('tesseract.js');
    const pieces = [];
    for (const image of buffers.slice(0, 6)) {
      const result = await tesseract.recognize(image, 'eng', { logger: () => {} });
      pieces.push(result?.data?.text || '');
    }
    return pieces.join('\n');
  } catch {
    return '';
  }
}

function fromRtf(buffer) {
  return buffer.toString('utf8')
    .replace(/\\'[0-9a-f]{2}/gi, ' ')
    .replace(/\\[a-z]+\-?\d* ?/gi, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fromDoc(buffer) {
  try {
    const extracted = await new WordExtractor().extract(buffer);
    return [extracted.getBody(), extracted.getFooters(), extracted.getHeaders()].filter(Boolean).join('\n');
  } catch {
    return '';
  }
}

export async function extractResumeText(file) {
  if (!file?.buffer?.length) throw new AppError('A resume file is required.', 422);
  const kind = kindOf(file);
  let text = '';

  if (kind === 'pdf') {
    text = await fromPdfParse(file.buffer);
    if (!usable(text)) text = await fromPdfJs(file.buffer);
    if (!usable(text)) text = await fromOcr(jpegSlices(file.buffer));
  } else if (kind === 'docx') {
    try {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      text = result.value || '';
    } catch {
      text = '';
    }
  } else if (kind === 'doc') {
    text = await fromDoc(file.buffer);
  } else if (kind === 'rtf') {
    text = fromRtf(file.buffer);
  } else if (kind === 'image') {
    text = await fromOcr([file.buffer]);
  } else if (kind === 'text') {
    text = file.buffer.toString('utf8');
  } else {
    text = await fromPdfParse(file.buffer);
    if (!usable(text)) text = await fromPdfJs(file.buffer);
    if (!usable(text)) {
      try {
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        text = result.value || '';
      } catch {
        text = await fromDoc(file.buffer);
      }
    }
    if (!usable(text)) text = await fromOcr([file.buffer, ...jpegSlices(file.buffer)].filter(Boolean));
  }

  if (!usable(text)) {
    throw new AppError('Could not read that resume. Try PDF, Word, or a clear image of the CV, or enter the details manually.', 422);
  }
  return text;
}
