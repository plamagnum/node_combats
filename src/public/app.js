const state = {
  token: localStorage.getItem('combats_token') || '',
  user: null,
  bots: [],
  activeBattle: null,
  history: [],
  shopItems: [],
  shopFilter: 'all',
  pvpMyBattle: null,
  pvpChallenges: [],
  pvpHistory: [],
  pvpPollTimer: null,
  currentTab: 'arena',
  authMode: 'login',
  adminUsers: [],
  adminBots: [],
  adminItems: [],
};

const STAT_LABELS = {
  strength: 'Сила',
  agility: 'Спритність',
  intuition: 'Інтуїція',
  endurance: 'Витривалість',
};

const SLOT_LABELS = {
  weapon: 'Зброя',
  armor: 'Броня',
  helmet: 'Шолом',
  ring: 'Кільце',
};

const $ = (id) => document.getElementById(id);

function showToast(message, isError = false) {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('error', isError);
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 3200);
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Помилка запиту');
    err.status = res.status;
    throw err;
  }
  if (Array.isArray(data.unlocked) && data.unlocked.length) {
    showToast(`🏆 Досягнення: ${data.unlocked.join(', ')}`);
  }
  return data;
}

// Колір смуги HP: зелена (>60%), жовта (30–60%), червона (<30%)
function setHpBar(el, hp, maxHp) {
  const pct = maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : 0;
  el.style.width = `${pct}%`;
  el.dataset.hp = pct > 60 ? 'high' : pct >= 30 ? 'mid' : 'low';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBonuses(b = {}) {
  const parts = [];
  if (b.damageMin || b.damageMax) parts.push(`Шкода +${b.damageMin || 0}–${b.damageMax || 0}`);
  if (b.armor) parts.push(`Броня +${b.armor}`);
  if (b.strength) parts.push(`Сил +${b.strength}`);
  if (b.agility) parts.push(`Спр +${b.agility}`);
  if (b.intuition) parts.push(`Інт +${b.intuition}`);
  if (b.endurance) parts.push(`Вит +${b.endurance}`);
  return parts.length ? parts.join(' • ') : 'Без бонусів';
}

// ==================== AUTH ====================

function setAuthMode(mode) {
  state.authMode = mode;
  $('tab-login').classList.toggle('active', mode === 'login');
  $('tab-register').classList.toggle('active', mode === 'register');
  $('auth-submit').textContent =
    mode === 'login' ? 'Увійти на арену' : 'Створити персонажа і грати';
}

$('tab-login').addEventListener('click', () => setAuthMode('login'));
$('tab-register').addEventListener('click', () => setAuthMode('register'));

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = $('auth-username').value.trim();
  const password = $('auth-password').value;
  try {
    const endpoint = state.authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const data = await api(endpoint, {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('combats_token', data.token);
    showToast(state.authMode === 'login' ? 'Вітаємо на арені!' : 'Персонажа створено!');
    await enterApp();
  } catch (err) {
    showToast(err.message, true);
  }
});

$('btn-logout').addEventListener('click', () => {
  stopPvpPolling();
  disconnectChat();
  localStorage.removeItem('combats_token');
  state.token = '';
  state.user = null;
  state.activeBattle = null;
  state.pvpMyBattle = null;
  $('app-screen').classList.add('hidden');
  $('auth-screen').classList.remove('hidden');
});

// ==================== NAVIGATION ====================

// Вкладки з окремих скриптів реєструють тут enter/leave
const tabHooks = {};

function switchMainTab(tab) {
  state.currentTab = tab;
  [
    'arena',
    'pvp',
    'shop',
    'group',
    'quiz',
    'skills',
    'clan',
    'quests',
    'ranking',
    'chat',
    'admin',
  ].forEach((t) => {
    $(`nav-${t}`).classList.toggle('active', t === tab);
    $(`view-${t}`).classList.toggle('hidden', t !== tab);
  });

  if (tab === 'pvp') {
    loadPvpState();
    startPvpPolling();
  } else {
    stopPvpPolling();
  }

  Object.entries(tabHooks).forEach(([t, h]) => (t === tab ? h.enter() : h.leave && h.leave()));

  if (tab === 'shop') {
    loadShop();
  }
  if (tab === 'admin') {
    loadAdminData();
  }
  if (tab === 'ranking') {
    loadRanking();
  }
  if (tab === 'chat') {
    chatUnread = 0;
    $('nav-chat').textContent = 'Чат';
    scrollChatToBottom();
  }
}

$('nav-arena').addEventListener('click', () => switchMainTab('arena'));
$('nav-pvp').addEventListener('click', () => switchMainTab('pvp'));
$('nav-shop').addEventListener('click', () => switchMainTab('shop'));
$('nav-group').addEventListener('click', () => switchMainTab('group'));
$('nav-quiz').addEventListener('click', () => switchMainTab('quiz'));
$('nav-skills').addEventListener('click', () => switchMainTab('skills'));
$('nav-clan').addEventListener('click', () => switchMainTab('clan'));
$('nav-quests').addEventListener('click', () => switchMainTab('quests'));
$('nav-ranking').addEventListener('click', () => switchMainTab('ranking'));
$('nav-chat').addEventListener('click', () => switchMainTab('chat'));
$('nav-admin').addEventListener('click', () => switchMainTab('admin'));

$('btn-edit-avatar').addEventListener('click', () => {
  openAvatarEditor(state.user, {
    saveUrl: '/api/game/avatar',
    onSaved: (u) => {
      state.user = u;
      renderCharacter();
    },
  });
});

// ==================== RANKING ====================

async function loadRanking() {
  try {
    const data = await api('/api/game/leaderboard');
    $('ranking-me').textContent = data.me.rank
      ? `Ваше місце: #${data.me.rank} • рейтинг ${data.me.rating}`
      : `Рейтинг: ${data.me.rating}`;
    $('ranking-tbody').innerHTML = data.leaderboard
      .map(
        (r) => `<tr class="${state.user && r.id === state.user.id ? 'me-row' : ''}">
          <td>${r.rank}</td>
          <td><strong>${r.clanTag ? `[${escapeHtml(r.clanTag)}] ` : ''}${escapeHtml(r.username)}</strong></td>
          <td>${r.level}</td>
          <td><strong>${r.rating}</strong></td>
          <td>${r.wins} / ${r.losses}</td>
        </tr>`,
      )
      .join('');
  } catch (err) {
    showToast(err.message, true);
  }
}

// ==================== CHAT (Socket.IO) ====================

let chatSocket = null;
let chatUnread = 0;

function scrollChatToBottom() {
  const box = $('chat-messages');
  box.scrollTop = box.scrollHeight;
}

function appendChatMessage(m) {
  const el = document.createElement('div');
  el.className = 'chat-msg';
  const time = new Date(m.createdAt).toLocaleTimeString('uk-UA', {
    hour: '2-digit',
    minute: '2-digit',
  });
  el.innerHTML = `<span class="muted">${time}</span> <strong class="${m.role === 'admin' ? 'chat-admin' : ''}">${m.clanTag ? `[${escapeHtml(m.clanTag)}] ` : ''}${escapeHtml(
    m.username,
  )}</strong> <span class="muted">[${m.level}]</span>: <span class="chat-text"></span>`;
  el.querySelector('.chat-text').textContent = m.text;
  const box = $('chat-messages');
  const stick = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  box.appendChild(el);
  while (box.children.length > 200) box.removeChild(box.firstChild);
  if (stick) scrollChatToBottom();
}

function connectChat() {
  if (chatSocket || !state.token || typeof io === 'undefined') return;
  chatSocket = io({ auth: { token: state.token } });
  chatSocket.on('connect', () => {
    $('chat-status').textContent = 'Онлайн';
  });
  chatSocket.on('disconnect', () => {
    $('chat-status').textContent = 'Відключено';
  });
  chatSocket.on('connect_error', () => {
    $('chat-status').textContent = 'Помилка підключення';
  });
  chatSocket.on('chat:history', (list) => {
    $('chat-messages').innerHTML = '';
    list.forEach(appendChatMessage);
    scrollChatToBottom();
  });
  chatSocket.on('chat:message', (m) => {
    appendChatMessage(m);
    if (state.currentTab !== 'chat') {
      chatUnread += 1;
      $('nav-chat').textContent = `Чат (${chatUnread})`;
    }
  });
}

function disconnectChat() {
  if (chatSocket) {
    chatSocket.disconnect();
    chatSocket = null;
  }
}

$('chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('chat-input');
  const text = input.value.trim();
  if (!text || !chatSocket) return;
  chatSocket.emit('chat:send', text, (res) => {
    if (res && res.error) showToast(res.error, true);
    else input.value = '';
  });
});

