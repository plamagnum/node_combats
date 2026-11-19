/* Адмін: керування кланами */
async function loadAdminClans() {
  try {
    const { clans } = await api('/api/admin/clans');
    $('admin-clan-detail').classList.add('hidden');
    const tbody = $('admin-clans-tbody');
    tbody.innerHTML = clans.length
      ? clans
          .map(
            (
              c,
            ) => `<tr><td>[${escapeHtml(c.tag)}] ${escapeHtml(c.name)}</td><td>${escapeHtml(c.leaderName)}</td>
        <td>${c.memberCount}</td><td>${c.level} / ${c.xp}</td><td>${c.treasury}</td>
        <td><button class="btn btn-xs" data-clan-open="${c.id}" type="button">Склад</button>
        <button class="btn btn-xs" data-clan-edit="${c.id}" type="button">Змінити</button>
        <button class="btn btn-xs btn-danger" data-clan-del="${c.id}" type="button">Розпустити</button></td></tr>`,
          )
          .join('')
      : '<tr><td colspan="6" class="muted">Кланів немає</td></tr>';
    const byId = new Map(clans.map((c) => [c.id, c]));
    tbody
      .querySelectorAll('[data-clan-open]')
      .forEach((el) =>
        el.addEventListener('click', () => openAdminClan(byId.get(el.dataset.clanOpen))),
      );
    tbody
      .querySelectorAll('[data-clan-edit]')
      .forEach((el) =>
        el.addEventListener('click', () => editAdminClan(byId.get(el.dataset.clanEdit))),
      );
    tbody.querySelectorAll('[data-clan-del]').forEach((el) =>
      el.addEventListener('click', async () => {
        if (!confirm('Розпустити клан?')) return;
        await adminClanCall(
          `/api/admin/clans/${el.dataset.clanDel}`,
          { method: 'DELETE' },
          'Клан розпущено',
        );
        loadAdminClans();
      }),
    );
  } catch (err) {
    showToast(err.message, true);
  }
}

async function adminClanCall(path, options, ok) {
  try {
    await api(path, options);
    showToast(ok);
    return true;
  } catch (err) {
    showToast(err.message, true);
    return false;
  }
}

async function editAdminClan(c) {
  const name = prompt('Назва', c.name);
  if (name === null) return;
  const tag = prompt('Тег', c.tag);
  if (tag === null) return;
  const treasury = prompt('Скарбниця (золото)', c.treasury);
  if (treasury === null) return;
  const xp = prompt('XP клану', c.xp);
  if (xp === null) return;
  const body = { name, tag, treasury: Number(treasury), xp: Number(xp) };
  await adminClanCall(
    `/api/admin/clans/${c.id}`,
    { method: 'PUT', body: JSON.stringify(body) },
    'Клан оновлено',
  );
  loadAdminClans();
}

async function openAdminClan(c) {
  try {
    const { members } = await api(`/api/admin/clans/${c.id}`);
    const box = $('admin-clan-detail');
    box.classList.remove('hidden');
    box.innerHTML = `<h3>Склад [${escapeHtml(c.tag)}] ${escapeHtml(c.name)}</h3><div class="table-wrap"><table class="data-table"><tbody>${members
      .map(
        (
          m,
        ) => `<tr><td>${escapeHtml(m.username)} ${m.role === 'leader' ? '👑' : ''}</td><td>Рів. ${m.level}</td><td>${m.rating}</td>
      <td>${
        m.role === 'leader'
          ? ''
          : `<button class="btn btn-xs" data-leader="${m.id}" type="button">Зробити лідером</button>
             <button class="btn btn-xs btn-danger" data-kick="${m.id}" type="button">Виключити</button>`
      }</td></tr>`,
      )
      .join('')}</tbody></table></div>`;
    const act = (attr, path, ok) =>
      box.querySelectorAll(`[${attr}]`).forEach((el) =>
        el.addEventListener('click', async () => {
          if (
            await adminClanCall(
              `/api/admin/clans/${c.id}/${path}/${el.getAttribute(attr)}`,
              { method: 'POST' },
              ok,
            )
          ) {
            await loadAdminClans();
          }
        }),
      );
    act('data-leader', 'leader', 'Лідера змінено');
    act('data-kick', 'kick', 'Гравця виключено');
  } catch (err) {
    showToast(err.message, true);
  }
}
