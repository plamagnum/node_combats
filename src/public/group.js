/* Групові бої та підземелля */
const group = { timer: null, data: null, dungeons: [], dismissed: null, busy: false };
const ZONE_LABELS = { head: 'Голова', chest: 'Груди', belly: 'Пояс', legs: 'Ноги' };
const BLOCK_LABELS = {
  'head-chest': 'Голова + Груди',
  'chest-belly': 'Груди + Пояс',
  'belly-legs': 'Пояс + Ноги',
  'legs-head': 'Ноги + Голова',
};

async function refreshUserState() {
  try {
    const me = await api('/api/auth/me');
    state.user = me.user;
    renderCharacter();
  } catch {
    /* ігноруємо: оновлення необов'язкове */
  }
}

async function loadGroup() {
  try {
    if (!group.dungeons.length) {
      group.dungeons = (await api('/api/group/dungeons')).dungeons;
    }
    const prev = group.data?.battle?.status;
    group.data = await api('/api/group/state');
    const cur = group.data.battle;
    if (prev === 'active' && !cur) refreshUserState();
    renderGroup();
  } catch (err) {
    if (state.currentTab === 'group') showToast(err.message, true);
  }
}

function groupSend(path, body) {
  if (group.busy) return Promise.resolve();
  group.busy = true;
  return api(path, { method: 'POST', body: JSON.stringify(body || {}) })
    .then((d) => {
      group.busy = false;
      return d;
    })
    .catch((err) => {
      group.busy = false;
      showToast(err.message, true);
    })
    .then((d) => {
      loadGroup();
      return d;
    });
}

function memberCard(p, battle, selectable) {
  const dead = p.hp <= 0 || p.fled;
  const avatar = p.isNpc
    ? `<div class="npc-emoji">${escapeHtml(p.emoji || '👾')}</div>`
    : avatarSvg({ gender: p.gender, avatar: p.avatar }, 64);
  const pick =
    selectable && !dead
      ? `<label class="muted"><input type="radio" name="groupTarget" value="${p.idx}" /> ціль</label>`
      : '';
  const mark = p.fled
    ? ' 🏃'
    : p.hp <= 0
      ? ' 💀'
      : battle.status === 'active' && p.ready
        ? ' ✅'
        : '';
  return `<div class="group-card ${dead ? 'dead' : ''} ${p.idx === battle.myIdx ? 'me' : ''}" data-idx="${p.idx}">
    ${avatar}
    <div class="group-card-info">
      <strong>${p.boss ? '👑 ' : ''}${p.clanTag ? `[${escapeHtml(p.clanTag)}] ` : ''}${escapeHtml(p.name)}</strong>
      <span class="muted">Рів. ${p.level}${mark}</span>
      <div class="progress-track"><div class="progress-fill" data-bar="${p.idx}"></div></div>
      <span class="muted">${p.hp} / ${p.maxHp}</span>
      ${pick}
    </div>
  </div>`;
}

function setBars(root, battle) {
  battle.participants.forEach((p) => {
    const el = root.querySelector(`[data-bar="${p.idx}"]`);
    if (el) setHpBar(el, p.hp, p.maxHp);
  });
}

function renderLog(battle) {
  return `<div class="log-box group-log">${battle.log
    .map((l) => `<div class="log-line log-${l.type}">${escapeHtml(l.text)}</div>`)
    .join('')}</div>`;
}

function renderLobby(b) {
  const teams = b.mode === 'pvp' ? ['A', 'B'] : ['A'];
  const isHost = String(b.hostId) === String(state.user.id);
  const cols = teams
    .map(
      (t) =>
        `<div><h4>${b.mode === 'pvp' ? `Команда ${t}` : 'Загін'} (${
          b.participants.filter((p) => p.team === t).length
        }/${b.teamSize})</h4>${b.participants
          .filter((p) => p.team === t)
          .map((p) => memberCard(p, b, false))
          .join('')}</div>`,
    )
    .join('');
  return `<div class="panel"><div class="panel-header"><h2>${
    b.mode === 'dungeon' ? `Підземелля: ${escapeHtml(b.dungeonName || '')}` : 'PvP-лобі'
  }</h2><span class="muted">Організатор: ${escapeHtml(b.hostName)}</span></div>
    <div class="group-teams">${cols}</div>
    <div class="group-actions">
      ${isHost ? '<button id="group-start" class="btn btn-primary" type="button">Розпочати бій</button>' : '<span class="muted">Очікуємо старту від організатора…</span>'}
      <button id="group-leave" class="btn btn-danger" type="button">${isHost ? 'Скасувати лобі' : 'Вийти'}</button>
    </div></div>`;
}