// ==================== CHARACTER & ARENA (PvE) ====================

function renderCharacter() {
  const u = state.user;
  if (!u) return;

  const eff = u.effectiveStats || { ...u.stats, damageMin: 0, damageMax: 0, armor: 0 };

  $('char-avatar').innerHTML = avatarSvg(u, 130);
  $('header-user').textContent =
    `${u.username} • Рів. ${u.level} • ${u.gold} зол. • рейтинг ${u.rating ?? 1000} (${u.role})`;
  $('nav-admin').classList.toggle('hidden', u.role !== 'admin');

  $('char-name').textContent = u.username;
  $('char-level').textContent = `Рівень ${u.level}`;
  $('char-hp-text').textContent = `${u.hp} / ${u.maxHp}`;
  setHpBar($('char-hp-bar'), u.hp, u.maxHp);

  const nextXp = u.nextLevelXp || u.level * 100;
  $('char-xp-text').textContent = `${u.xp} / ${nextXp}`;
  $('char-xp-bar').style.width = `${Math.max(0, Math.min(100, (u.xp / nextXp) * 100))}%`;

  $('char-gold').textContent = u.gold;
  $('char-wins').textContent = u.wins;
  $('char-losses').textContent = u.losses;
  $('char-free-stats').textContent = `Вільних: ${u.freeStats}`;

  const list = $('char-stats-list');
  list.innerHTML = '';
  Object.entries(STAT_LABELS).forEach(([key, label]) => {
    const baseVal = u.stats[key];
    const bonus = (eff[key] || baseVal) - baseVal;
    const li = document.createElement('li');
    li.innerHTML = `
      <span>${label}</span>
      <div>
        <strong>${baseVal}</strong>${bonus > 0 ? ` <span class="bonus-tag">(+${bonus})</span>` : ''}
        ${
          u.freeStats > 0
            ? `<button class="btn btn-primary btn-xs" data-alloc="${key}">+1</button>`
            : ''
        }
      </div>
    `;
    list.appendChild(li);
  });

  list.querySelectorAll('[data-alloc]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const data = await api('/api/game/stats/allocate', {
          method: 'POST',
          body: JSON.stringify({ stat: btn.dataset.alloc }),
        });
        state.user = data.user;
        renderCharacter();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });

  const minDmg = Math.max(3, Math.round(eff.strength * 1.5) + (eff.damageMin || 0));
  const maxDmg = Math.max(minDmg, Math.round(eff.strength * 2.4 + 4) + (eff.damageMax || 0));
  $('char-combat-summary').innerHTML = `
    <span>Шкода: <strong>${minDmg}–${maxDmg}</strong></span>
    <span>Броня: <strong>${eff.armor || 0}</strong></span>
  `;

  const eqList = $('char-equipped-list');
  eqList.innerHTML = '';
  Object.entries(SLOT_LABELS).forEach(([slot, label]) => {
    const item = u.equipment?.[slot];
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="muted">${label}</span>
      <strong>${item ? escapeHtml(item.name) : '—'}</strong>
    `;
    eqList.appendChild(li);
  });
}

$('btn-heal').addEventListener('click', async () => {
  try {
    const data = await api('/api/game/heal', { method: 'POST' });
    state.user = data.user;
    renderCharacter();
    showToast("Здоров'я повністю відновлено!");
  } catch (err) {
    showToast(err.message, true);
  }
});

function renderBots() {
  const grid = $('bots-grid');
  grid.innerHTML = '';
  if (!state.bots.length) {
    grid.innerHTML = '<div class="muted">Немає активних ботів. Додайте їх в адмін-панелі.</div>';
    return;
  }

  state.bots.forEach((bot) => {
    const card = document.createElement('div');
    card.className = 'bot-card';
    card.innerHTML = `
      <div>
        <h3>${escapeHtml(bot.name)}</h3>
        <div class="bot-meta">${escapeHtml(bot.title)} • Рівень ${bot.level}</div>
        <div class="bot-meta">HP: ${bot.maxHp} | Сил: ${bot.stats.strength} | Спр: ${bot.stats.agility} | Інт: ${bot.stats.intuition}</div>
        <div class="bot-meta">Нагорода: +${bot.rewardXp} XP, +${bot.rewardGold} золота</div>
      </div>
      <button class="btn btn-primary btn-sm" data-fight-bot="${bot._id}">В бій!</button>
    `;
    grid.appendChild(card);
  });

  grid.querySelectorAll('[data-fight-bot]').forEach((btn) => {
    btn.addEventListener('click', () => startBattle(btn.dataset.fightBot));
  });
}

function renderHistory() {
  const container = $('battle-history');
  container.innerHTML = '';
  if (!state.history.length) {
    container.innerHTML = '<div class="muted">Історія боїв поки порожня.</div>';
    return;
  }
  const statusMap = {
    won: { label: 'Перемога', cls: 'status-won' },
    lost: { label: 'Поразка', cls: 'status-lost' },
    draw: { label: 'Нічия', cls: 'status-draw' },
  };
  state.history.forEach((item) => {
    const st = statusMap[item.status] || { label: item.status, cls: '' };
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <span>vs ${escapeHtml(item.botName)} [Рів. ${item.botLevel}] (${item.round} раунд.)</span>
      <span class="${st.cls}">${st.label}${item.reward?.xp ? ` (+${item.reward.xp} XP)` : ''}</span>
    `;
    container.appendChild(div);
  });
}

