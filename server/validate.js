'use strict';

const { AppError } = require('./errors');
const config = require('./config');

const LANGUAGES = ['en', 'hi'];

/**
 * Normalises line endings, strips control characters, zero-width spaces,
 * bidirectional override markers, and collapses blank-line runs.
 *
 * @param {unknown} input - Raw input to be cleaned.
 * @returns {string} Sanitized string.
 */
function cleanText(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Validates document text input against minimum and maximum length bounds.
 *
 * @param {unknown} input - Input text.
 * @param {string} [label='Document'] - Label for error messages.
 * @param {object} [limits=config.limits] - Validation limits.
 * @returns {string} Validated and cleaned text.
 */
function validateDocument(input, label = 'Document', limits = config.limits) {
  if (typeof input !== 'string') {
    throw new AppError(400, `${label} text is required.`, 'INVALID_INPUT');
  }
  const text = cleanText(input);
  if (text.length < limits.minDocChars) {
    throw new AppError(
      400,
      `${label} is too short. Please paste at least ${limits.minDocChars} characters.`,
      'INVALID_INPUT'
    );
  }
  if (text.length > limits.maxDocChars) {
    throw new AppError(
      413,
      `${label} is too long (limit ${limits.maxDocChars.toLocaleString('en-US')} characters). Please paste the relevant part.`,
      'TOO_LONG'
    );
  }
  return text;
}

/**
 * Validates target language code ('en' or 'hi').
 *
 * @param {unknown} input - Language code input.
 * @returns {string} Validated language code.
 */
function validateLanguage(input) {
  if (input === undefined || input === null || input === '') return 'en';
  if (LANGUAGES.includes(input)) return input;
  throw new AppError(400, 'Language must be "en" or "hi".', 'INVALID_INPUT');
}

/**
 * Validates user question text input.
 *
 * @param {unknown} input - Question input string.
 * @param {object} [limits=config.limits] - Validation limits.
 * @returns {string} Validated and cleaned question string.
 */
function validateQuestion(input, limits = config.limits) {
  const question = cleanText(typeof input === 'string' ? input : '');
  if (!question) throw new AppError(400, 'Please type a question.', 'INVALID_INPUT');
  if (question.length > limits.maxQuestionChars) {
    throw new AppError(400, `Question is too long (limit ${limits.maxQuestionChars} characters).`, 'INVALID_INPUT');
  }
  return question;
}

module.exports = { cleanText, validateDocument, validateLanguage, validateQuestion, LANGUAGES };
