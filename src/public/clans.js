/* Клани */
async function loadClan() {
  const root = $('clan-root');
  try {
    const [mine, all] = await Promise.all([api('/api/clans/mine'), api('/api/clans')]);
    root.innerHTML = mine.clan ? renderMyClan(mine.clan) : renderNoClan(all.clans, mine.createCost);
    bindClan(root, mine.clan);
  } catch (err) {
    showToast(err.message, true);
  }
}

function renderMyClan(c) {
  const leader = String(c.leaderId) === String(state.user.id);
  const rows = c.members
    .map(
      (
        m,
      ) => `<tr><td>${escapeHtml(m.username)} ${m.role === 'leader' ? '👑' : ''}</td><td>${m.level}</td><td>${m.rating}</td>
      <td>${
        leader && m.id !== state.user.id
          ? `<button class="btn btn-xs" data-transfer="${m.id}" type="button">Лідер</button>
             <button class="btn btn-xs btn-danger" data-kick="${m.id}" type="button">Виключити</button>`
          : ''
      }</td></tr>`,
    )
    .join('');
  return `<div class="panel"><div class="panel-header"><h2>[${escapeHtml(c.tag)}] ${escapeHtml(c.name)}</h2>
    <span class="muted">Рівень ${c.level} • XP ${c.xp} • скарбниця ${c.treasury} зол. • ${c.memberCount}/${c.maxMembers}</span></div>
    <p class="muted">${escapeHtml(c.description || '')}</p>
    <div class="table-wrap"><table><thead><tr><th>Гравець</th><th>Рів.</th><th>Рейтинг</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="group-actions"><input id="clan-donate" type="number" min="1" placeholder="Золото" />
      <button id="clan-donate-btn" class="btn btn-primary" type="button">Внести до скарбниці</button>
      ${leader ? '<button id="clan-disband" class="btn btn-danger" type="button">Розпустити клан</button>' : '<button id="clan-leave" class="btn btn-danger" type="button">Вийти з клану</button>'}
    </div><p class="muted">Клан отримує XP за перемоги учасників у групових боях і підземеллях та за внески.</p></div>`;
}

function renderNoClan(clans, cost) {
  const list = clans.length
    ? clans
        .map(
          (
            c,
          ) => `<tr><td>[${escapeHtml(c.tag)}] ${escapeHtml(c.name)}</td><td>${c.level}</td><td>${c.memberCount}/${c.maxMembers}</td>
          <td><button class="btn btn-xs" data-join-clan="${c.id}" type="button">Вступити</button></td></tr>`,
        )
        .join('')
    : '<tr><td colspan="4" class="muted">Кланів ще немає.</td></tr>';
  return `<div class="panel"><div class="panel-header"><h2>Створити клан</h2><span class="muted">Вартість: ${cost} золота</span></div>
    <div class="modal-form"><label>Назва (3–20)<input id="clan-name" maxlength="20" /></label>
    <label>Тег (2–5)<input id="clan-tag" maxlength="5" /></label>
    <label>Опис<input id="clan-desc" maxlength="120" /></label>
    <button id="clan-create" class="btn btn-primary" type="button">Створити</button></div></div>
    <div class="panel"><div class="panel-header"><h2>Клани</h2></div><div class="table-wrap"><table>
    <thead><tr><th>Клан</th><th>Рів.</th><th>Учасники</th><th></th></tr></thead><tbody>${list}</tbody></table></div></div>`;
}

async function clanAction(path, options, message) {
  try {
    const data = await api(path, options);
    if (data.user) {
      state.user = data.user;
      renderCharacter();
    }
    if (message) showToast(message);
  } catch (err) {
    showToast(err.message, true);
  }
  loadClan();
}

function bindClan(root, clan) {
  const post = (path, body) => ({ method: 'POST', body: JSON.stringify(body || {}) });
  const on = (id, fn) => root.querySelector(`#${id}`)?.addEventListener('click', fn);
  on('clan-create', () =>
    clanAction(
      '/api/clans',
      post('', {
        name: $('clan-name').value,
        tag: $('clan-tag').value,
        description: $('clan-desc').value,
      }),
      'Клан створено!',
    ),
  );
  root
    .querySelectorAll('[data-join-clan]')
    .forEach((el) =>
      el.addEventListener('click', () =>
        clanAction(`/api/clans/${el.dataset.joinClan}/join`, post(), 'Ви вступили до клану'),
      ),
    );
  root
    .querySelectorAll('[data-kick]')
    .forEach((el) =>
      el.addEventListener('click', () => clanAction(`/api/clans/kick/${el.dataset.kick}`, post())),
    );
  root.querySelectorAll('[data-transfer]').forEach((el) =>
    el.addEventListener('click', () => {
      if (confirm('Передати лідерство?'))
        clanAction(`/api/clans/transfer/${el.dataset.transfer}`, post());
    }),
  );
  on('clan-donate-btn', () =>
    clanAction(
      '/api/clans/donate',
      post('', { amount: Number($('clan-donate').value) }),
      'Дякуємо за внесок!',
    ),
  );
  on('clan-leave', () => clanAction('/api/clans/leave', post(), 'Ви залишили клан'));
  on('clan-disband', () => {
    if (clan && confirm('Розпустити клан назавжди?'))
      clanAction('/api/clans', { method: 'DELETE' }, 'Клан розпущено');
  });
}

tabHooks.clan = { enter: loadClan };