function renderBattle() {
  const battle = state.activeBattle;
  if (!battle) {
    $('bot-lobby').classList.remove('hidden');
    $('battle-arena').classList.add('hidden');
    return;
  }

  $('bot-lobby').classList.add('hidden');
  $('battle-arena').classList.remove('hidden');

  $('battle-round').textContent = battle.round;
  $('vs-player-name').textContent = `${state.user.username} [Рів. ${state.user.level}]`;
  $('vs-player-hp').textContent = `${battle.playerHp} / ${battle.playerMaxHp}`;
  setHpBar($('vs-player-bar'), battle.playerHp, battle.playerMaxHp);

  $('vs-bot-name').textContent = `${battle.botName} [Рів. ${battle.botLevel}]`;
  $('vs-bot-hp').textContent = `${battle.botHp} / ${battle.botMaxHp}`;
  setHpBar($('vs-bot-bar'), battle.botHp, battle.botMaxHp);

  const isActive = battle.status === 'active';
  $('battle-controls').classList.toggle('hidden', !isActive);
  $('battle-action-row').classList.toggle('hidden', !isActive);
  $('btn-flee').classList.toggle('hidden', !isActive);
  $('battle-finish-banner').classList.toggle('hidden', isActive);

  if (!isActive) {
    if (battle.status === 'won') {
      $('battle-finish-text').textContent =
        `Перемога! +${battle.reward?.xp || 0} XP та +${battle.reward?.gold || 0} золота.`;
    } else if (battle.status === 'lost') {
      $('battle-finish-text').textContent = 'Поразка! Відновіть HP та спробуйте знову.';
    } else {
      $('battle-finish-text').textContent = 'Нічия!';
    }
  }

  const logEl = $('combat-log');
  logEl.innerHTML = '';
  [...battle.log].reverse().forEach((entry) => {
    const row = document.createElement('div');
    row.className = `log-entry log-${entry.type}`;
    row.textContent = `[Раунд ${entry.round}] ${entry.text}`;
    logEl.appendChild(row);
  });
}

async function startBattle(botId) {
  try {
    const data = await api('/api/game/battles/start', {
      method: 'POST',
      body: JSON.stringify({ botId }),
    });
    state.activeBattle = data.battle;
    state.user = data.user;
    renderCharacter();
    renderBattle();
  } catch (err) {
    showToast(err.message, true);
  }
}

$('btn-turn').addEventListener('click', async () => {
  if (!state.activeBattle) return;
  const attackZone = document.querySelector('input[name="attackZone"]:checked')?.value;
  const blockPair = document.querySelector('input[name="blockPair"]:checked')?.value;
  try {
    const data = await api(`/api/game/battles/${state.activeBattle._id}/turn`, {
      method: 'POST',
      body: JSON.stringify({ attackZone, blockPair }),
    });
    state.activeBattle = data.battle;
    state.user = data.user;
    renderCharacter();
    renderBattle();
  } catch (err) {
    showToast(err.message, true);
  }
});

$('btn-flee').addEventListener('click', async () => {
  if (!state.activeBattle) return;
  try {
    const data = await api(`/api/game/battles/${state.activeBattle._id}/flee`, {
      method: 'POST',
    });
    state.activeBattle = data.battle;
    state.user = data.user;
    renderCharacter();
    renderBattle();
  } catch (err) {
    showToast(err.message, true);
  }
});