function renderActive(b) {
  const me = b.participants[b.myIdx];
  const canAct = me && me.hp > 0 && !me.fled;
  const mine = b.participants.filter((p) => p.team === b.myTeam);
  const enemy = b.participants.filter((p) => p.team !== b.myTeam);
  const zones = Object.entries(ZONE_LABELS)
    .map(
      ([v, l], i) =>
        `<label><input type="radio" name="groupAttack" value="${v}" ${i === 0 ? 'checked' : ''} /> ${l}</label>`,
    )
    .join('');
  const blocks = Object.entries(BLOCK_LABELS)
    .map(
      ([v, l], i) =>
        `<label><input type="radio" name="groupBlock" value="${v}" ${i === 0 ? 'checked' : ''} /> ${l}</label>`,
    )
    .join('');
  const controls = canAct
    ? me.ready
      ? '<p class="muted">Хід зроблено. Очікуємо інших учасників…</p>'
      : `<div class="group-controls"><div><strong>Атака</strong> ${zones}</div><div><strong>Блок</strong> ${blocks}</div>
         <p class="muted">Оберіть ціль серед ворогів (за замовчуванням — випадкова).</p>
         <button id="group-turn" class="btn btn-primary" type="button">Зробити хід</button></div>`
    : '<p class="muted">Ви вибули з бою. Спостерігайте за результатом.</p>';
  const title =
    b.mode === 'dungeon'
      ? `${escapeHtml(b.dungeonName)} — поверх ${b.floor}/${b.totalFloors}`
      : 'Груповий PvP';
  return `<div class="panel"><div class="panel-header"><h2>${title}</h2><span class="muted">Раунд ${b.round}</span></div>
    <div class="group-teams"><div><h4>Ваша команда</h4>${mine.map((p) => memberCard(p, b, false)).join('')}</div>
    <div><h4>Вороги</h4>${enemy.map((p) => memberCard(p, b, canAct && !me.ready)).join('')}</div></div>
    ${controls}
    <div class="group-actions">${canAct ? '<button id="group-flee" class="btn btn-danger btn-sm" type="button">Втекти</button>' : ''}</div>
    ${renderLog(b)}</div>`;
}

function renderFinished(b) {
  const me = b.participants[b.myIdx];
  const won = b.winnerTeam === b.myTeam;
  const text = b.winnerTeam === 'draw' ? 'Нічия' : won ? 'Перемога!' : 'Поразка';
  const rating =
    b.mode === 'pvp' && me ? ` • рейтинг ${me.ratingDelta >= 0 ? '+' : ''}${me.ratingDelta}` : '';
  return `<div class="panel"><div class="panel-header"><h2>${text}</h2></div>
    <p>Нагорода: <strong>+${me?.earnXp || 0} XP</strong>, <strong>+${me?.earnGold || 0} золота</strong>${rating}</p>
    ${renderLog(b)}
    <button id="group-dismiss" class="btn btn-primary" type="button">Закрити</button></div>`;
}

