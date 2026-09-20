'use strict';

const { AppError } = require('./errors');

const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };

const badOutput = () =>
  new AppError(502, 'The AI returned an unexpected response. Please try again.', 'BAD_LLM_OUTPUT');

/** Coerces to a trimmed single-line string capped at `max` characters. */
function str(value, max = 600) {
  const s = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
  return s.replace(/\s+/g, ' ').trim().slice(0, max);
}

function list(value, max, mapper) {
  return Array.isArray(value) ? value.slice(0, max).map(mapper).filter(Boolean) : [];
}

const strList = (value, max, len) => list(value, max, (item) => str(item, len) || null);

function asObject(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw badOutput();
  return raw;
}

/** Shapes model output into exactly what the UI expects, whatever the model returned. */
function normalizeAnalysis(raw) {
  const r = asObject(raw);
  const flags = list(r.flags, 15, (f) => {
    if (!f || typeof f !== 'object') return null;
    const severity = str(f.severity, 10).toLowerCase();
    const flag = {
      severity: severity in SEVERITY_ORDER ? severity : 'medium',
      clause: str(f.clause, 300),
      whyItMatters: str(f.whyItMatters, 500),
      suggestion: str(f.suggestion, 400),
    };
    return flag.clause || flag.whyItMatters ? flag : null;
  }).sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const out = {
    documentType: str(r.documentType, 80) || 'Legal document',
    summary: str(r.summary, 1500),
    keyFacts: list(r.keyFacts, 12, (f) => {
      if (!f || typeof f !== 'object') return null;
      const label = str(f.label, 60);
      const value = str(f.value, 200);
      return label && value ? { label, value } : null;
    }),
    flags,
    inconsistencies: strList(r.inconsistencies, 8, 400),
    checklist: strList(r.checklist, 10, 250),
    lawyerQuestions: strList(r.lawyerQuestions, 10, 300),
  };
  if (!out.summary && out.flags.length === 0) throw badOutput();
  return out;
}

function normalizeComparison(raw) {
  const r = asObject(raw);
  const out = {
    overview: str(r.overview, 1500),
    differences: list(r.differences, 15, (d) => {
      if (!d || typeof d !== 'object') return null;
      const risk = str(d.higherRiskIn, 10);
      const row = {
        topic: str(d.topic, 100),
        documentA: str(d.documentA, 400) || 'Not mentioned',
        documentB: str(d.documentB, 400) || 'Not mentioned',
        higherRiskIn: ['A', 'B'].includes(risk.toUpperCase())
          ? risk.toUpperCase()
          : risk.toLowerCase() === 'similar'
            ? 'similar'
            : 'unclear',
        note: str(d.note, 300),
      };
      return row.topic ? row : null;
    }),
    onlyInA: strList(r.onlyInA, 8, 300),
    onlyInB: strList(r.onlyInB, 8, 300),
    checklist: strList(r.checklist, 8, 250),
    lawyerQuestions: strList(r.lawyerQuestions, 8, 300),
  };
  if (!out.overview && out.differences.length === 0) throw badOutput();
  return out;
}

function normalizeAnswer(raw) {
  const r = asObject(raw);
  const answer = str(r.answer, 1500);
  if (!answer) throw badOutput();
  return {
    answer,
    foundInDocument: r.foundInDocument === true,
    quote: str(r.quote, 300) || null,
  };
}

module.exports = { normalizeAnalysis, normalizeComparison, normalizeAnswer, str };
