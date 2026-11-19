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

// Командний Elo: зміна розраховується за середнім рейтингом команд
function teamEloDelta(winnerRatings, loserRatings) {
  const avg = (arr) => arr.reduce((s, r) => s + r, 0) / (arr.length || 1);
  return Math.round(K_FACTOR * (1 - expectedScore(avg(winnerRatings), avg(loserRatings))));
}

module.exports = { teamEloDelta, applyElo, expectedScore, K_FACTOR };
