/* =========================================================
   GOOGLE SHEET
   ========================================================= */

const SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRVy9kNb6JPXKhhKto_6tauXelFzXS4xOP61q-kaoqzvwVAE628_hXk26SZ-QP4sVQ5j1RiqO0cxxVn/pub?gid=0&single=true&output=csv";

/* =========================================================
   CACHE
   ========================================================= */

const CACHE_KEY = "quiz_training_questions_v4";

/* =========================================================
   GLOBALE VARIABLEN
   ========================================================= */

let QUIZZES = [];
let LEARNING_CARDS = [];

let currentQuiz = null;
let current = 0;
let points = 0;
let selected = [];
let wrongQuestions = [];
let openQuestions = [];

/* =========================================================
   LERNKARTEN VARIABLEN
   ========================================================= */

let currentLearningCategory = "";
let learningQueue = [];
let learningKnown = 0;
let learningUnknown = 0;
let learningCardFlipped = false;

/* =========================================================
   HTML ELEMENT
   ========================================================= */

const $ = id => document.getElementById(id);

/* =========================================================
   ARRAY MISCHEN
   ========================================================= */

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/* =========================================================
   CSV PARSER
   ========================================================= */

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && insideQuotes && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === ',' && !insideQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && next === '\n') {
        i++;
      }
      row.push(cell.trim());
      cell = "";

      if (row.some(x => x !== "")) {
        rows.push(row);
      }
      row = [];
    } else {
      cell += char;
    }
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell.trim());
    if (row.some(x => x !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

/* =========================================================
   GOOGLE SHEET IN QUIZ UND LERNKARTEN UMWANDELN
   ========================================================= */

function buildData(csv) {
  const rows = parseCSV(csv);

  if (rows.length < 2) {
    throw new Error("Das Google Sheet enthält keine Daten.");
  }

  const headers = rows[0].map(x => x.trim().toLowerCase());

  /* QUIZ SPALTEN */
  const quizIndex = headers.indexOf("quiz");
  const questionIndex = headers.indexOf("question");
  const typeIndex = headers.indexOf("type");
  const aIndex = headers.indexOf("a");
  const bIndex = headers.indexOf("b");
  const cIndex = headers.indexOf("c");
  const dIndex = headers.indexOf("d");
  const eIndex = headers.indexOf("e");
  const correctIndex = headers.indexOf("correct");
  const pointsIndex = headers.indexOf("points");
  const matchAIndex = headers.indexOf("matcha");
  const matchBIndex = headers.indexOf("matchb");
  const matchCIndex = headers.indexOf("matchc");
  const matchDIndex = headers.indexOf("matchd");
  const matchEIndex = headers.indexOf("matche");
  const caseIndex = headers.indexOf("case");
  const caseTitleIndex = headers.indexOf("case_title");
  const caseTextIndex = headers.indexOf("case_text");

  /* LERNKARTEN SPALTEN */
  const learningIndex = headers.indexOf("lernkarte");
  const cardQuestionIndex = headers.indexOf("card_question");
  const cardAnswerIndex = headers.indexOf("card_answer");

  if (quizIndex === -1 || questionIndex === -1 || typeIndex === -1 || correctIndex === -1) {
    throw new Error("Benötigte Quiz Spalten fehlen: quiz, question, type, correct");
  }

  /* QUIZ FRAGEN */
  const questions = rows
    .slice(1)
    .map((row, rowNumber) => {
      const type = row[typeIndex] ? row[typeIndex].trim().toLowerCase() : "single";

      /* NORMALE ANTWORTEN */
      const options = [];
      const normalColumns = [
        [aIndex, "A"],
        [bIndex, "B"],
        [cIndex, "C"],
        [dIndex, "D"],
        [eIndex, "E"]
      ];

      normalColumns.forEach(([index, id]) => {
        if (index !== -1 && row[index] && row[index].trim() !== "") {
          options.push({ id: id, text: row[index].trim() });
        }
      });

      /* RICHTIGE ANTWORTEN */
      const correct = row[correctIndex]
        ? row[correctIndex].split(",").map(x => x.trim().toUpperCase()).filter(Boolean)
        : [];

      /* ZUORDNUNG */
      const matching = [];
      if (type === "matching") {
        const terms = [
          [aIndex, matchAIndex],
          [bIndex, matchBIndex],
          [cIndex, matchCIndex],
          [dIndex, matchDIndex],
          [eIndex, matchEIndex]
        ];

        terms.forEach(([termIndex, matchIndex]) => {
          if (termIndex !== -1 && matchIndex !== -1 && row[termIndex] && row[matchIndex]) {
            matching.push({
              id: String.fromCharCode(65 + matching.length),
              term: row[termIndex].trim(),
              answer: row[matchIndex].trim()
            });
          }
        });
      }

      /* CASE */
      const caseValue = caseIndex !== -1 && row[caseIndex] ? row[caseIndex].trim().toLowerCase() : "";
      const caseTitle = caseTitleIndex !== -1 && row[caseTitleIndex] ? row[caseTitleIndex].trim() : "";
      const caseText = caseTextIndex !== -1 && row[caseTextIndex] ? row[caseTextIndex].trim() : "";

      return {
        quiz: row[quizIndex] ? row[quizIndex].trim() : "",
        question: row[questionIndex] ? row[questionIndex].trim() : "",
        type: type,
        options: options,
        correct: correct,
        matching: matching,
        points: row[pointsIndex] && !isNaN(Number(row[pointsIndex])) ? Number(row[pointsIndex]) : 1,
        case: caseValue,
        case_title: caseTitle,
        case_text: caseText,
        originalOrder: rowNumber
      };
    })
    .filter(q =>
      q.quiz &&
      q.question &&
      (q.type === "open" || q.type === "matching" || (q.options.length > 0 && q.correct.length > 0))
    );

  /* QUIZZES GRUPPIEREN */
  const quizMap = {};

  questions.forEach(q => {
    if (!quizMap[q.quiz]) {
      quizMap[q.quiz] = [];
    }
    quizMap[q.quiz].push(q);
  });

  const quizzes = Object.keys(quizMap).map(quizName => ({
    id: quizName.toLowerCase().replace(/[^a-z0-9äöü]+/gi, "-"),
    title: quizName,
    description: quizName + " – Grundlagen",
    active: true,
    questions: quizMap[quizName]
  }));

  /* LERNKARTEN EINLESEN */
  const learningCards = [];

  if (learningIndex !== -1 && cardQuestionIndex !== -1 && cardAnswerIndex !== -1) {
    rows.slice(1).forEach((row, rowNumber) => {
      const category = row[learningIndex] ? row[learningIndex].trim() : "";
      const question = row[cardQuestionIndex] ? row[cardQuestionIndex].trim() : "";
      const answer = row[cardAnswerIndex] ? row[cardAnswerIndex].trim() : "";

      if (category && question && answer) {
        learningCards.push({
          id: "card-" + rowNumber,
          category: category,
          question: question,
          answer: answer
        });
      }
    });
  }

  return { quizzes: quizzes, learningCards: learningCards };
}

/* =========================================================
   CACHE LADEN
   ========================================================= */

function loadFromCache() {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) {
      return false;
    }

    const data = JSON.parse(cached);
    if (!data || !Array.isArray(data.quizzes)) {
      return false;
    }

    QUIZZES = data.quizzes;
    LEARNING_CARDS = Array.isArray(data.learningCards) ? data.learningCards : [];

    return true;
  } catch (error) {
    console.warn("Cache konnte nicht gelesen werden.", error);
    return false;
  }
}