$('btn-back-lobby').addEventListener('click', async () => {
  state.activeBattle = null;
  await loadGameState();
});

// ==================== SHOP & EQUIPMENT ====================

async function loadShop() {
  try {
    const [meData, shopData] = await Promise.all([api('/api/auth/me'), api('/api/shop/items')]);
    state.user = meData.user;
    state.shopItems = shopData.items;
    renderCharacter();
    renderShopAndGear();
  } catch (err) {
    showToast(err.message, true);
  }
}

$('shop-filters')
  .querySelectorAll('[data-slot-filter]')
  .forEach((btn) => {
    btn.addEventListener('click', () => {
      state.shopFilter = btn.dataset.slotFilter;
      $('shop-filters')
        .querySelectorAll('[data-slot-filter]')
        .forEach((b) => b.classList.toggle('active', b === btn));
      renderShopAndGear();
    });
  });

function renderShopAndGear() {
  const u = state.user;
  if (!u) return;

  $('shop-gold').textContent = u.gold;

  // Equipped slots
  const slotsEl = $('equipment-slots');
  slotsEl.innerHTML = '';
  Object.entries(SLOT_LABELS).forEach(([slot, label]) => {
    const item = u.equipment?.[slot];
    const row = document.createElement('div');
    row.className = 'slot-row';
    row.innerHTML = `
      <div>
        <div class="muted">${label}</div>
        <strong>${item ? escapeHtml(item.name) : 'Порожньо'}</strong>
        ${item ? `<div class="bonus-tag">${formatBonuses(item.bonuses)}</div>` : ''}
      </div>
      ${item ? `<button class="btn btn-ghost btn-xs" data-unequip="${slot}">Зняти</button>` : ''}
    `;
    slotsEl.appendChild(row);
  });

  slotsEl.querySelectorAll('[data-unequip]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const res = await api(`/api/shop/unequip/${btn.dataset.unequip}`, { method: 'POST' });
        state.user = res.user;
        renderCharacter();
        renderShopAndGear();
        showToast('Спорядження знято');
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });

  // Inventory
  const invEl = $('inventory-list');
  invEl.innerHTML = '';
  const inv = u.inventory || [];
  if (!inv.length) {
    invEl.innerHTML = '<div class="muted">Інвентар порожній. Купіть спорядження у лавці!</div>';
  } else {
    inv.forEach((item) => {
      if (!item || !item._id) return;
      const equippedId = u.equipment?.[item.slot]?._id;
      const isEquipped = equippedId && equippedId === item._id;
      const row = document.createElement('div');
      row.className = 'inv-row';
      row.innerHTML = `
        <div>
          <strong>${escapeHtml(item.name)}</strong> <span class="muted">(${SLOT_LABELS[item.slot]})</span>
          <div class="bonus-tag">${formatBonuses(item.bonuses)}</div>
        </div>
        <div class="action-group">
          ${
            isEquipped
              ? '<span class="badge badge-gold">Одягнено</span>'
              : `<button class="btn btn-primary btn-xs" data-equip="${item._id}">Одягнути</button>`
          }
          <button class="btn btn-danger btn-xs" data-sell="${item._id}">Продати (+${Math.max(1, Math.floor(item.price * 0.5))})</button>
        </div>
      `;
      invEl.appendChild(row);
    });

    invEl.querySelectorAll('[data-equip]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const res = await api(`/api/shop/equip/${btn.dataset.equip}`, { method: 'POST' });
          state.user = res.user;
          renderCharacter();
          renderShopAndGear();
          showToast('Предмет одягнено!');
        } catch (err) {
          showToast(err.message, true);
        }
      });
    });

    invEl.querySelectorAll('[data-sell]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const res = await api(`/api/shop/sell/${btn.dataset.sell}`, { method: 'POST' });
          state.user = res.user;
          renderCharacter();
          renderShopAndGear();
          showToast(`Продано за +${res.refund} золота`);
        } catch (err) {
          showToast(err.message, true);
        }
      });
    });
  }

  // Shop catalog
  const grid = $('shop-items-grid');
  grid.innerHTML = '';
  const ownedIds = new Set(inv.map((i) => i?._id).filter(Boolean));
  const items = state.shopItems.filter(
    (it) => state.shopFilter === 'all' || it.slot === state.shopFilter,
  );

  items.forEach((item) => {
    const owned = ownedIds.has(item._id);
    const canAfford = u.gold >= item.price;
    const card = document.createElement('div');
    card.className = 'bot-card';
    card.innerHTML = `
      <div>
        <h3>${escapeHtml(item.name)}</h3>
        <div class="bot-meta">${SLOT_LABELS[item.slot]} • Мін. рівень: ${item.minLevel}</div>
        <div class="bonus-tag" style="margin: 4px 0;">${formatBonuses(item.bonuses)}</div>
        <div class="bot-meta">${escapeHtml(item.description || '')}</div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
        <strong>${item.price} зол.</strong>
        <button class="btn btn-primary btn-sm" data-buy="${item._id}" ${owned || !canAfford ? 'disabled' : ''}>
          ${owned ? 'В інвентарі' : canAfford ? 'Купити' : 'Мало золота'}
        </button>
      </div>
    `;
    grid.appendChild(card);
  });

  grid.querySelectorAll('[data-buy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const res = await api(`/api/shop/buy/${btn.dataset.buy}`, { method: 'POST' });
        state.user = res.user;
        renderCharacter();
        renderShopAndGear();
        showToast(`Куплено: ${res.item.name}`);
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });
}

// ==================== PvP ARENA ====================

function startPvpPolling() {
  stopPvpPolling();
  state.pvpPollTimer = setInterval(() => {
    if (state.currentTab === 'pvp' && state.token) {
      loadPvpState(true);
    }
  }, 2500);
}

function stopPvpPolling() {
  if (state.pvpPollTimer) {
    clearInterval(state.pvpPollTimer);
    state.pvpPollTimer = null;
  }
}

