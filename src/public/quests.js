/* Щоденні квести та досягнення */
async function loadQuests() {
  const root = $('quests-root');
  try {
    const data = await api('/api/quests');
    root.innerHTML = renderQuests(data);
    root.querySelectorAll('[data-claim]').forEach((el) =>
      el.addEventListener('click', async () => {
        try {
          const res = await api(`/api/quests/${el.dataset.claim}/claim`, { method: 'POST' });
          state.user = res.user;
          renderCharacter();
          showToast(`Нагорода: +${res.reward.xp} XP, +${res.reward.gold} золота`);
        } catch (err) {
          showToast(err.message, true);
        }
        loadQuests();
      }),
    );
  } catch (err) {
    showToast(err.message, true);
  }
}

function questRow(q) {
  const done = q.progress >= q.target;
  const pct = Math.round((Math.min(q.progress, q.target) / q.target) * 100);
  const action = q.claimed
    ? '<span class="muted">✔ отримано</span>'
    : `<button class="btn btn-xs btn-primary" data-claim="${q.id}" ${done ? '' : 'disabled'} type="button">Забрати</button>`;
  return `<div class="group-card"><div class="group-card-info"><strong>${escapeHtml(q.title)}</strong>
    <span class="muted">${''} (${Math.min(q.progress, q.target)}/${q.target}) • +${q.xp} XP, +${q.gold} зол.</span>
    <div class="progress-track"><div class="progress-fill" style="width:${pct}%;background:#4ade80"></div></div>${action}</div></div>`;
}

function renderQuests(d) {
  const ach = d.achievements
    .map(
      (
        a,
      ) => `<div class="group-card ${a.unlocked ? '' : 'dead'}"><div class="group-card-info"><strong>${a.unlocked ? '🏆' : '🔒'} ${escapeHtml(a.name)}</strong>
      <span class="muted">${escapeHtml(a.desc || '')} (${Math.min(a.progress, a.target)}/${a.target}) • +${a.gold} зол.</span></div></div>`,
    )
    .join('');
  return `<div class="panel"><div class="panel-header"><h2>Щоденні квести</h2><span class="muted">Оновлюються щодня</span></div>
    <div class="group-list">${d.quests.map(questRow).join('')}</div></div>
    <div class="panel"><div class="panel-header"><h2>Досягнення</h2></div><div class="group-list">${ach}</div></div>`;
}

tabHooks.quests = { enter: loadQuests };