/* =========================================================
   GOOGLE SHEET AKTUALISIEREN
   ========================================================= */

async function updateFromGoogle() {
  try {
    const url = SHEET_URL + "&t=" + Date.now();
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error("Google Sheet konnte nicht geladen werden.");
    }

    const csv = await response.text();
    const data = buildData(csv);

    if (!data.quizzes.length && !data.learningCards.length) {
      throw new Error("Keine gültigen Quizze oder Lernkarten gefunden.");
    }

    QUIZZES = data.quizzes;
    LEARNING_CARDS = data.learningCards;

    localStorage.setItem(CACHE_KEY, JSON.stringify({ quizzes: QUIZZES, learningCards: LEARNING_CARDS }));

    if (!$('home').classList.contains('hidden')) {
      renderHome();
    }

    $('status').textContent = "Fragen und Lernkarten aktualisiert";

    setTimeout(() => {
      $('status').textContent = "";
    }, 3000);
  } catch (error) {
    console.warn("Google Sheet Update fehlgeschlagen:", error);

    if (QUIZZES.length > 0 || LEARNING_CARDS.length > 0) {
      $('status').textContent = "Gespeicherte Version verwendet";
    } else {
      $('quizList').innerHTML = `
        <div class="card">
          <h2>Fehler beim Laden</h2>
          <p class="muted">Die Fragen konnten nicht geladen werden.</p>
          <p class="small error">${escapeHtml(error.message)}</p>
        </div>
      `;
    }
  }
}