async function loadPvpState(silent = false) {
  try {
    const data = await api('/api/pvp/state');
    state.user = data.user;
    state.pvpMyBattle = data.myBattle;
    state.pvpChallenges = data.openChallenges;
    state.pvpHistory = data.history;
    renderCharacter();
    renderPvp();
  } catch (err) {
    if (!silent) showToast(err.message, true);
  }
}

function renderPvp() {
  const b = state.pvpMyBattle;

  if (b && (b.status === 'active' || b.status === 'finished')) {
    $('pvp-lobby').classList.add('hidden');
    $('pvp-arena').classList.remove('hidden');

    $('pvp-round').textContent = b.round;
    $('pvp-c-name').textContent = `${b.challengerName} [Рів. ${b.challengerLevel}]`;
    $('pvp-c-hp').textContent = `${b.challengerHp} / ${b.challengerMaxHp}`;
    setHpBar($('pvp-c-bar'), b.challengerHp, b.challengerMaxHp);

    $('pvp-o-name').textContent = `${b.opponentName} [Рів. ${b.opponentLevel}]`;
    $('pvp-o-hp').textContent = `${b.opponentHp} / ${b.opponentMaxHp}`;
    setHpBar($('pvp-o-bar'), b.opponentHp, b.opponentMaxHp);

    const isActive = b.status === 'active';
    $('btn-pvp-flee').classList.toggle('hidden', !isActive);
    $('pvp-controls').classList.toggle('hidden', !isActive || b.myMoveSubmitted);
    $('pvp-action-row').classList.toggle('hidden', !isActive || b.myMoveSubmitted);
    $('pvp-finish-banner').classList.toggle('hidden', isActive);

    const statusBanner = $('pvp-status-banner');
    if (isActive) {
      statusBanner.classList.remove('hidden');
      if (b.myMoveSubmitted) {
        statusBanner.textContent = '⏳ Ваш хід прийнято. Очікуємо вибір суперника...';
      } else if (b.opponentMoveSubmitted) {
        statusBanner.textContent = '⚡ Суперник уже зробив хід! Оберіть удар і блок.';
      } else {
        statusBanner.textContent = '⚔️ Оберіть зону удару та блок для цього раунду.';
      }
    } else {
      statusBanner.classList.add('hidden');
      $('pvp-finish-text').textContent = b.isDraw
        ? 'PvP дуель завершилась нічиєю!'
        : `Переможець дуелі: ${b.winnerName}!`;
    }

    const logEl = $('pvp-log');
    logEl.innerHTML = '';
    [...b.log].reverse().forEach((entry) => {
      const row = document.createElement('div');
      row.className = `log-entry log-${entry.type}`;
      row.textContent = `[Раунд ${entry.round}] ${entry.text}`;
      logEl.appendChild(row);
    });
    return;
  }

  $('pvp-lobby').classList.remove('hidden');
  $('pvp-arena').classList.add('hidden');

  const isWaiting = Boolean(b && b.status === 'waiting');
  $('pvp-waiting-box').classList.toggle('hidden', !isWaiting);
  $('btn-pvp-create').disabled = isWaiting;

  const list = $('pvp-challenges-list');
  list.innerHTML = '';
  if (!state.pvpChallenges.length) {
    list.innerHTML =
      '<div class="muted">Відкритих викликів поки немає. Киньте виклик першим або відкрийте гру в іншому вікні під другим гравцем!</div>';
  } else {
    state.pvpChallenges.forEach((ch) => {
      const isMine = ch.challengerId === state.user.id;
      const card = document.createElement('div');
      card.className = 'bot-card';
      card.innerHTML = `
        <div>
          <h3>${escapeHtml(ch.challengerName)}</h3>
          <div class="bot-meta">Рівень ${ch.challengerLevel} • HP: ${ch.challengerHp}/${ch.challengerMaxHp}</div>
        </div>
        ${
          isMine
            ? '<span class="badge badge-gold">Ваша заявка</span>'
            : `<button class="btn btn-primary btn-sm" data-accept-pvp="${ch.id}">Прийняти бій!</button>`
        }
      `;
      list.appendChild(card);
    });

    list.querySelectorAll('[data-accept-pvp]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const res = await api(`/api/pvp/challenges/${btn.dataset.acceptPvp}/accept`, {
            method: 'POST',
          });
          state.pvpMyBattle = res.battle;
          renderPvp();
          showToast('PvP дуель розпочато!');
        } catch (err) {
          showToast(err.message, true);
        }
      });
    });
  }

  const histEl = $('pvp-history');
  histEl.innerHTML = '';
  if (!state.pvpHistory.length) {
    histEl.innerHTML = '<div class="muted">Ви ще не брали участі у PvP дуелях.</div>';
  } else {
    state.pvpHistory.forEach((h) => {
      const won = h.winnerId === state.user.id;
      const cls = h.isDraw ? 'status-draw' : won ? 'status-won' : 'status-lost';
      const label = h.isDraw ? 'Нічия' : won ? 'Перемога' : 'Поразка';
      const div = document.createElement('div');
      div.className = 'history-item';
      div.innerHTML = `
        <span>${escapeHtml(h.challengerName)} vs ${escapeHtml(h.opponentName || '—')} (${h.round} раунд.)</span>
        <span class="${cls}">${label}</span>
      `;
      histEl.appendChild(div);
    });
  }
}

$('btn-pvp-create').addEventListener('click', async () => {
  try {
    const res = await api('/api/pvp/challenges', { method: 'POST' });
    state.pvpMyBattle = res.battle;
    showToast('Заявку на PvP створено');
    await loadPvpState();
  } catch (err) {
    showToast(err.message, true);
  }
});