function renderIdle(d) {
  const dungeons = group.dungeons
    .map((x) => {
      const locked = state.user.level < x.minLevel;
      return `<div class="group-card"><div class="group-card-info"><strong>${escapeHtml(x.name)}</strong>
        <span class="muted">Від рівня ${x.minLevel} • до ${x.maxParty} гравців • ${x.floors.length} поверхів</span>
        <button class="btn btn-primary btn-sm" data-dungeon="${x.id}" ${locked ? 'disabled' : ''} type="button">Створити лобі</button></div></div>`;
    })
    .join('');
  const lobbies = d.lobbies.length
    ? d.lobbies
        .map(
          (l) => `<div class="group-card"><div class="group-card-info"><strong>${
            l.mode === 'dungeon'
              ? `🏰 ${escapeHtml(l.dungeonName)}`
              : `⚔️ PvP ${l.teamSize}×${l.teamSize}`
          }</strong><span class="muted">Організатор: ${escapeHtml(l.hostName)} • гравців: ${l.participants.length}</span>
          ${
            l.mode === 'pvp'
              ? `<span><button class="btn btn-sm" data-join="${l.id}" data-team="A" type="button">До команди A</button>
               <button class="btn btn-sm" data-join="${l.id}" data-team="B" type="button">До команди B</button></span>`
              : `<button class="btn btn-sm" data-join="${l.id}" type="button">Приєднатися</button>`
          }</div></div>`,
        )
        .join('')
    : '<p class="muted">Відкритих лобі немає.</p>';
  return `<div class="panel"><div class="panel-header"><h2>Підземелля з босами</h2></div><div class="group-list">${dungeons}</div></div>
    <div class="panel"><div class="panel-header"><h2>Груповий PvP</h2></div>
      <div class="group-actions"><label>Розмір команди
        <select id="group-size"><option>1</option><option selected>2</option><option>3</option></select></label>
        <button id="group-create-pvp" class="btn btn-primary" type="button">Створити лобі</button></div></div>
    <div class="panel"><div class="panel-header"><h2>Відкриті лобі</h2></div><div class="group-list">${lobbies}</div></div>`;
}

function renderGroup() {
  const root = $('group-root');
  const d = group.data;
  if (!d || !root) return;
  // Не перемальовуємо під час вибору ходу, щоб не збивати радіокнопки
  const sig = JSON.stringify(d);
  if (group.sig === sig) return;
  group.sig = sig;

  const b =
    d.battle || (d.lastFinished && d.lastFinished.id !== group.dismissed ? d.lastFinished : null);
  let html;
  if (!b) html = renderIdle(d);
  else if (b.status === 'lobby') html = renderLobby(b);
  else if (b.status === 'active') html = renderActive(b);
  else html = renderFinished(b);
  const keep = {};
  ['groupAttack', 'groupBlock', 'groupTarget'].forEach((n) => {
    keep[n] = root.querySelector(`input[name="${n}"]:checked`)?.value;
  });
  root.innerHTML = html;
  Object.entries(keep).forEach(([n, v]) => {
    const el = v && root.querySelector(`input[name="${n}"][value="${v}"]`);
    if (el) el.checked = true;
  });
  if (b) setBars(root, b);
  bindGroup(root, b);
}

function bindGroup(root, b) {
  root
    .querySelectorAll('[data-dungeon]')
    .forEach((el) =>
      el.addEventListener('click', () =>
        groupSend('/api/group/lobbies', { mode: 'dungeon', dungeonId: el.dataset.dungeon }),
      ),
    );
  root
    .querySelectorAll('[data-join]')
    .forEach((el) =>
      el.addEventListener('click', () =>
        groupSend(
          `/api/group/lobbies/${el.dataset.join}/join`,
          el.dataset.team ? { team: el.dataset.team } : {},
        ),
      ),
    );
  const on = (id, fn) => root.querySelector(`#${id}`)?.addEventListener('click', fn);
  on('group-create-pvp', () =>
    groupSend('/api/group/lobbies', { mode: 'pvp', teamSize: Number($('group-size').value) }),
  );
  if (!b) return;
  on('group-start', () => groupSend(`/api/group/lobbies/${b.id}/start`));
  on('group-leave', () => groupSend(`/api/group/lobbies/${b.id}/leave`));
  on('group-flee', () => groupSend(`/api/group/battles/${b.id}/flee`));
  on('group-dismiss', () => {
    group.dismissed = b.id;
    group.sig = '';
    renderGroup();
  });
  on('group-turn', () => {
    const target = root.querySelector('input[name="groupTarget"]:checked');
    groupSend(`/api/group/battles/${b.id}/turn`, {
      attackZone: root.querySelector('input[name="groupAttack"]:checked').value,
      blockPair: root.querySelector('input[name="groupBlock"]:checked').value,
      targetIdx: target ? Number(target.value) : null,
    });
  });
}

tabHooks.group = {
  enter() {
    group.sig = '';
    loadGroup();
    clearInterval(group.timer);
    group.timer = setInterval(loadGroup, 2500);
  },
  leave() {
    clearInterval(group.timer);
    group.timer = null;
  },
};