/* =========================================================
   START
   ========================================================= */

function init() {
  const hasCache = loadFromCache();

  if (hasCache) {
    renderHome();
  }

  updateFromGoogle();
}

init();

/* =========================================================
   SEITEN WECHSELN
   ========================================================= */

function show(id) {
  ['home', 'quiz', 'result', 'learning'].forEach(x => {
    $(x).classList.toggle('hidden', x !== id);
  });
}

/* =========================================================
   HOME
   ========================================================= */

function showHome() {
  show('home');
  $('title').textContent = 'Meine Quizze';
  renderHome();
}

/* =========================================================
   QUIZ AUSWAHL
   ========================================================= */

function renderHome() {
  $('title').textContent = 'Meine Quizze';

  /* QUIZZES */
  if (QUIZZES.length === 0) {
    $('quizList').innerHTML = `
      <div class="card">
        <p class="muted">Keine Quizze gefunden.</p>
      </div>
    `;
  } else {
    $('quizList').innerHTML = QUIZZES
      .filter(q => q.active !== false)
      .map(q => `
        <div class="card">
          <h2>${escapeHtml(q.title)}</h2>
          <p class="muted">${escapeHtml(q.description || '')}</p>
          <span class="badge">${q.questions.length} Fragen</span>
          <button class="btn" onclick="startQuiz('${escapeAttr(q.id)}')">Quiz starten</button>
        </div>
      `)
      .join('');
  }

  /* LERNKARTEN */
  renderLearningList();
}

/* =========================================================
   LERNKARTEN AUSWAHL
   ========================================================= */

function renderLearningList() {
  const container = $('learningList');

  if (LEARNING_CARDS.length === 0) {
    container.innerHTML = `
      <div class="card">
        <p class="muted">Noch keine Lernkarten vorhanden.</p>
        <p class="small muted">Ergänze im Google Sheet die Spalten lernkarte, card_question und card_answer.</p>
      </div>
    `;
    return;
  }

  const categories = {};

  LEARNING_CARDS.forEach(card => {
    if (!categories[card.category]) {
      categories[card.category] = [];
    }
    categories[card.category].push(card);
  });

  container.innerHTML = Object.keys(categories)
    .map(category => `
      <div class="card">
        <h2>${escapeHtml(category)}</h2>
        <span class="badge">${categories[category].length} Lernkarten</span>
        <button class="btn" onclick="startLearning('${escapeAttr(category)}')">Lernkarten starten</button>
      </div>
    `)
    .join('');
}

/* =========================================================
   QUIZ STARTEN
   ========================================================= */

function startQuiz(id) {
  const originalQuiz = QUIZZES.find(q => q.id === id);
  if (!originalQuiz) {
    return;
  }

  const caseQuestions = originalQuiz.questions.filter(q => q.case);
  const normalQuestions = originalQuiz.questions.filter(q => !q.case);
  const shuffledNormal = shuffle(normalQuestions);
  const orderedQuestions = [...shuffledNormal, ...caseQuestions];

  currentQuiz = {
    ...originalQuiz,
    questions: orderedQuestions.map(q => {
      /* OFFENE FRAGE */
      if (q.type === "open") {
        return { ...q };
      }

      /* ZUORDNUNG */
      if (q.type === "matching") {
        return { ...q, matching: q.matching.map(item => ({ ...item })) };
      }

      /* SINGLE / MULTI */
      const shuffledOptions = shuffle(q.options);

      const newOptions = shuffledOptions.map((option, index) => ({
        ...option,
        id: String.fromCharCode(65 + index)
      }));

      const newCorrect = shuffledOptions
        .map((option, index) => ({ oldId: option.id, newId: String.fromCharCode(65 + index) }))
        .filter(x => q.correct.includes(x.oldId))
        .map(x => x.newId);

      return { ...q, options: newOptions, correct: newCorrect };
    })
  };

  current = 0;
  points = 0;
  selected = [];
  wrongQuestions = [];
  openQuestions = [];

  $('title').textContent = currentQuiz.title;

  show('quiz');
  renderQuestion();
}