$('btn-pvp-cancel').addEventListener('click', async () => {
  if (!state.pvpMyBattle) return;
  try {
    await api(`/api/pvp/challenges/${state.pvpMyBattle.id}/cancel`, { method: 'POST' });
    state.pvpMyBattle = null;
    showToast('Заявку скасовано');
    await loadPvpState();
  } catch (err) {
    showToast(err.message, true);
  }
});

$('btn-pvp-refresh').addEventListener('click', () => loadPvpState());

$('btn-pvp-turn').addEventListener('click', async () => {
  if (!state.pvpMyBattle) return;
  const attackZone = document.querySelector('input[name="pvpAttackZone"]:checked')?.value;
  const blockPair = document.querySelector('input[name="pvpBlockPair"]:checked')?.value;
  try {
    const res = await api(`/api/pvp/battles/${state.pvpMyBattle.id}/turn`, {
      method: 'POST',
      body: JSON.stringify({ attackZone, blockPair }),
    });
    state.pvpMyBattle = res.battle;
    state.user = res.user;
    renderCharacter();
    renderPvp();
  } catch (err) {
    showToast(err.message, true);
  }
});

$('btn-pvp-flee').addEventListener('click', async () => {
  if (!state.pvpMyBattle) return;
  try {
    const res = await api(`/api/pvp/battles/${state.pvpMyBattle.id}/flee`, { method: 'POST' });
    state.pvpMyBattle = res.battle;
    state.user = res.user;
    renderCharacter();
    renderPvp();
  } catch (err) {
    showToast(err.message, true);
  }
});

$('btn-pvp-back').addEventListener('click', async () => {
  state.pvpMyBattle = null;
  await loadPvpState();
});

// ==================== ADMIN PANEL (CRUD + UPGRADES) ====================

function switchAdminSubtab(sub) {
  ['users', 'bots', 'items', 'quiz', 'clans', 'details'].forEach((s) => {
    $(`admin-tab-${s}`).classList.toggle('active', s === sub);
    $(`admin-${s}-section`).classList.toggle('hidden', s !== sub);
  });
}

$('admin-tab-users').addEventListener('click', () => switchAdminSubtab('users'));
$('admin-tab-bots').addEventListener('click', () => switchAdminSubtab('bots'));
$('admin-tab-items').addEventListener('click', () => switchAdminSubtab('items'));

$('admin-tab-quiz').addEventListener('click', () => {
  switchAdminSubtab('quiz');
  loadAdminQuiz();
});
$('btn-refresh-quiz').addEventListener('click', () => loadAdminQuiz());

$('admin-tab-clans').addEventListener('click', () => {
  switchAdminSubtab('clans');
  loadAdminClans();
});
$('btn-refresh-clans').addEventListener('click', () => loadAdminClans());

$('admin-tab-details').addEventListener('click', () => {
  switchAdminSubtab('details');
  loadUserDetails();
});
$('btn-refresh-details').addEventListener('click', loadUserDetails);

function fmtDate(d) {
  return d ? new Date(d).toLocaleString('uk-UA') : '—';
}

