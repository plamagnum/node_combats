const K_FACTOR = 32;

function expectedScore(ra, rb) {
  return 1 / (1 + 10 ** ((rb - ra) / 400));
}

// Elo для PvP: змінює rating у переданих документах (без збереження)
function applyElo(winner, loser) {
  const rw = winner.rating ?? 1000;
  const rl = loser.rating ?? 1000;
  const delta = Math.round(K_FACTOR * (1 - expectedScore(rw, rl)));
  winner.rating = rw + delta;
  loser.rating = Math.max(0, rl - delta);
  return delta;
}

module.exports = { applyElo, expectedScore, K_FACTOR };
