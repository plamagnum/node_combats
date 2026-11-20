const { parseQuizPayload, isCorrectSelection } = require('../src/services/quiz');

const ans = (n, correctIdx) =>
  Array.from({ length: n }, (_, i) => ({
    text: `${'абвгдежзик'[i]}) варіант ${i}`,
    is_correct: correctIdx.includes(i),
  }));
const batch = (questions) => ({ subject_id: 1, class_id: 1, topic_id: 1, questions });

describe('parseQuizPayload', () => {
  test('приймає рядок і об’єкт, прибирає префікси а) б)', () => {
    const obj = batch([{ text: 'Питання один?', answers: ans(4, [1]) }]);
    const fromText = parseQuizPayload(JSON.stringify(obj));
    expect(fromText.errors).toEqual([]);
    expect(fromText.docs[0].answers[0].text).toBe('варіант 0');
    expect(parseQuizPayload(obj).docs).toHaveLength(1);
  });

  test('до 4 варіантів — рівно одна правильна', () => {
    const r = parseQuizPayload(batch([{ text: 'Питання два?', answers: ans(4, [0, 1]) }]));
    expect(r.docs).toHaveLength(0);
    expect(r.errors).toHaveLength(1);
  });

  test('понад 4 варіанти — дозволено кілька правильних, але хоча б одна', () => {
    expect(
      parseQuizPayload(batch([{ text: 'Питання три?', answers: ans(5, [0, 3]) }])).docs,
    ).toHaveLength(1);
    expect(
      parseQuizPayload(batch([{ text: 'Питання три?', answers: ans(5, []) }])).errors,
    ).toHaveLength(1);
  });

  test('некоректний JSON і дублікати', () => {
    expect(parseQuizPayload('{oops').errors).toHaveLength(1);
    const q = { text: 'Однакове питання?', answers: ans(3, [0]) };
    const r = parseQuizPayload(batch([q, q]));
    expect(r.docs).toHaveLength(1);
    expect(r.errors).toHaveLength(1);
  });
});

describe('isCorrectSelection', () => {
  const question = {
    answers: [
      { _id: 'a', isCorrect: true },
      { _id: 'b', isCorrect: true },
      { _id: 'c', isCorrect: false },
    ],
  };
  test('потрібна точна множина правильних', () => {
    expect(isCorrectSelection(question, ['b', 'a'])).toBe(true);
    expect(isCorrectSelection(question, ['a'])).toBe(false);
    expect(isCorrectSelection(question, ['a', 'b', 'c'])).toBe(false);
  });
});