async function loadUserDetails() {
  try {
    const data = await api('/api/admin/users-details');
    const tbody = $('admin-details-tbody');
    tbody.innerHTML = '';
    data.users.forEach((u) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(u.username)}</strong><br/><span class="muted">${u.role} • рів. ${u.level}</span></td>
        <td>${u.isBanned ? `<span class="badge badge-danger" title="${escapeHtml(u.banReason)}">заблоковано</span>` : '<span class="badge">активний</span>'}</td>
        <td>${escapeHtml(u.registerIp || '—')}<div class="ua-cell muted">${escapeHtml(u.registerUserAgent || '—')}</div></td>
        <td>${escapeHtml(u.lastIp || '—')}<div class="ua-cell muted">${escapeHtml(u.lastUserAgent || '—')}</div></td>
        <td>${fmtDate(u.lastLoginAt)}<br/><span class="muted">активність: ${fmtDate(u.lastSeenAt)}</span></td>
        <td>${u.loginCount}</td>
        <td>
          <button class="btn btn-ghost btn-xs" data-detail-id="${u.id}">Історія</button>
          <button class="btn btn-danger btn-xs" data-ban-id="${u.id}" data-banned="${u.isBanned}">${u.isBanned ? 'Розблокувати' : 'Заблокувати'}</button>
        </td>`;
      tbody.appendChild(tr);
    });
    tbody
      .querySelectorAll('[data-detail-id]')
      .forEach((btn) => btn.addEventListener('click', () => showUserDetail(btn.dataset.detailId)));
    tbody.querySelectorAll('[data-ban-id]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const banning = btn.dataset.banned !== 'true';
        const reason = banning ? prompt("Причина блокування (необов'язково):") : '';
        if (banning && reason === null) return;
        try {
          await api(`/api/admin/users/${btn.dataset.banId}/ban`, {
            method: 'POST',
            body: JSON.stringify({ banned: banning, reason }),
          });
          showToast(banning ? 'Користувача заблоковано' : 'Користувача розблоковано');
          loadUserDetails();
        } catch (err) {
          showToast(err.message, true);
        }
      }),
    );
  } catch (err) {
    showToast(err.message, true);
  }
}

async function showUserDetail(id) {
  try {
    const d = await api(`/api/admin/users/${id}/details`);
    const card = $('admin-user-detail-card');
    const u = d.user;
    card.classList.remove('hidden');
    card.innerHTML = `
      <h3>${escapeHtml(u.username)} — деталі</h3>
      <div class="details-grid">
        <div>ID: <code>${u.id}</code></div>
        <div>Створено: ${fmtDate(u.createdAt)}</div>
        <div>Перемог / Поразок: ${u.wins} / ${u.losses}</div>
        <div>Бої PvE: ${d.pveBattles} • PvP: ${d.pvpBattles}</div>
        <div>Золото: ${u.gold} • XP: ${u.xp}/${u.nextLevelXp}</div>
        <div>Відомі IP: ${d.knownIps.map(escapeHtml).join(', ') || '—'}</div>
      </div>
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>Час</th><th>Подія</th><th>IP</th><th>User-Agent</th></tr></thead>
        <tbody>${d.events
          .map(
            (e) =>
              `<tr><td>${fmtDate(e.createdAt)}</td><td>${escapeHtml(e.type)}</td><td>${escapeHtml(e.ip)}</td><td class="ua-cell">${escapeHtml(e.userAgent)}</td></tr>`,
          )
          .join('')}</tbody>
      </table></div>`;
    card.scrollIntoView({ behavior: 'smooth' });
  } catch (err) {
    showToast(err.message, true);
  }
}

$('btn-toggle-create-user').addEventListener('click', () => {
  $('create-user-form').classList.toggle('hidden');
});
$('btn-toggle-create-bot').addEventListener('click', () => {
  $('create-bot-form').classList.toggle('hidden');
});
$('btn-toggle-create-item').addEventListener('click', () => {
  $('create-item-form').classList.toggle('hidden');
});

async function loadAdminData() {
  try {
    const [uData, bData, iData] = await Promise.all([
      api('/api/admin/users'),
      api('/api/admin/bots'),
      api('/api/admin/items'),
    ]);
    state.adminUsers = uData.users;
    state.adminBots = bData.bots;
    state.adminItems = iData.items;
    renderAdminUsers();
    renderAdminBots();
    renderAdminItems();
  } catch (err) {
    showToast(err.message, true);
  }
}

function renderAdminUsers() {
  const tbody = $('admin-users-tbody');
  tbody.innerHTML = '';

  state.adminUsers.forEach((u) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(u.username)}</strong></td>
      <td><span class="badge">${u.role}</span></td>
      <td>Рів. ${u.level}<br/><span class="muted">${u.hp}/${u.maxHp} HP</span></td>
      <td>${u.gold}</td>
      <td>Сил: ${u.stats.strength} | Спр: ${u.stats.agility} | Інт: ${u.stats.intuition} | Вит: ${u.stats.endurance}</td>
      <td>
        <div class="upgrade-group">
          <button class="btn btn-ghost btn-xs" data-upg-id="${u.id}" data-upg-key="strength">+1 Сил</button>
          <button class="btn btn-ghost btn-xs" data-upg-id="${u.id}" data-upg-key="agility">+1 Спр</button>
          <button class="btn btn-ghost btn-xs" data-upg-id="${u.id}" data-upg-key="intuition">+1 Інт</button>
          <button class="btn btn-ghost btn-xs" data-upg-id="${u.id}" data-upg-key="endurance">+1 Вит</button>
          <button class="btn btn-primary btn-xs" data-upg-id="${u.id}" data-upg-key="level">+1 Рів</button>
          <button class="btn btn-ghost btn-xs" data-upg-id="${u.id}" data-upg-key="gold">+100 Зол</button>
        </div>
      </td>
      <td>
        <div class="action-group">
          <button class="btn btn-ghost btn-xs" data-edit-user="${u.id}">Ред.</button>
          <button class="btn btn-ghost btn-xs" data-avatar-user="${u.id}">Вигляд</button>
          <button class="btn btn-danger btn-xs" data-del-user="${u.id}">Видал.</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-upg-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.upgId;
      const key = btn.dataset.upgKey;
      const delta = key === 'gold' ? 100 : 1;
      try {
        const res = await api(`/api/admin/users/${id}/upgrade`, {
          method: 'POST',
          body: JSON.stringify({ [key]: delta, fullHeal: true }),
        });
        if (state.user && state.user.id === id) {
          state.user = res.user;
          renderCharacter();
        }
        showToast(`Покращено ${key} (+${delta}) для ${res.user.username}`);
        await loadAdminData();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });

  tbody.querySelectorAll('[data-avatar-user]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = state.adminUsers.find((x) => x.id === btn.dataset.avatarUser);
      if (!target) return;
      openAvatarEditor(target, {
        saveUrl: `/api/admin/users/${target.id}/avatar`,
        onSaved: (u) => {
          if (state.user && state.user.id === u.id) {
            state.user = u;
            renderCharacter();
          }
          loadAdminData();
        },
      });
    });
  });

  tbody.querySelectorAll('[data-edit-user]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = state.adminUsers.find((x) => x.id === btn.dataset.editUser);
      if (!target) return;
      openEditModal(target);
    });
  });

  tbody.querySelectorAll('[data-del-user]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Видалити цього персонажа?')) return;
      try {
        await api(`/api/admin/users/${btn.dataset.delUser}`, { method: 'DELETE' });
        showToast('Персонажа видалено');
        await loadAdminData();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });
}

$('create-user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify({
        username: fd.get('username'),
        password: fd.get('password'),
        role: fd.get('role'),
        level: Number(fd.get('level')),
        gold: Number(fd.get('gold')),
        stats: {
          strength: Number(fd.get('strength')),
          agility: Number(fd.get('agility')),
          intuition: Number(fd.get('intuition')),
          endurance: Number(fd.get('endurance')),
        },
      }),
    });
    e.target.reset();
    e.target.classList.add('hidden');
    showToast('Персонажа створено');
    await loadAdminData();
  } catch (err) {
    showToast(err.message, true);
  }
});

function openEditModal(user) {
  const form = $('edit-user-form');
  form.id.value = user.id;
  form.username.value = user.username;
  form.password.value = '';
  form.role.value = user.role;
  form.level.value = user.level;
  form.gold.value = user.gold;
  form.freeStats.value = user.freeStats;
  form.strength.value = user.stats.strength;
  form.agility.value = user.stats.agility;
  form.intuition.value = user.stats.intuition;
  form.endurance.value = user.stats.endurance;
  $('edit-modal-title').textContent = `Редагування: ${user.username}`;
  $('edit-modal').classList.remove('hidden');
}

$('btn-close-modal').addEventListener('click', () => {
  $('edit-modal').classList.add('hidden');
});

$('edit-user-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const id = form.id.value;
  try {
    const res = await api(`/api/admin/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        username: form.username.value.trim(),
        password: form.password.value || undefined,
        role: form.role.value,
        level: Number(form.level.value),
        gold: Number(form.gold.value),
        freeStats: Number(form.freeStats.value),
        stats: {
          strength: Number(form.strength.value),
          agility: Number(form.agility.value),
          intuition: Number(form.intuition.value),
          endurance: Number(form.endurance.value),
        },
        fullHeal: true,
      }),
    });
    if (state.user && state.user.id === id) {
      state.user = res.user;
      renderCharacter();
    }
    $('edit-modal').classList.add('hidden');
    showToast('Зміни збережено');
    await loadAdminData();
  } catch (err) {
    showToast(err.message, true);
  }
});

