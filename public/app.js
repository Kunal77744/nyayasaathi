/* NyayaSaathi front end. Plain JavaScript, no build step. All text from the server is rendered with
   textContent (never innerHTML), so document content or AI output can never inject markup. */
(() => {
  'use strict';

  const MIN_CHARS = 40;
  const MAX_CHARS = 40000;
  const MAX_FILE_BYTES = 5 * 1024 * 1024;

  const LABELS = {
    en: {
      analysis: 'Analysis',
      summary: 'Summary',
      keyFacts: 'Key facts',
      flags: 'Clauses to look at',
      high: 'High risk',
      medium: 'Medium risk',
      low: 'Low risk',
      ask: 'You could ask:',
      inconsistencies: 'Contradictions inside the document',
      none: 'No contradictions found.',
      checklist: 'Checklist before you agree',
      lawyerQuestions: 'Questions to ask a lawyer',
      copy: 'Copy questions',
      copied: 'Copied to clipboard.',
      copyFailed: 'Could not copy. Select the text and copy it manually.',
      comparison: 'Comparison',
      overview: 'Overview',
      differences: 'Main differences',
      caption: 'Differences between Document A and Document B',
      topic: 'Topic',
      docA: 'Document A',
      docB: 'Document B',
      higherRisk: 'Higher risk in',
      riskA: 'Document A',
      riskB: 'Document B',
      similar: 'About the same',
      unclear: 'Not clear',
      onlyA: 'Only in Document A',
      onlyB: 'Only in Document B',
      question: 'Question',
      quote: 'From the document',
      notFound: 'The document does not clearly answer this.',
    },
    hi: {
      analysis: 'विश्लेषण',
      summary: 'सारांश',
      keyFacts: 'मुख्य तथ्य',
      flags: 'ध्यान देने योग्य खंड',
      high: 'उच्च जोखिम',
      medium: 'मध्यम जोखिम',
      low: 'कम जोखिम',
      ask: 'आप पूछ सकते हैं:',
      inconsistencies: 'दस्तावेज़ में विरोधाभास',
      none: 'कोई विरोधाभास नहीं मिला।',
      checklist: 'सहमति देने से पहले जाँचने की सूची',
      lawyerQuestions: 'वकील से पूछने के सवाल',
      copy: 'सवाल कॉपी करें',
      copied: 'क्लिपबोर्ड पर कॉपी हो गया।',
      copyFailed: 'कॉपी नहीं हो सका। टेक्स्ट चुनकर हाथ से कॉपी करें।',
      comparison: 'तुलना',
      overview: 'सार',
      differences: 'मुख्य अंतर',
      caption: 'दस्तावेज़ A और दस्तावेज़ B के बीच अंतर',
      topic: 'विषय',
      docA: 'दस्तावेज़ A',
      docB: 'दस्तावेज़ B',
      higherRisk: 'ज़्यादा जोखिम',
      riskA: 'दस्तावेज़ A में',
      riskB: 'दस्तावेज़ B में',
      similar: 'लगभग बराबर',
      unclear: 'स्पष्ट नहीं',
      onlyA: 'सिर्फ़ दस्तावेज़ A में',
      onlyB: 'सिर्फ़ दस्तावेज़ B में',
      question: 'सवाल',
      quote: 'दस्तावेज़ से',
      notFound: 'दस्तावेज़ में इसका स्पष्ट उत्तर नहीं मिला।',
    },
  };
  const ICONS = { high: '▲', medium: '◆', low: '●' };

  const $ = (selector) => document.querySelector(selector);

  /** Small DOM builder. Text always goes through text nodes. */
  function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value === true ? '' : String(value));
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return node;
  }

  const currentLanguage = () => {
    const checked = document.querySelector('input[name="language"]:checked');
    return checked && checked.value === 'hi' ? 'hi' : 'en';
  };

  async function api(path, { json, formData } = {}) {
    const cacheKey = json ? `nyaya_cache_${path}_${JSON.stringify(json)}` : null;
    if (cacheKey && typeof sessionStorage !== 'undefined') {
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch (_) {
        /* storage disabled or full */
      }
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 75000);
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: json ? { 'Content-Type': 'application/json' } : undefined,
        body: json ? JSON.stringify(json) : formData,
        signal: controller.signal,
      });
      let data = null;
      try {
        data = await response.json();
      } catch (_) {
        /* not JSON */
      }
      if (!response.ok) {
        throw new Error((data && data.error) || `Something went wrong (error ${response.status}). Please try again.`);
      }
      if (cacheKey && data && typeof sessionStorage !== 'undefined') {
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(data));
        } catch (_) {
          /* ignore */
        }
      }
      return data;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('The request took too long. Please try again.');
      if (err instanceof TypeError)
        throw new Error('Could not reach the server. Check your internet connection and try again.');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  function showError(el, message, fieldEl = null) {
    el.textContent = message || '';
    el.hidden = !message;
    if (fieldEl) {
      fieldEl.setAttribute('aria-invalid', message ? 'true' : 'false');
    }
  }

  /** Disables a button, shows progress text, runs the task, and reports errors in the right place. */
  async function runTask({ button, statusEl, errorEl, busyText, task }) {
    showError(errorEl, '');
    statusEl.textContent = busyText;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    try {
      await task();
      statusEl.textContent = '';
    } catch (err) {
      statusEl.textContent = '';
      showError(errorEl, err.message);
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  }

  function updateCount(textarea, counter) {
    counter.textContent = `${textarea.value.length.toLocaleString('en-US')} / ${MAX_CHARS.toLocaleString('en-US')} characters`;
  }

  function bindCounter(textarea, counter) {
    textarea.addEventListener('input', () => updateCount(textarea, counter));
    updateCount(textarea, counter);
  }

  function bindFileInput({ input, textarea, counter, statusEl, errorEl }) {
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.value = '';
      if (!file) return;
      showError(errorEl, '');
      if (file.size > MAX_FILE_BYTES) {
        showError(errorEl, 'That file is larger than 5 MB. Please choose a smaller file or paste the text.');
        return;
      }
      statusEl.textContent = `Reading ${file.name}…`;
      try {
        const formData = new FormData();
        formData.append('file', file);
        const data = await api('/api/extract', { formData });
        textarea.value = data.text;
        updateCount(textarea, counter);
        statusEl.textContent = data.truncated
          ? `Loaded the first ${MAX_CHARS.toLocaleString('en-US')} characters of ${file.name}.`
          : `Loaded ${file.name}.`;
      } catch (err) {
        statusEl.textContent = '';
        showError(errorEl, err.message);
      }
    });
  }

  async function loadSample(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error('Could not load the sample. Please paste your own text.');
    return response.text();
  }

  /* ---------- rendering ---------- */

  function section(title, ...content) {
    return h('section', {}, h('h3', { text: title }), ...content);
  }

  function textList(items, className = 'plain-list', tag = 'ul') {
    return h(
      tag,
      { class: className },
      items.map((item) => h('li', { text: item }))
    );
  }

  function checkList(items) {
    return h(
      'ul',
      { class: 'check-list' },
      items.map((item) => h('li', {}, h('label', {}, h('input', { type: 'checkbox' }), h('span', { text: item }))))
    );
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const scratch = h('textarea', { 'aria-hidden': 'true', tabindex: '-1' });
      scratch.value = text;
      document.body.append(scratch);
      scratch.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (_) {
        ok = false;
      }
      scratch.remove();
      return ok;
    }
  }

  function lawyerSection(L, questions) {
    if (!questions.length) return null;
    const status = h('p', { class: 'status', role: 'status' });
    const button = h('button', { type: 'button', class: 'button button-secondary', text: L.copy });
    button.addEventListener('click', async () => {
      const ok = await copyToClipboard(questions.map((q, i) => `${i + 1}. ${q}`).join('\n'));
      status.textContent = ok ? L.copied : L.copyFailed;
    });
    return section(
      L.lawyerQuestions,
      textList(questions, 'plain-list', 'ol'),
      h('div', { class: 'copy-row' }, button, status)
    );
  }

  function badge(kind, label) {
    return h(
      'span',
      { class: `badge badge-${kind}` },
      h('span', { 'aria-hidden': 'true', text: ICONS[kind] || '●' }),
      label
    );
  }

  function renderAnalysis(data, language) {
    const L = LABELS[language];
    const root = h('div', { lang: language });
    root.append(h('p', { class: 'doc-type', text: data.documentType }), h('h2', { text: L.analysis }));
    if (data.summary) root.append(section(L.summary, h('p', { class: 'summary', text: data.summary })));
    if (data.keyFacts.length) {
      root.append(
        section(
          L.keyFacts,
          h(
            'dl',
            { class: 'facts' },
            data.keyFacts.map((f) =>
              h('div', { class: 'fact' }, h('dt', { text: f.label }), h('dd', { text: f.value }))
            )
          )
        )
      );
    }
    if (data.flags.length) {
      root.append(
        section(
          L.flags,
          h(
            'ul',
            { class: 'flag-list' },
            data.flags.map((f) =>
              h(
                'li',
                { class: `flag flag-${f.severity}` },
                badge(f.severity, L[f.severity]),
                f.clause && h('p', { class: 'clause', text: f.clause }),
                f.whyItMatters && h('p', { text: f.whyItMatters }),
                f.suggestion && h('p', { class: 'suggestion' }, h('strong', { text: `${L.ask} ` }), f.suggestion)
              )
            )
          )
        )
      );
    }
    root.append(
      section(
        L.inconsistencies,
        data.inconsistencies.length
          ? h('div', { class: 'callout' }, textList(data.inconsistencies))
          : h('p', { text: L.none })
      )
    );
    if (data.checklist.length) root.append(section(L.checklist, checkList(data.checklist)));
    const lawyer = lawyerSection(L, data.lawyerQuestions);
    if (lawyer) root.append(lawyer);
    root.append(h('p', { class: 'result-disclaimer', text: data.disclaimer }));
    return root;
  }

  function renderComparison(data, language) {
    const L = LABELS[language];
    const root = h('div', { lang: language });
    root.append(h('h2', { text: L.comparison }));
    if (data.overview) root.append(section(L.overview, h('p', { class: 'summary', text: data.overview })));
    if (data.differences.length) {
      const riskCell = (value) => {
        const map = {
          A: ['high', L.riskA],
          B: ['high', L.riskB],
          similar: ['low', L.similar],
          unclear: ['medium', L.unclear],
        };
        const [kind, label] = map[value] || map.unclear;
        return badge(kind, label);
      };
      const table = h(
        'table',
        { class: 'diff' },
        h('caption', { text: L.caption }),
        h(
          'thead',
          {},
          h(
            'tr',
            {},
            h('th', { scope: 'col', text: L.topic }),
            h('th', { scope: 'col', text: L.docA }),
            h('th', { scope: 'col', text: L.docB }),
            h('th', { scope: 'col', text: L.higherRisk })
          )
        ),
        h(
          'tbody',
          {},
          data.differences.map((d) =>
            h(
              'tr',
              {},
              h('th', { scope: 'row' }, d.topic, d.note && h('span', { class: 'note', text: d.note })),
              h('td', { text: d.documentA }),
              h('td', { text: d.documentB }),
              h('td', {}, riskCell(d.higherRiskIn))
            )
          )
        )
      );
      root.append(
        section(
          L.differences,
          h('div', { class: 'table-wrap', tabindex: '0', role: 'region', 'aria-label': L.caption }, table)
        )
      );
    }
    if (data.onlyInA.length) root.append(section(L.onlyA, textList(data.onlyInA)));
    if (data.onlyInB.length) root.append(section(L.onlyB, textList(data.onlyInB)));
    if (data.checklist.length) root.append(section(L.checklist, checkList(data.checklist)));
    const lawyer = lawyerSection(L, data.lawyerQuestions);
    if (lawyer) root.append(lawyer);
    root.append(h('p', { class: 'result-disclaimer', text: data.disclaimer }));
    return root;
  }

  function showResults(container, content) {
    container.replaceChildren(content);
    container.hidden = false;
    container.setAttribute('tabindex', '-1');
    container.focus({ preventScroll: true });
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------- tabs ---------- */

  function initTabs() {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const select = (tab, moveFocus) => {
      tabs.forEach((t) => {
        const active = t === tab;
        t.setAttribute('aria-selected', String(active));
        t.tabIndex = active ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !active;
      });
      if (moveFocus) tab.focus();
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(tab, false));
      tab.addEventListener('keydown', (event) => {
        let next = null;
        if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
        else if (event.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
        else if (event.key === 'Home') next = tabs[0];
        else if (event.key === 'End') next = tabs[tabs.length - 1];
        if (next) {
          event.preventDefault();
          select(next, true);
        }
      });
    });
  }

  /* ---------- understand & ask ---------- */

  function initAnalyze() {
    const textarea = $('#doc-text');
    const counter = $('#doc-count');
    const statusEl = $('#analyze-status');
    const errorEl = $('#analyze-error');
    const results = $('#analyze-results');
    const button = $('#analyze-btn');

    bindCounter(textarea, counter);
    bindFileInput({ input: $('#doc-file'), textarea, counter, statusEl, errorEl });

    $('#load-sample').addEventListener('click', async () => {
      showError(errorEl, '');
      try {
        textarea.value = await loadSample('/samples/rent-agreement.txt');
        updateCount(textarea, counter);
        statusEl.textContent = 'Sample rent agreement loaded. Choose "Analyse document".';
      } catch (err) {
        showError(errorEl, err.message);
      }
    });

    $('#clear-doc').addEventListener('click', () => {
      textarea.value = '';
      updateCount(textarea, counter);
      results.hidden = true;
      results.replaceChildren();
      $('#ask-answers').replaceChildren();
      showError(errorEl, '');
      statusEl.textContent = '';
      textarea.focus();
    });

    $('#analyze-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const text = textarea.value.trim();
      if (text.length < MIN_CHARS) {
        showError(errorEl, `Please paste or upload a document first (at least ${MIN_CHARS} characters).`);
        textarea.focus();
        return;
      }
      const language = currentLanguage();
      runTask({
        button,
        statusEl,
        errorEl,
        busyText: 'Reading your document. This usually takes 10 to 30 seconds…',
        task: async () => {
          const data = await api('/api/analyze', { json: { text, language } });
          showResults(results, renderAnalysis(data, language));
        },
      });
    });

    // Ask a question
    const askForm = $('#ask-form');
    const askInput = $('#ask-input');
    const askStatus = $('#ask-status');
    const askError = $('#ask-error');
    const answers = $('#ask-answers');
    const askButton = $('#ask-btn');

    askForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const question = askInput.value.trim();
      const text = textarea.value.trim();
      if (text.length < MIN_CHARS) {
        showError(askError, 'Add your document in the box above first, then ask your question.');
        return;
      }
      if (!question) {
        showError(askError, 'Please type a question.');
        askInput.focus();
        return;
      }
      const language = currentLanguage();
      const L = LABELS[language];
      runTask({
        button: askButton,
        statusEl: askStatus,
        errorEl: askError,
        busyText: 'Looking through the document…',
        task: async () => {
          const data = await api('/api/ask', { json: { text, question, language } });
          answers.prepend(
            h(
              'article',
              { class: 'answer', lang: language },
              h('p', { class: 'q', text: `${L.question}: ${question}` }),
              h('p', { text: data.answer }),
              data.foundInDocument === false && h('p', { class: 'hint', text: L.notFound }),
              data.quote && h('blockquote', {}, h('strong', { text: `${L.quote}: ` }), data.quote)
            )
          );
          askInput.value = '';
        },
      });
    });
  }

  /* ---------- compare ---------- */

  function initCompare() {
    const textA = $('#text-a');
    const textB = $('#text-b');
    const counterA = $('#text-a-count');
    const counterB = $('#text-b-count');
    const statusEl = $('#compare-status');
    const errorEl = $('#compare-error');
    const results = $('#compare-results');
    const button = $('#compare-btn');

    bindCounter(textA, counterA);
    bindCounter(textB, counterB);
    bindFileInput({ input: $('#file-a'), textarea: textA, counter: counterA, statusEl, errorEl });
    bindFileInput({ input: $('#file-b'), textarea: textB, counter: counterB, statusEl, errorEl });

    $('#load-compare-sample').addEventListener('click', async () => {
      showError(errorEl, '');
      try {
        [textA.value, textB.value] = await Promise.all([
          loadSample('/samples/rent-agreement.txt'),
          loadSample('/samples/rent-agreement-v2.txt'),
        ]);
        updateCount(textA, counterA);
        updateCount(textB, counterB);
        statusEl.textContent = 'Two sample drafts loaded. Choose "Compare documents".';
      } catch (err) {
        showError(errorEl, err.message);
      }
    });

    $('#clear-compare').addEventListener('click', () => {
      textA.value = '';
      textB.value = '';
      updateCount(textA, counterA);
      updateCount(textB, counterB);
      results.hidden = true;
      results.replaceChildren();
      showError(errorEl, '');
      statusEl.textContent = '';
      textA.focus();
    });

    $('#compare-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const a = textA.value.trim();
      const b = textB.value.trim();
      if (a.length < MIN_CHARS || b.length < MIN_CHARS) {
        showError(errorEl, `Please add both documents (at least ${MIN_CHARS} characters each).`);
        (a.length < MIN_CHARS ? textA : textB).focus();
        return;
      }
      const language = currentLanguage();
      runTask({
        button,
        statusEl,
        errorEl,
        busyText: 'Comparing the two documents. This usually takes 15 to 40 seconds…',
        task: async () => {
          const data = await api('/api/compare', { json: { textA: a, textB: b, language } });
          showResults(results, renderComparison(data, language));
        },
      });
    });
  }

  initTabs();
  initAnalyze();
  initCompare();
})();
