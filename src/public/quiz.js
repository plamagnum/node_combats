/* Тести зі шкільних знань: правильні відповіді приносять золото */
const quiz = { groups: [], filter: {}, question: null, result: null, meta: null };

const groupLabel = (g) =>
  `${g.subjectName || `Предмет ${g.subjectId}`} • ${g.className || `${g.classId} клас`} • ${g.topicName || `Тема ${g.topicId}`}`;

async function loadQuiz() {
  try {
    quiz.meta = await api('/api/quiz/meta');
    renderQuiz();
  } catch (err) {
    showToast(err.message, true);
  }
}

async function nextQuestion() {
  const params = new URLSearchParams();
  const f = quiz.filter;
  if (f.subjectId !== undefined) params.set('subject_id', f.subjectId);
  if (f.classId !== undefined) params.set('class_id', f.classId);
  if (f.topicId !== undefined) params.set('topic_id', f.topicId);
  try {
    quiz.result = null;
    quiz.question = (await api(`/api/quiz/next?${params}`)).question;
    if (!quiz.question) showToast('Нових запитань у цій добірці немає', true);
    quiz.meta = await api('/api/quiz/meta');
  } catch (err) {
    showToast(err.message, true);
  }
  renderQuiz();
}

function renderQuiz() {
  const root = $('quiz-root');
  const m = quiz.meta;
  if (!m) return;
  const options = m.groups
    .map(
      (g, i) =>
        `<option value="${i}" ${quiz.filter.idx === i ? 'selected' : ''}>${escapeHtml(groupLabel(g))} (${g.remaining}/${g.total})</option>`,
    )
    .join('');
  const head = `<div class="panel"><div class="panel-header"><h2>Тести зі шкільних знань</h2>
    <span class="muted">+${m.reward} зол. за правильну відповідь • сьогодні ${m.earnedToday}/${m.dailyCap}</span></div>
    ${
      m.groups.length
        ? `<div class="group-actions"><select id="quiz-group"><option value="">Усі теми</option>${options}</select>
           <button id="quiz-start" class="btn btn-primary" type="button">Наступне запитання</button></div>`
        : '<p class="muted">Запитань ще немає. Адміністратор може додати їх у розділі «Тести».</p>'
    }</div>`;
  root.innerHTML = head + (quiz.question ? renderQuestion() : '');
  $('quiz-start')?.addEventListener('click', () => {
    const v = $('quiz-group').value;
    const g = v === '' ? null : m.groups[Number(v)];
    quiz.filter = g
      ? { idx: Number(v), subjectId: g.subjectId, classId: g.classId, topicId: g.topicId }
      : {};
    nextQuestion();
  });
  $('quiz-submit')?.addEventListener('click', submitAnswer);
  $('quiz-next')?.addEventListener('click', nextQuestion);
}

function renderQuestion() {
  const q = quiz.question;
  const r = quiz.result;
  const type = q.multi ? 'checkbox' : 'radio';
  const answers = q.answers
    .map((a) => {
      const mark = r ? (r.correctIds.includes(a.id) ? ' ✅' : '') : '';
      return `<label class="quiz-answer"><input type="${type}" name="quizAnswer" value="${a.id}" ${r ? 'disabled' : ''} /> ${escapeHtml(a.text)}${mark}</label>`;
    })
    .join('');
  const footer = r
    ? `<p><strong>${r.correct ? `Правильно! +${r.gold} золота` : 'Неправильно'}</strong></p>
       <button id="quiz-next" class="btn btn-primary" type="button">Далі</button>`
    : `<button id="quiz-submit" class="btn btn-primary" type="button">Відповісти</button>`;
  return `<div class="panel"><h3>${escapeHtml(q.text)}</h3>
    <p class="muted">${q.multi ? 'Можна обрати кілька варіантів' : 'Оберіть один варіант'}</p>
    <div class="quiz-answers">${answers}</div>${footer}</div>`;
}

async function submitAnswer() {
  const ids = [...document.querySelectorAll('input[name="quizAnswer"]:checked')].map(
    (el) => el.value,
  );
  if (!ids.length) return showToast('Оберіть відповідь', true);
  try {
    quiz.result = await api('/api/quiz/answer', {
      method: 'POST',
      body: JSON.stringify({ questionId: quiz.question.id, answerIds: ids }),
    });
    state.user = quiz.result.user;
    renderCharacter();
    quiz.meta = await api('/api/quiz/meta');
  } catch (err) {
    showToast(err.message, true);
  }
  renderQuiz();
}

tabHooks.quiz = { enter: loadQuiz };

// ==================== Адмін: імпорт запитань ====================

async function loadAdminQuiz() {
  try {
    const { groups } = await api('/api/admin/quiz/stats');
    const tbody = $('admin-quiz-tbody');
    tbody.innerHTML = groups.length
      ? groups
          .map(
            (
              g,
              i,
            ) => `<tr><td>${escapeHtml(g.subjectName || g.subjectId)}</td><td>${g.classId}</td><td>${escapeHtml(g.topicName || g.topicId)}</td>
        <td>${g.total}</td><td><button class="btn btn-xs btn-danger" data-quiz-del="${i}" type="button">Видалити</button></td></tr>`,
          )
          .join('')
      : '<tr><td colspan="5" class="muted">Запитань немає</td></tr>';
    tbody.querySelectorAll('[data-quiz-del]').forEach((el) =>
      el.addEventListener('click', async () => {
        const g = groups[Number(el.dataset.quizDel)];
        if (!confirm(`Видалити ${g.total} запитань цієї теми?`)) return;
        try {
          await api(
            `/api/admin/quiz?subject_id=${g.subjectId}&class_id=${g.classId}&topic_id=${g.topicId}`,
            { method: 'DELETE' },
          );
          loadAdminQuiz();
        } catch (err) {
          showToast(err.message, true);
        }
      }),
    );
  } catch (err) {
    showToast(err.message, true);
  }
}

function showImportResult(r) {
  const errs = (r.errors || []).map((e) => `<div>⚠ ${escapeHtml(e)}</div>`).join('');
  $('quiz-import-result').innerHTML =
    `<p>Додано: <strong>${r.added || 0}</strong>, оновлено: ${r.updated || 0}, пропущено: ${r.skipped || 0}</p>${errs}`;
}

$('btn-quiz-import').addEventListener('click', async () => {
  const json = $('quiz-json').value.trim();
  if (!json) return showToast('Вставте JSON або оберіть файл', true);
  try {
    const res = await api('/api/admin/quiz/import', {
      method: 'POST',
      body: JSON.stringify({ json }),
    });
    showImportResult(res);
    showToast(`Імпортовано запитань: ${res.added + res.updated}`);
    loadAdminQuiz();
  } catch (err) {
    showToast(err.message, true);
  }
});

$('quiz-file').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    $('quiz-json').value = String(reader.result);
  };
  reader.readAsText(file);
});