/* =========================================================
   CASE ANZEIGEN
   ========================================================= */

function renderCase(q) {
  const container = $('caseContainer');

  if (!q.case) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <div class="case-box">
      ${q.case_title ? `<div class="case-title">${escapeHtml(q.case_title)}</div>` : ""}
      ${q.case_text ? `<div class="case-text">${escapeHtml(q.case_text)}</div>` : ""}
    </div>
  `;
}

/* =========================================================
   FRAGE ANZEIGEN
   ========================================================= */

function renderQuestion() {
  const q = currentQuiz.questions[current];

  selected = [];

  $('counter').textContent = `Frage ${current + 1} von ${currentQuiz.questions.length}`;
  $('bar').style.width = (current / currentQuiz.questions.length * 100) + '%';

  renderCase(q);

  $('question').textContent = q.question;

  $('nextBtn').textContent =
    current === currentQuiz.questions.length - 1 ? 'Ergebnis anzeigen' : 'Weiter';

  /* OFFENE FRAGE */
  if (q.type === "open") {
    $('typeHint').textContent = "Offene Frage";

    $('options').innerHTML = `
      <textarea id="openAnswer" placeholder="Schreibe deine Antwort hier ..." oninput="checkOpenAnswer()"></textarea>
    `;

    $('nextBtn').disabled = true;
    return;
  }

  /* ZUORDNUNG */
  if (q.type === "matching") {
    $('typeHint').textContent = "Schreibe den Buchstaben der richtigen Antwort in das Feld";

    const answers = shuffle(q.matching);

    const answerMap = answers.map((item, index) => ({
      letter: String.fromCharCode(65 + index),
      answer: item.answer,
      originalId: item.id
    }));

    q.answerMap = answerMap;

    let html = `<div class="matching-list">`;

    q.matching.forEach((item, index) => {
      html += `
        <div class="matching-row">
          <div class="matching-term">${escapeHtml(item.term)}</div>
          <input class="matching-input" type="text" maxlength="1" autocomplete="off" data-index="${index}" oninput="handleMatchingInput(this)">
        </div>
      `;
    });

    html += `</div><div class="matching-answers"><h3>Antwortmöglichkeiten</h3>`;

    answerMap.forEach(item => {
      html += `
        <div class="matching-answer">
          <span class="matching-letter">${item.letter}</span>
          ${escapeHtml(item.answer)}
        </div>
      `;
    });

    html += `</div>`;

    $('options').innerHTML = html;
    $('nextBtn').disabled = true;
    return;
  }

  /* SINGLE / MULTI */
  $('typeHint').textContent = q.type === 'multi' ? 'Mehrere Antworten möglich' : 'Eine Antwort auswählen';

  $('options').innerHTML = q.options
    .map((o, i) => `
      <label class="option" id="opt${i}">
        <input type="${q.type === 'multi' ? 'checkbox' : 'radio'}" name="answer" value="${escapeAttr(o.id)}" onchange="choose(this)">
        <span><b>${escapeHtml(o.id)}.</b> ${escapeHtml(o.text)}</span>
      </label>
    `)
    .join('');

  $('nextBtn').disabled = true;
}

/* =========================================================
   ZUORDNUNG EINGABE
   ========================================================= */

function handleMatchingInput(input) {
  input.value = input.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 1);

  const inputs = [...document.querySelectorAll('.matching-input')];
  const allFilled = inputs.every(x => x.value.trim() !== "");

  const q = currentQuiz.questions[current];
  const validLetters = q.answerMap.map(x => x.letter);
  const allValid = inputs.every(x => validLetters.includes(x.value));

  $('nextBtn').disabled = !allFilled || !allValid;
}

/* =========================================================
   OFFENE FRAGE
   ========================================================= */

function checkOpenAnswer() {
  const input = $('openAnswer');
  if (!input) {
    return;
  }
  $('nextBtn').disabled = input.value.trim().length === 0;
}

/* =========================================================
   SINGLE / MULTI
   ========================================================= */

function choose(input) {
  const q = currentQuiz.questions[current];

  if (q.type === 'multi') {
    selected = [...document.querySelectorAll('input[name=answer]:checked')].map(x => x.value);
  } else {
    selected = [input.value];
  }

  document.querySelectorAll('.option').forEach((el, i) => {
    const id = q.options[i].id;
    el.classList.toggle('selected', selected.includes(id));
  });

  $('nextBtn').disabled = selected.length === 0;
}

/* =========================================================
   NÄCHSTE FRAGE
   ========================================================= */

function nextQuestion() {
  const q = currentQuiz.questions[current];

  /* OFFENE FRAGE */
  if (q.type === "open") {
    const answer = $('openAnswer') ? $('openAnswer').value.trim() : "";

    openQuestions.push({
      question: q.question,
      answer: answer,
      correct: q.correct.join(", "),
      points: q.points || 1,
      case_title: q.case_title || "",
      case_text: q.case_text || ""
    });

    current++;

    if (current >= currentQuiz.questions.length) {
      showResult();
    } else {
      renderQuestion();
    }

    return;
  }

  /* ZUORDNUNG */
  if (q.type === "matching") {
    const inputs = [...document.querySelectorAll('.matching-input')];

    let correctCount = 0;
    const userMatches = [];

    q.matching.forEach((item, index) => {
      const chosenLetter = inputs[index] ? inputs[index].value.toUpperCase() : "";
      const selectedAnswer = q.answerMap.find(x => x.letter === chosenLetter);
      const chosenText = selectedAnswer ? selectedAnswer.answer : "";
      const isCorrect = selectedAnswer && selectedAnswer.originalId === item.id;

      if (isCorrect) {
        correctCount++;
      }

      userMatches.push({
        term: item.term,
        chosen: chosenText,
        chosenLetter: chosenLetter,
        correct: item.answer
      });
    });

    points += correctCount;

    if (correctCount < q.matching.length) {
      wrongQuestions.push({
        type: "matching",
        question: q.question,
        matches: userMatches,
        points: correctCount,
        maxPoints: q.matching.length,
        case_title: q.case_title || "",
        case_text: q.case_text || ""
      });
    }

    current++;

    if (current >= currentQuiz.questions.length) {
      showResult();
    } else {
      renderQuestion();
    }

    return;
  }

  /* SINGLE / MULTI */
  const correct = [...q.correct].sort();
  const chosen = [...selected].sort();
  const ok = correct.length === chosen.length && correct.every((x, i) => x === chosen[i]);

  if (ok) {
    points += q.points || 1;
  } else {
    wrongQuestions.push({
      type: "choice",
      question: q.question,
      options: q.options,
      correct: q.correct,
      selected: [...selected],
      case_title: q.case_title || "",
      case_text: q.case_text || ""
    });
  }

  current++;

  if (current >= currentQuiz.questions.length) {
    showResult();
  } else {
    renderQuestion();
  }
}

/* =========================================================
   ERGEBNIS
   ========================================================= */

function showResult() {
  show('result');

  const automaticMax = currentQuiz.questions.reduce((sum, q) => {
    if (q.type === "open") {
      return sum;
    }
    if (q.type === "matching") {
      return sum + q.matching.length;
    }
    return sum + (q.points || 1);
  }, 0);

  const pct = automaticMax ? Math.round(points / automaticMax * 100) : 0;

  $('resultTitle').textContent = currentQuiz.title + ' abgeschlossen';
  $('score').textContent = `${points} / ${automaticMax}`;

  if (openQuestions.length > 0) {
    $('resultText').textContent =
      `${pct}% automatisch richtig. ${openQuestions.length} offene Frage(n) müssen manuell bewertet werden.`;
  } else {
    $('resultText').textContent = `${pct}% richtig.`;
  }

  renderWrongQuestions();
}

/* =========================================================
   FALSCHE FRAGEN
   ========================================================= */

function renderWrongQuestions() {
  let html = "";

  /* SINGLE / MULTI */
  wrongQuestions
    .filter(item => item.type === "choice")
    .forEach(item => {
      html += `
        <div class="result-box result-wrong">
          ${item.case_title ? `
            <div class="case-box">
              <div class="case-title">${escapeHtml(item.case_title)}</div>
              <div class="case-text">${escapeHtml(item.case_text)}</div>
            </div>
          ` : ""}

          <h3>❌ Falsche Frage</h3>
          <p><b>${escapeHtml(item.question)}</b></p>

          <div class="answer-label">Deine Antwort</div>
          <div class="answer-text">
            ${item.selected.length
              ? item.selected
                  .map(id => {
                    const option = item.options.find(o => o.id === id);
                    return option ? escapeHtml(id + ". " + option.text) : escapeHtml(id);
                  })
                  .join(", ")
              : "Keine Antwort"}
          </div>

          <div class="answer-label">Richtige Antwort</div>
          <div class="answer-text">
            ${item.correct
              .map(id => {
                const option = item.options.find(o => o.id === id);
                return option ? escapeHtml(id + ". " + option.text) : escapeHtml(id);
              })
              .join(", ")}
          </div>
        </div>
      `;
    });

  /* ZUORDNUNG */
  wrongQuestions
    .filter(item => item.type === "matching")
    .forEach(item => {
      html += `
        <div class="result-box result-wrong">
          ${item.case_title ? `
            <div class="case-box">
              <div class="case-title">${escapeHtml(item.case_title)}</div>
              <div class="case-text">${escapeHtml(item.case_text)}</div>
            </div>
          ` : ""}

          <h3>❌ Zuordnungsfrage</h3>
          <p><b>${escapeHtml(item.question)}</b></p>
          <p class="small">${item.points} von ${item.maxPoints} Zuordnungen richtig.</p>

          ${item.matches
            .map(match => `
              <div class="result-match">
                <b>${escapeHtml(match.term)}</b> →
                ${match.chosen ? escapeHtml(match.chosenLetter + " " + match.chosen) : "Keine Antwort"}
                ${match.chosen === match.correct
                  ? " ✅"
                  : ` ❌<br><span class="small">Richtig: ${escapeHtml(match.correct)}</span>`}
              </div>
            `)
            .join('')}
        </div>
      `;
    });

  /* OFFENE FRAGEN */
  openQuestions.forEach(item => {
    html += `
      <div class="result-box result-open">
        ${item.case_title ? `
          <div class="case-box">
            <div class="case-title">${escapeHtml(item.case_title)}</div>
            <div class="case-text">${escapeHtml(item.case_text)}</div>
          </div>
        ` : ""}

        <h3>✍️ Offene Frage</h3>
        <p><b>${escapeHtml(item.question)}</b></p>

        <div class="answer-label">Deine Antwort</div>
        <div class="answer-text">${item.answer ? escapeHtml(item.answer) : "Keine Antwort"}</div>

        <div class="answer-label">Musterlösung</div>
        <div class="answer-text">${item.correct ? escapeHtml(item.correct) : "Keine Musterlösung hinterlegt."}</div>

        <span class="badge">Manuell bewerten</span>
      </div>
    `;
  });

  /* ALLES RICHTIG */
  if (wrongQuestions.length === 0 && openQuestions.length === 0) {
    html = `
      <div class="result-box result-correct">
        <h3>🎉 Alles richtig!</h3>
        <p class="muted">Du hast alle automatisch bewertbaren Fragen richtig beantwortet.</p>
      </div>
    `;
  }

  $('wrongQuestions').innerHTML = html;
}

/* =========================================================
   QUIZ NEU STARTEN
   ========================================================= */

function restart() {
  startQuiz(currentQuiz.id);
}

/* =========================================================
   LERNKARTEN STARTEN
   ========================================================= */

function startLearning(category) {
  currentLearningCategory = category;

  const cards = LEARNING_CARDS.filter(card => card.category === category);

  if (cards.length === 0) {
    return;
  }

  learningQueue = shuffle(cards);
  learningKnown = 0;
  learningUnknown = 0;
  learningCardFlipped = false;

  $('title').textContent = category;

  show('learning');
  renderLearningCard();
}

/* =========================================================
   LERNKARTE ANZEIGEN
   ========================================================= */

function renderLearningCard() {
  const area = $('learningCardArea');

  $('learningCategory').textContent = currentLearningCategory;

  updateLearningStats();

  if (learningQueue.length === 0) {
    renderLearningComplete();
    return;
  }

  const card = learningQueue[0];
  learningCardFlipped = false;

  $('learningCounter').textContent =
    `Noch ${learningQueue.length} Karte${learningQueue.length === 1 ? '' : 'n'}`;

  const totalForProgress = learningKnown + learningUnknown + learningQueue.length;
  const completed = learningKnown;
  const progress = totalForProgress > 0 ? (completed / totalForProgress * 100) : 0;

  $('learningBar').style.width = progress + '%';

  area.innerHTML = `
    <div class="learning-card" id="activeLearningCard" onclick="flipLearningCard()">
      <div class="learning-card-inner">
        <div class="learning-card-front">
          <div class="learning-card-label">Frage</div>
          <div class="learning-card-question">${escapeHtml(card.question)}</div>
          <div class="learning-card-hint">Tippe auf die Karte für die Antwort</div>
        </div>
        <div class="learning-card-back">
          <div class="learning-card-label">Antwort</div>
          <div class="learning-card-answer">${escapeHtml(card.answer)}</div>
          <div class="learning-card-hint">Hast du es gewusst?</div>
        </div>
      </div>
    </div>
  `;

  $('learningNoBtn').disabled = true;
  $('learningYesBtn').disabled = true;

  // Kartenhöhe an den tatsächlichen Inhalt anpassen (Fix: lange Antworten
  // überdecken sonst die "Weiß ich" / "Weiß ich nicht" Buttons darunter).
  requestAnimationFrame(adjustLearningCardHeight);
}

/* =========================================================
   KARTENHÖHE AN INHALT ANPASSEN (FIX)
   ========================================================= */

function adjustLearningCardHeight() {
  const wrapper = $('activeLearningCard');
  if (!wrapper) {
    return;
  }

  const inner = wrapper.querySelector('.learning-card-inner');
  const front = wrapper.querySelector('.learning-card-front');
  const back = wrapper.querySelector('.learning-card-back');

  if (!inner || !front || !back) {
    return;
  }

  // Höhe kurz zurücksetzen, damit die tatsächliche Inhaltshöhe (scrollHeight)
  // korrekt gemessen werden kann, auch wenn vorher schon eine feste Höhe gesetzt war.
  front.style.height = 'auto';
  back.style.height = 'auto';

  // Vorder- und Rückseite sind position:absolute (nötig für die Flip-Animation),
  // daher wächst der Container sonst nicht mit, wenn die Antwort länger ist als die Frage.
  const contentHeight = Math.max(front.scrollHeight, back.scrollHeight);

  wrapper.style.minHeight = contentHeight + 'px';
  inner.style.minHeight = contentHeight + 'px';
  front.style.height = contentHeight + 'px';
  back.style.height = contentHeight + 'px';
}

// Bei Größenänderung des Fensters (z. B. Drehung des Handys) neu berechnen.
window.addEventListener('resize', () => {
  if ($('activeLearningCard')) {
    adjustLearningCardHeight();
  }
});

/* =========================================================
   LERNKARTE UMDREHEN
   ========================================================= */

function flipLearningCard() {
  const card = $('activeLearningCard');
  if (!card) {
    return;
  }

  learningCardFlipped = !learningCardFlipped;
  card.classList.toggle('flipped', learningCardFlipped);

  $('learningNoBtn').disabled = !learningCardFlipped;
  $('learningYesBtn').disabled = !learningCardFlipped;
}

/* =========================================================
   LERNKARTE BEWERTEN
   ========================================================= */

function rateLearningCard(known) {
  if (!learningCardFlipped) {
    return;
  }

  if (learningQueue.length === 0) {
    return;
  }

  const currentCard = learningQueue.shift();

  if (known) {
    learningKnown++;
  } else {
    learningUnknown++;
    learningQueue.push(currentCard);
  }

  renderLearningCard();
}

/* =========================================================
   LERNSTATISTIK
   ========================================================= */

function updateLearningStats() {
  $('learningKnown').textContent = learningKnown;
  $('learningUnknown').textContent = learningUnknown;
}

/* =========================================================
   LERNKARTEN ABSCHLUSS
   ========================================================= */

function renderLearningComplete() {
  const area = $('learningCardArea');

  $('learningCounter').textContent = "Lernrunde abgeschlossen";
  $('learningBar').style.width = "100%";

  area.innerHTML = `
    <div class="learning-complete">
      <div class="badge">🎉 Geschafft</div>
      <h2>Alle Karten gewusst</h2>
      <div class="learning-complete-score">${learningKnown}</div>
      <p class="muted">Karten in dieser Lernrunde gewusst.</p>
    </div>
  `;

  $('learningNoBtn').disabled = true;
  $('learningYesBtn').disabled = true;
}

/* =========================================================
   HTML SICHER ESCAPEN
   ========================================================= */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[m]));
}

function escapeAttr(s) {
  return escapeHtml(s);
}
