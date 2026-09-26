'use strict';

const { AppError } = require('./errors');
const { cleanText } = require('./validate');

const MAX_PDF_PAGES = 40;

let PDFParseClass = null;
function getPDFParseClass() {
  if (!PDFParseClass) {
    if (typeof globalThis.DOMMatrix === 'undefined') {
      globalThis.DOMMatrix = class DOMMatrix {
        constructor() {
          this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
        }
      };
    }
    const pdfModule = require('pdf-parse');
    PDFParseClass = pdfModule.PDFParse || pdfModule;
  }
  return PDFParseClass;
}

/**
 * Reads and extracts clean text from an uploaded PDF or TXT file buffer.
 * Performs file type content validation and rejects invalid/suspicious files.
 *
 * @param {object} file - Express/Multer file object.
 * @returns {Promise<string>} Extracted text string.
 */
async function extractText(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new AppError(400, 'No file received. Choose a PDF or TXT file.', 'INVALID_INPUT');
  }
  const { buffer } = file;
  const name = String(file.originalname || '').toLowerCase();

  // PDF Magic Bytes check: %PDF-
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
    let parsed;
    let parser;
    try {
      const PDFParse = getPDFParseClass();
      parser = new PDFParse({ data: new Uint8Array(buffer) });
      parsed = await parser.getText({ first: MAX_PDF_PAGES });
    } catch (_) {
      throw new AppError(
        422,
        'Could not read this PDF. It may be damaged or password-protected. Try pasting the text instead.',
        'PDF_UNREADABLE'
      );
    } finally {
      if (parser) await parser.destroy().catch(() => {});
    }
    const text = cleanText((parsed.text || '').replace(/^-- \d+ of \d+ --$/gm, ''));
    if (!text) {
      throw new AppError(
        422,
        'This PDF has no selectable text (it may be a scan). Please paste the text instead.',
        'PDF_NO_TEXT'
      );
    }
    return text;
  }

  // Reject executable or shell script headers disguised as text
  const header = buffer.subarray(0, 4).toString('latin1');
  if (header.startsWith('MZ') || header.startsWith('\x7FELF') || header.startsWith('#!') || header.includes('<?')) {
    throw new AppError(415, 'Invalid or unsupported file format.', 'UNSUPPORTED_FILE');
  }

  if (/\.(txt|md)$/.test(name) && !buffer.includes(0)) {
    const text = cleanText(buffer.toString('utf8'));
    if (!text) throw new AppError(422, 'The file is empty.', 'EMPTY_FILE');
    return text;
  }

  throw new AppError(415, 'Only PDF and TXT files are supported.', 'UNSUPPORTED_FILE');
}

module.exports = { extractText };
