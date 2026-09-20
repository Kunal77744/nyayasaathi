'use strict';

const { AppError } = require('./errors');
const { cleanText } = require('./validate');

const MAX_PDF_PAGES = 40;

/** Reads text from an uploaded PDF or TXT. File type is decided by content, not by the browser-supplied name. */
async function extractText(file) {
  if (!file || !Buffer.isBuffer(file.buffer)) {
    throw new AppError(400, 'No file received. Choose a PDF or TXT file.', 'INVALID_INPUT');
  }
  const { buffer } = file;
  const name = String(file.originalname || '').toLowerCase();

  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') {
    let parsed;
    let parser;
    try {
      const { PDFParse } = require('pdf-parse');
      parser = new PDFParse({ data: new Uint8Array(buffer) });
      parsed = await parser.getText({ first: MAX_PDF_PAGES });
    } catch (_) {
      throw new AppError(422, 'Could not read this PDF. It may be damaged or password-protected. Try pasting the text instead.', 'PDF_UNREADABLE');
    } finally {
      if (parser) await parser.destroy().catch(() => {});
    }
    const text = cleanText((parsed.text || '').replace(/^-- \d+ of \d+ --$/gm, ''));
    if (!text) {
      throw new AppError(422, 'This PDF has no selectable text (it may be a scan). Please paste the text instead.', 'PDF_NO_TEXT');
    }
    return text;
  }

  if (/\.(txt|md)$/.test(name) && !buffer.includes(0)) {
    const text = cleanText(buffer.toString('utf8'));
    if (!text) throw new AppError(422, 'The file is empty.', 'EMPTY_FILE');
    return text;
  }

  throw new AppError(415, 'Only PDF and TXT files are supported.', 'UNSUPPORTED_FILE');
}

module.exports = { extractText };