function renderAdminBots() {
  const tbody = $('admin-bots-tbody');
  tbody.innerHTML = '';

  state.adminBots.forEach((b) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(b.name)}</strong></td>
      <td>${escapeHtml(b.title)}</td>
      <td>Рів. ${b.level} / ${b.maxHp} HP</td>
      <td>+${b.rewardXp} XP, +${b.rewardGold} зол.</td>
      <td>Сил: ${b.stats.strength} | Спр: ${b.stats.agility} | Інт: ${b.stats.intuition} | Вит: ${b.stats.endurance}</td>
      <td>
        <div class="action-group">
          <button class="btn btn-ghost btn-xs" data-buff-bot="${b._id}">+2 Стати</button>
          <button class="btn btn-danger btn-xs" data-del-bot="${b._id}">Видал.</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-buff-bot]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const bot = state.adminBots.find((x) => x._id === btn.dataset.buffBot);
      if (!bot) return;
      try {
        await api(`/api/admin/bots/${bot._id}`, {
          method: 'PUT',
          body: JSON.stringify({
            level: bot.level + 1,
            stats: {
              strength: bot.stats.strength + 2,
              agility: bot.stats.agility + 2,
              intuition: bot.stats.intuition + 2,
              endurance: bot.stats.endurance + 2,
            },
          }),
        });
        showToast(`Бота ${bot.name} підсилено`);
        await loadAdminData();
        await loadGameState();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });

  tbody.querySelectorAll('[data-del-bot]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Видалити цього бота?')) return;
      try {
        await api(`/api/admin/bots/${btn.dataset.delBot}`, { method: 'DELETE' });
        showToast('Бота видалено');
        await loadAdminData();
        await loadGameState();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });
}

$('create-bot-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api('/api/admin/bots', {
      method: 'POST',
      body: JSON.stringify({
        name: fd.get('name'),
        title: fd.get('title'),
        level: Number(fd.get('level')),
        rewardXp: Number(fd.get('rewardXp')),
        rewardGold: Number(fd.get('rewardGold')),
        stats: {
          strength: Number(fd.get('strength')),
          agility: Number(fd.get('agility')),
          intuition: Number(fd.get('intuition')),
          endurance: Number(fd.get('endurance')),
        },
      }),
    });
    e.target.reset();
    e.target.classList.add('hidden');
    showToast('Нового бота створено');
    await loadAdminData();
    await loadGameState();
  } catch (err) {
    showToast(err.message, true);
  }
});

function renderAdminItems() {
  const tbody = $('admin-items-tbody');
  tbody.innerHTML = '';
  state.adminItems.forEach((it) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(it.name)}</strong></td>
      <td>${SLOT_LABELS[it.slot] || it.slot}</td>
      <td>${it.price} зол. / Рів. ${it.minLevel}</td>
      <td class="bonus-tag">${formatBonuses(it.bonuses)}</td>
      <td><button class="btn btn-danger btn-xs" data-del-item="${it._id}">Видал.</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-del-item]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Видалити цей предмет із магазину?')) return;
      try {
        await api(`/api/admin/items/${btn.dataset.delItem}`, { method: 'DELETE' });
        showToast('Предмет видалено');
        await loadAdminData();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });
}

$('create-item-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  try {
    await api('/api/admin/items', {
      method: 'POST',
      body: JSON.stringify({
        name: fd.get('name'),
        slot: fd.get('slot'),
        price: Number(fd.get('price')),
        minLevel: Number(fd.get('minLevel')),
        description: fd.get('description'),
        bonuses: {
          strength: Number(fd.get('strength')),
          agility: Number(fd.get('agility')),
          intuition: Number(fd.get('intuition')),
          endurance: Number(fd.get('endurance')),
          damageMin: Number(fd.get('damageMin')),
          damageMax: Number(fd.get('damageMax')),
          armor: Number(fd.get('armor')),
        },
      }),
    });
    e.target.reset();
    e.target.classList.add('hidden');
    showToast('Предмет додано до магазину');
    await loadAdminData();
  } catch (err) {
    showToast(err.message, true);
  }
});

// ==================== BOOTSTRAP ====================

async function loadGameState() {
  const [botsData, battlesData] = await Promise.all([
    api('/api/game/bots'),
    api('/api/game/battles/state'),
  ]);
  state.bots = botsData.bots;
  state.activeBattle = battlesData.activeBattle;
  state.history = battlesData.history;
  renderBots();
  renderHistory();
  renderBattle();
}

async function enterApp() {
  $('auth-screen').classList.add('hidden');
  $('app-screen').classList.remove('hidden');
  renderCharacter();
  connectChat();
  await loadGameState();
}

async function init() {
  if (!state.token) return;
  try {
    const data = await api('/api/auth/me');
    state.user = data.user;
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      localStorage.removeItem('combats_token');
      state.token = '';
    }
    return;
  }
  try {
    await enterApp();
  } catch (err) {
    console.error(err);
    showToast(err.message, true);
  }
}

init();
