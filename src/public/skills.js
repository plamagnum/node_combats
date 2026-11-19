/* Навички та магія */
async function loadSkills() {
  const root = $('skills-root');
  try {
    renderSkills(root, await api('/api/skills'));
  } catch (err) {
    showToast(err.message, true);
  }
}

function renderSkills(root, d) {
  const cards = d.skills
    .map((s) => {
      const action = s.learned
        ? '<span class="muted">✔ вивчено</span>'
        : s.locked
          ? `<span class="muted">🔒 з рівня ${s.minLevel}</span>`
          : `<button class="btn btn-xs btn-primary" data-learn="${s.id}" type="button">Вивчити (${s.price} зол.)</button>`;
      return `<div class="group-card ${s.locked && !s.learned ? 'dead' : ''}"><div class="npc-emoji">${s.icon}</div>
        <div class="group-card-info"><strong>${escapeHtml(s.name)}</strong>
        <span class="muted">${escapeHtml(s.desc)}</span>
        <span class="muted">Мана ${s.mana} • перезарядка ${s.cooldown} р.</span>${action}</div></div>`;
    })
    .join('');
  root.innerHTML = `<div class="panel"><div class="panel-header"><h2>Навички та магія</h2>
    <span class="muted">Макс. мана в бою: ${d.maxMana} (росте з інтуїцією), +5 за раунд</span></div>
    <p class="muted">Навички використовуються в групових боях і підземеллях.</p>
    <div class="group-list">${cards}</div></div>`;
  root.querySelectorAll('[data-learn]').forEach((el) =>
    el.addEventListener('click', async () => {
      try {
        const res = await api(`/api/skills/${el.dataset.learn}/learn`, { method: 'POST' });
        state.user = res.user;
        renderCharacter();
        group.skillCatalog = null;
        showToast('Навичку вивчено!');
        renderSkills(root, res);
      } catch (err) {
        showToast(err.message, true);
      }
    }),
  );
}

tabHooks.skills = { enter: loadSkills };
