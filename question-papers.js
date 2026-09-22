const firebaseConfigParts = [
  "edutrack-admin",
  "firebaseapp",
  "AIzaSyAFpwi3k7Qth9MiqqRGKstY0Zkj_vrcdFY",
  "193864081571",
  "1:193864081571:web:7501afde01291f81e61f16",
  "com",
  "storage",
  "app",
];

const firebaseConfig = {
  apiKey: firebaseConfigParts[2],
  authDomain: `${firebaseConfigParts[0]}.${firebaseConfigParts[1]}.${firebaseConfigParts[5]}`,
  projectId: firebaseConfigParts[0],
  storageBucket: `${firebaseConfigParts[0]}.${firebaseConfigParts[1]}${firebaseConfigParts[6]}.${firebaseConfigParts[7]}`,
  messagingSenderId: firebaseConfigParts[3],
  appId: firebaseConfigParts[4],
};

if (!firebase.apps || firebase.apps.length === 0) {
  firebase.initializeApp(firebaseConfig);
}

const firestore = firebase.firestore();
const auth = firebase.auth();

const listContentEl = document.getElementById("question-papers-content");
const listSubtitleEl = document.getElementById("question-papers-subtitle");
const listSearchEl = document.getElementById("question-papers-search");
const listSortEl = document.getElementById("question-papers-sort");
const listRefreshBtn = document.getElementById("question-papers-refresh");
const createQuestionPaperBtn = document.getElementById("create-question-paper-btn");
const importModalEl = document.getElementById("questionPaperImportModal");
const importNameEl = document.getElementById("question-paper-import-name");
const importFileEl = document.getElementById("question-paper-import-file");
const importCsvEl = document.getElementById("question-paper-import-csv");
const importMessageEl = document.getElementById("question-paper-import-message");
const importPreviewEl = document.getElementById("question-paper-import-preview");
const importSummaryEl = document.getElementById("question-paper-import-summary");
const importPreviewBodyEl = document.getElementById("question-paper-import-preview-body");
const previewImportBtn = document.getElementById("question-paper-preview-import-btn");
const confirmImportBtn = document.getElementById("question-paper-confirm-import-btn");

const detailContentEl = document.getElementById("question-paper-detail-content");
const detailSubtitleEl = document.getElementById("question-paper-detail-subtitle");
const detailSearchEl = document.getElementById("question-detail-search");
const detailSubjectEl = document.getElementById("question-detail-subject");
const detailExportCsvBtn = document.getElementById("question-paper-export-csv");

let questionPapers = [];
let currentQuestionPaper = null;
let currentQuestions = [];
let currentUser = null;
let pendingQuestionPaperImport = null;

const QUESTION_PAPER_IMPORT_COLUMNS = [
  "question",
  "option1",
  "option2",
  "option3",
  "option4",
  "correct_option",
  "subject",
  "chapter",
  "topic",
  "subtopic",
  "class",
  "correct_answer_logic",
];

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeComparable(value) {
  return normalizeText(value).toLowerCase();
}

function sanitizeRichHtml(value) {
  const raw = normalizeText(value);
  if (!raw) return "";

  const template = document.createElement("template");
  template.innerHTML = raw;
  const allowedTags = new Set(["B", "BR", "EM", "I", "LI", "OL", "P", "SPAN", "STRONG", "SUB", "SUP", "U", "UL"]);
  const droppedTags = new Set(["IFRAME", "OBJECT", "SCRIPT", "STYLE", "TEMPLATE"]);

  const cleanNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent || "");
    if (node.nodeType !== Node.ELEMENT_NODE) return document.createTextNode("");
    if (droppedTags.has(node.tagName)) return document.createTextNode("");

    const children = Array.from(node.childNodes).map(cleanNode);
    if (!allowedTags.has(node.tagName)) {
      const fragment = document.createDocumentFragment();
      children.forEach((child) => fragment.appendChild(child));
      return fragment;
    }

    const clone = document.createElement(node.tagName.toLowerCase());
    children.forEach((child) => clone.appendChild(child));
    return clone;
  };

  const fragment = document.createDocumentFragment();
  Array.from(template.content.childNodes).forEach((node) => fragment.appendChild(cleanNode(node)));
  const wrapper = document.createElement("div");
  wrapper.appendChild(fragment);
  return wrapper.innerHTML;
}

function plainTextFromRichHtml(value) {
  const raw = normalizeText(value);
  if (!raw) return "";
  const template = document.createElement("template");
  template.innerHTML = sanitizeRichHtml(raw);
  return (template.content.textContent || raw).replace(/\s+/g, " ").trim();
}

function escapeCSV(value) {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowsToCSV(rows) {
  return rows.map((row) => row.map(escapeCSV).join(",")).join("\n");
}

function downloadCSV(filename, csv) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function getSafeFilenamePart(value, fallback = "question-paper") {
  return normalizeText(value, fallback)
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || fallback;
}

function setImportMessage(message, type = "muted") {
  if (!importMessageEl) return;
  importMessageEl.innerHTML = String(message || "");
  importMessageEl.className = `small mb-3 text-${type}`;
}

function resetQuestionPaperImportModal() {
  pendingQuestionPaperImport = null;
  if (importNameEl) importNameEl.value = "";
  if (importFileEl) importFileEl.value = "";
  if (importCsvEl) importCsvEl.value = "";
  if (importPreviewEl) importPreviewEl.classList.add("d-none");
  if (importPreviewBodyEl) importPreviewBodyEl.innerHTML = "";
  if (importSummaryEl) importSummaryEl.textContent = "";
  if (confirmImportBtn) confirmImportBtn.disabled = true;
  setImportMessage("Paste CSV or choose a CSV file, then preview before saving.");
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const input = String(text || "").replace(/^\uFEFF/, "");

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const nextChar = input[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => normalizeText(value))) rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  row.push(cell);
  if (row.some((value) => normalizeText(value))) rows.push(row);
  return rows;
}

function getNormalizedHeaderName(value) {
  return normalizeComparable(value).replace(/\s+/g, "_");
}

function getCSVRecords(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) {
    throw new Error("CSV must include a header row and at least one question row.");
  }

  const headers = rows[0].map(getNormalizedHeaderName);
  const missingColumns = QUESTION_PAPER_IMPORT_COLUMNS.filter((column) => !headers.includes(column));
  if (missingColumns.length > 0) {
    throw new Error(`Missing required column(s): ${missingColumns.join(", ")}`);
  }

  return rows.slice(1).map((row, rowIndex) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = normalizeText(row[index]);
    });
    record.__csvRowNumber = rowIndex + 2;
    return record;
  }).filter((record) => Object.keys(record).some((key) => !key.startsWith("__") && normalizeText(record[key])));
}

function getCorrectOptionNumbersFromImport(value) {
  return uniqueSortedOptionNumbers(getOptionNumbersFromValue(value));
}

function buildQuestionFromImportRecord(record, index) {
  const correctOptions = getCorrectOptionNumbersFromImport(record.correct_option);
  const correctLettersLower = correctOptions.map((optionNumber) => getOptionLetter(optionNumber).toLowerCase()).join("");
  const correctLettersUpper = correctLettersLower.toUpperCase();
  const selectedTexts = correctOptions
    .map((optionNumber) => record[`option${optionNumber}`])
    .filter(Boolean);
  const subject = normalizeText(record.subject, "General");

  return {
    subjectname_questionnumber: `${subject}_Q${index + 1}`,
    questionNumber: index + 1,
    Question: record.question,
    question: record.question,
    questionText: record.question,
    "Option 1": record.option1,
    "Option 2": record.option2,
    "Option 3": record.option3,
    "Option 4": record.option4,
    "Correct Option": correctOptions.length === 1 ? correctOptions[0] : correctOptions.join(","),
    "Correct Options": correctOptions,
    CorrectAnswer: correctLettersUpper,
    correctAnswer: correctLettersLower,
    Answer: selectedTexts.join(" | "),
    Subject: subject,
    subject,
    Chapter: record.chapter,
    chapter: record.chapter,
    Topic: record.topic,
    topic: record.topic,
    Subtopic: record.subtopic,
    subtopic: record.subtopic,
    Class: record.class,
    class: record.class,
    feedbackCorrectAnswer: record.correct_answer_logic,
    feedback: record.correct_answer_logic,
    explanation: record.correct_answer_logic,
    sourceCsvRowNumber: record.__csvRowNumber,
  };
}

function validateImportedQuestions(questions) {
  if (questions.length === 0) {
    throw new Error("No question rows found in the CSV.");
  }

  const invalidRows = questions
    .map((question, index) => ({ question, index }))
    .map(({ question, index }) => {
      const hasOptions = [1, 2, 3, 4].some((optionNumber) => normalizeText(question[`Option ${optionNumber}`]));
      const reasons = [];
      if (!normalizeText(question.Question)) reasons.push("missing question");
      if (!hasOptions) reasons.push("missing option1-option4");
      if (getCorrectOptionNumbers(question).length === 0) reasons.push("missing/invalid correct_option");
      return {
        rowNumber: question.sourceCsvRowNumber || index + 2,
        reasons,
        preview: plainTextFromRichHtml(question.Question || question.Answer || "").slice(0, 90),
      };
    })
    .filter((row) => row.reasons.length > 0);

  if (invalidRows.length > 0) {
    const details = invalidRows.slice(0, 8).map((row) => {
      const preview = row.preview ? ` (${escapeHtml(row.preview)})` : "";
      return `CSV row ${row.rowNumber}: ${escapeHtml(row.reasons.join(", "))}${preview}`;
    });
    const remaining = invalidRows.length > 8 ? `<br>...and ${invalidRows.length - 8} more row(s).` : "";
    throw new Error(`Fix these rows before preview:<br>${details.join("<br>")}${remaining}`);
  }
}

async function getQuestionPaperImportCSVText() {
  const file = importFileEl?.files?.[0] || null;
  if (file) return file.text();
  return normalizeText(importCsvEl?.value);
}

function buildImportedPaperPreviewData(name, questions) {
  const subjects = [...new Set(questions.map((question) => getQuestionSubject(question)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const classes = [...new Set(questions.map((question) => normalizeText(question.class || question.Class)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return {
    name,
    subjects,
    classes,
    questions,
  };
}

function renderQuestionPaperImportPreview(importData) {
  if (!importPreviewEl || !importPreviewBodyEl || !importSummaryEl) return;
  importPreviewEl.classList.remove("d-none");
  importSummaryEl.textContent = `${importData.questions.length} questions`;

  importPreviewBodyEl.innerHTML = importData.questions.slice(0, 20).map((question, index) => {
    const correctLabels = getCorrectOptionNumbers(question).map(getOptionLetter).join(", ");
    const options = [1, 2, 3, 4]
      .map((optionNumber) => {
        const text = question[`Option ${optionNumber}`];
        if (!text) return "";
        const isCorrect = getCorrectOptionNumbers(question).includes(optionNumber);
        return `<div class="${isCorrect ? "question-paper-option-correct" : ""}"><span class="fw-semibold">${escapeHtml(getOptionLetter(optionNumber))}.</span> ${escapeHtml(text)}</div>`;
      })
      .join("");

    return `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(question.Question)}</td>
        <td>${options || "-"}</td>
        <td><span class="badge bg-success">${escapeHtml(correctLabels)}</span></td>
        <td>${escapeHtml(getQuestionSubject(question))}</td>
        <td>
          <div>${escapeHtml(question.Chapter || "-")}</div>
          <div class="small text-muted">${escapeHtml([question.Topic, question.Subtopic].filter(Boolean).join(" / ") || "-")}</div>
        </td>
      </tr>
    `;
  }).join("");

  const hiddenCount = importData.questions.length - 20;
  if (hiddenCount > 0) {
    importPreviewBodyEl.insertAdjacentHTML("beforeend", `
      <tr>
        <td colspan="6" class="text-center text-muted">Preview showing first 20 questions. ${hiddenCount} more question${hiddenCount === 1 ? "" : "s"} will also be imported.</td>
      </tr>
    `);
  }
}

async function previewQuestionPaperImport() {
  try {
    const csvText = await getQuestionPaperImportCSVText();
    if (!csvText) {
      throw new Error("Paste CSV or choose a CSV file first.");
    }

    const records = getCSVRecords(csvText);
    const questions = records.map(buildQuestionFromImportRecord);
    validateImportedQuestions(questions);

    const fallbackName = `Question Paper ${new Date().toLocaleDateString()}`;
    const name = normalizeText(importNameEl?.value, fallbackName);
    pendingQuestionPaperImport = buildImportedPaperPreviewData(name, questions);
    renderQuestionPaperImportPreview(pendingQuestionPaperImport);
    if (confirmImportBtn) confirmImportBtn.disabled = false;
    setImportMessage(`Preview ready. ${questions.length} question${questions.length === 1 ? "" : "s"} will be created only after confirmation.`, "success");
  } catch (error) {
    pendingQuestionPaperImport = null;
    if (confirmImportBtn) confirmImportBtn.disabled = true;
    if (importPreviewEl) importPreviewEl.classList.add("d-none");
    setImportMessage(error.message || "Unable to preview CSV.", "danger");
  }
}

async function confirmQuestionPaperImport() {
  if (!pendingQuestionPaperImport || !currentUser) return;

  const originalHtml = confirmImportBtn?.innerHTML || "";
  if (confirmImportBtn) {
    confirmImportBtn.disabled = true;
    confirmImportBtn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>Saving...';
  }

  try {
    const docRef = firestore.collection("questionpapers").doc();
    const paperData = {
      questionPaperID: docRef.id,
      templateName: pendingQuestionPaperImport.name,
      testName: pendingQuestionPaperImport.name,
      name: pendingQuestionPaperImport.name,
      title: pendingQuestionPaperImport.name,
      class: pendingQuestionPaperImport.classes.join(", "),
      subjects: pendingQuestionPaperImport.subjects,
      questions: pendingQuestionPaperImport.questions,
      importedFrom: "csv",
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      createdBy: currentUser.email || "",
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy: currentUser.email || "",
    };

    await docRef.set(paperData);
    bootstrap.Modal.getInstance(importModalEl)?.hide();
    resetQuestionPaperImportModal();
    await loadQuestionPapers();
    window.location.href = `question-paper-detail.html?id=${encodeURIComponent(docRef.id)}`;
  } catch (error) {
    console.error("Create question paper from CSV:", error);
    setImportMessage(error.message || "Unable to create question paper.", "danger");
    if (confirmImportBtn) confirmImportBtn.disabled = false;
  } finally {
    if (confirmImportBtn) confirmImportBtn.innerHTML = originalHtml || '<i class="bi bi-check2-circle me-1"></i>Create Question Paper';
  }
}

function renderRichText(value, fallback = "-") {
  const sanitized = sanitizeRichHtml(value);
  return sanitized || escapeHtml(fallback);
}

function getDashboardSignInUrl() {
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `index.html?redirect=${encodeURIComponent(currentPath)}`;
}

function getSignInPromptHtml() {
  return `
    <div class="alert alert-warning d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
      <div>Please sign in from the teacher dashboard first.</div>
      <a class="btn btn-sm" style="background:#16a085;color:white;border:none;" href="${escapeHtml(getDashboardSignInUrl())}">
        <i class="bi bi-google me-1"></i>Sign in with Google
      </a>
    </div>
  `;
}

function showListError(message) {
  if (listSubtitleEl) listSubtitleEl.textContent = message;
  if (listContentEl) listContentEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(message)}</div>`;
}

function showDetailError(message) {
  if (detailSubtitleEl) detailSubtitleEl.textContent = message;
  if (detailContentEl) detailContentEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(message)}</div>`;
}

function getPaperTitle(paper) {
  return normalizeText(paper?.templateName || paper?.testName || paper?.name || paper?.title, "Question Paper");
}

function getPaperExternalId(paper) {
  return normalizeText(paper?.questionPaperID || paper?.id);
}

function getPaperSubjects(paper) {
  const subjects = new Map();
  (paper?.questions || []).forEach((question) => {
    const subject = getQuestionSubject(question);
    const key = normalizeComparable(subject);
    if (key && !subjects.has(key)) subjects.set(key, subject);
  });
  return Array.from(subjects.values()).sort((a, b) => a.localeCompare(b));
}

function getPaperHaystack(paper) {
  return [
    paper.id,
    paper.questionPaperID,
    paper.templateName,
    paper.testName,
    paper.name,
    paper.title,
    getPaperSubjects(paper).join(" "),
  ].map(normalizeComparable).join(" ");
}

function getQuestionNumber(question, index) {
  const parsed = String(question?.subjectname_questionnumber || "").match(/_(?:Q)?(\d+)$/i);
  if (parsed) return Number(parsed[1]);
  if (Number.isFinite(Number(question?.questionNumber))) return Number(question.questionNumber);
  return index + 1;
}

function getQuestionSubject(question) {
  return normalizeText(question?.Subject || question?.subject || question?.section || question?.subjectName, "General");
}

function extractOptionText(value) {
  if (value == null) return "";
  if (typeof value === "object") return normalizeText(value.optionText || value.text || value.label || value.value);
  return normalizeText(value).replace(/^Option\s*\d+\s*[:.)-]?\s*/i, "").trim();
}

function getOptionNumberFromToken(token) {
  const normalized = normalizeComparable(token);
  if (/^[1-4]$/.test(normalized)) return Number(normalized);
  const index = ["a", "b", "c", "d"].indexOf(normalized);
  return index >= 0 ? index + 1 : null;
}

function uniqueSortedOptionNumbers(values) {
  return [...new Set((values || []).map(getOptionNumberFromToken).filter(Boolean))].sort((a, b) => a - b);
}

function getOptionNumbersFromValue(value) {
  if (Array.isArray(value)) return uniqueSortedOptionNumbers(value);
  if (value == null || value === "") return [];
  const tokens = normalizeComparable(value).match(/[a-d]|[1-4]/g) || [];
  return uniqueSortedOptionNumbers(tokens);
}

function getCorrectOptionNumbers(question) {
  const explicitOptions = uniqueSortedOptionNumbers([
    ...getOptionNumbersFromValue(question?.["Correct Option"]),
    ...getOptionNumbersFromValue(question?.["Correct Options"]),
  ]);
  if (explicitOptions.length > 0) return explicitOptions;

  const objectOptions = [];
  for (let optionIndex = 1; optionIndex <= 4; optionIndex += 1) {
    const optionValue = question?.[`Option ${optionIndex}`];
    if (optionValue && typeof optionValue === "object" && optionValue.correct === true) {
      objectOptions.push(optionIndex);
    }
  }
  if (objectOptions.length > 0) return objectOptions;

  const answerText = normalizeComparable(question?.Answer || question?.CorrectAnswer || question?.correctAnswer);
  if (!answerText) return [];

  const answerOptions = [];
  for (let optionIndex = 1; optionIndex <= 4; optionIndex += 1) {
    const optionText = normalizeComparable(extractOptionText(question?.[`Option ${optionIndex}`]));
    if (optionText && optionText === answerText) answerOptions.push(optionIndex);
  }
  return answerOptions;
}

function getOptionLetter(optionNumber) {
  return ["A", "B", "C", "D"][Number(optionNumber) - 1] || "";
}

function getQuestionClass(question, paper) {
  return normalizeText(
    question?.class ||
    question?.Class ||
    question?.grade ||
    question?.Grade ||
    question?.standard ||
    question?.Standard ||
    paper?.class ||
    paper?.Class ||
    paper?.grade ||
    paper?.Grade ||
    paper?.year
  );
}

function buildQuestionDetails(question, index) {
  const correctOptions = getCorrectOptionNumbers(question);
  return {
    raw: question,
    questionNumber: getQuestionNumber(question, index),
    subject: getQuestionSubject(question),
    chapter: normalizeText(question?.Chapter || question?.chapter),
    topic: normalizeText(question?.Topic || question?.topic),
    subtopic: normalizeText(question?.Subtopic || question?.subtopic),
    className: getQuestionClass(question, currentQuestionPaper),
    questionText: normalizeText(question?.Question || question?.question || question?.questionText),
    options: [1, 2, 3, 4].map((optionNumber) => ({
      number: optionNumber,
      letter: getOptionLetter(optionNumber),
      text: extractOptionText(question?.[`Option ${optionNumber}`]),
      correct: correctOptions.includes(optionNumber),
    })),
    correctOptions,
    explanation: normalizeText(question?.feedbackCorrectAnswer || question?.feedback || question?.explanation || question?.solution),
  };
}

function sortPapers(papers) {
  const sortValue = listSortEl?.value || "name-asc";
  return [...papers].sort((a, b) => {
    if (sortValue === "name-desc") return getPaperTitle(b).localeCompare(getPaperTitle(a), undefined, { numeric: true });
    if (sortValue === "questions-desc") return (b.questions?.length || 0) - (a.questions?.length || 0);
    if (sortValue === "questions-asc") return (a.questions?.length || 0) - (b.questions?.length || 0);
    return getPaperTitle(a).localeCompare(getPaperTitle(b), undefined, { numeric: true });
  });
}

function renderQuestionPaperList() {
  if (!listContentEl) return;

  const search = normalizeComparable(listSearchEl?.value);
  const filtered = sortPapers(questionPapers.filter((paper) => !search || getPaperHaystack(paper).includes(search)));

  if (listSubtitleEl) {
    listSubtitleEl.textContent = `${filtered.length} of ${questionPapers.length} question paper${questionPapers.length === 1 ? "" : "s"}`;
  }

  if (filtered.length === 0) {
    listContentEl.innerHTML = `<div class="alert alert-info">No question papers found.</div>`;
    return;
  }

  listContentEl.innerHTML = `
    <div class="row g-3">
      ${filtered.map((paper) => {
        const subjects = getPaperSubjects(paper);
        const questionCount = Array.isArray(paper.questions) ? paper.questions.length : 0;
        const detailUrl = `question-paper-detail.html?id=${encodeURIComponent(paper.id)}`;
        return `
          <div class="col-12 col-xl-6">
            <div class="test-card h-100">
              <div class="d-flex justify-content-between align-items-start gap-3 mb-2">
                <div>
                  <h5 class="fw-bold mb-1">${escapeHtml(getPaperTitle(paper))}</h5>
                  <div class="small text-muted">${escapeHtml(getPaperExternalId(paper) || paper.id)}</div>
                </div>
                <span class="badge" style="background:#16a085;color:white">${questionCount} Questions</span>
              </div>
              <div class="small text-muted mb-3">
                ${subjects.length ? escapeHtml(subjects.join(", ")) : "No subjects found"}
              </div>
              <a class="btn" style="background:#16a085;color:white;border:none" href="${detailUrl}">
                <i class="bi bi-list-check me-2"></i>View Questions
              </a>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

async function loadQuestionPapers() {
  if (!listContentEl) return;
  listContentEl.innerHTML = `
    <div class="text-center py-5">
      <div class="spinner-border" style="color:#2c3e50"></div>
      <p class="mt-2">Loading question papers...</p>
    </div>
  `;

  try {
    const snapshot = await firestore.collection("questionpapers").get();
    questionPapers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderQuestionPaperList();
  } catch (error) {
    console.error("Load question papers:", error);
    showListError(error.message || "Unable to load question papers.");
  }
}

function getQuestionPaperIdFromQuery() {
  return new URLSearchParams(window.location.search).get("id") || new URLSearchParams(window.location.search).get("questionPaperID");
}

async function fetchQuestionPaper(id) {
  if (!id) return null;

  const directSnap = await firestore.collection("questionpapers").doc(id).get();
  if (directSnap.exists) return { id: directSnap.id, ...directSnap.data() };

  const querySnap = await firestore
    .collection("questionpapers")
    .where("questionPaperID", "==", id)
    .limit(1)
    .get();
  if (querySnap.empty) return null;
  const doc = querySnap.docs[0];
  return { id: doc.id, ...doc.data() };
}

function getQuestionHaystack(question) {
  return [
    question.questionNumber,
    question.subject,
    question.chapter,
    question.topic,
    question.subtopic,
    plainTextFromRichHtml(question.questionText),
    question.options.map((option) => option.text).join(" "),
    question.explanation,
  ].map(normalizeComparable).join(" ");
}

function renderSubjectOptions() {
  if (!detailSubjectEl) return;
  const selected = detailSubjectEl.value;
  const subjects = [...new Set(currentQuestions.map((question) => question.subject).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  detailSubjectEl.innerHTML = `
    <option value="">All subjects</option>
    ${subjects.map((subject) => `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`).join("")}
  `;
  if (subjects.includes(selected)) detailSubjectEl.value = selected;
}

function renderQuestionPaperDetail() {
  if (!detailContentEl || !currentQuestionPaper) return;

  const search = normalizeComparable(detailSearchEl?.value);
  const subject = normalizeComparable(detailSubjectEl?.value);
  const filtered = currentQuestions.filter((question) => {
    if (subject && normalizeComparable(question.subject) !== subject) return false;
    return !search || getQuestionHaystack(question).includes(search);
  });

  if (detailSubtitleEl) {
    const total = currentQuestions.length;
    detailSubtitleEl.textContent = `${getPaperTitle(currentQuestionPaper)} - ${filtered.length} of ${total} question${total === 1 ? "" : "s"}`;
  }

  if (filtered.length === 0) {
    detailContentEl.innerHTML = `<div class="alert alert-info">No questions found.</div>`;
    return;
  }

  detailContentEl.innerHTML = `
    <div class="card shadow-sm">
      <div class="table-responsive">
        <table class="table table-bordered table-sm align-middle question-paper-questions-table mb-0">
          <thead>
            <tr>
              <th style="width:72px">Q.No</th>
              <th style="width:140px">Subject</th>
              <th style="width:190px">Chapter / Topic</th>
              <th>Question</th>
              <th>Options</th>
              <th style="width:120px">Correct</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.map((question) => {
              const correctLabels = question.correctOptions.map((optionNumber) => getOptionLetter(optionNumber)).join(", ") || "-";
              return `
                <tr>
                  <td class="fw-semibold">${escapeHtml(question.questionNumber)}</td>
                  <td>${escapeHtml(question.subject)}</td>
                  <td>
                    <div>${escapeHtml(question.chapter || "-")}</div>
                    <div class="small text-muted">${escapeHtml([question.topic, question.subtopic].filter(Boolean).join(" / ") || "-")}</div>
                  </td>
                  <td class="question-paper-question-cell">${renderRichText(question.questionText)}</td>
                  <td>
                    <div class="question-paper-options">
                      ${question.options.map((option) => option.text ? `
                        <div class="${option.correct ? "question-paper-option-correct" : ""}">
                          <span class="fw-semibold">${escapeHtml(option.letter)}.</span>
                          ${renderRichText(option.text)}
                        </div>
                      ` : "").join("") || "-"}
                    </div>
                  </td>
                  <td><span class="badge bg-success">${escapeHtml(correctLabels)}</span></td>
                </tr>
              `;
            }).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function exportQuestionPaperCSV() {
  if (!currentQuestionPaper || currentQuestions.length === 0) return;

  const header = [
    "question",
    "option1",
    "option2",
    "option3",
    "option4",
    "correct_option",
    "subject",
    "chapter",
    "topic",
    "subtopic",
    "class",
    "correct_answer_logic",
  ];

  const rows = currentQuestions.map((question) => {
    const optionText = (optionNumber) => plainTextFromRichHtml(question.options[optionNumber - 1]?.text || "");
    const correctOption = question.correctOptions
      .map((optionNumber) => getOptionLetter(optionNumber).toLowerCase())
      .join("");

    return [
      plainTextFromRichHtml(question.questionText),
      optionText(1),
      optionText(2),
      optionText(3),
      optionText(4),
      correctOption,
      question.subject,
      question.chapter,
      question.topic,
      question.subtopic,
      question.className,
      plainTextFromRichHtml(question.explanation),
    ];
  });

  const filename = `${getSafeFilenamePart(getPaperTitle(currentQuestionPaper), "question-paper")}-${getSafeFilenamePart(getPaperExternalId(currentQuestionPaper) || currentQuestionPaper.id, "paper")}.csv`;
  downloadCSV(filename, rowsToCSV([header, ...rows]));
}

async function loadQuestionPaperDetail() {
  if (!detailContentEl) return;
  const id = getQuestionPaperIdFromQuery();
  if (!id) {
    showDetailError("Missing question paper id.");
    return;
  }

  try {
    currentQuestionPaper = await fetchQuestionPaper(id);
    if (!currentQuestionPaper) {
      showDetailError("Question paper not found.");
      return;
    }

    currentQuestions = (currentQuestionPaper.questions || [])
      .map(buildQuestionDetails)
      .sort((a, b) => a.questionNumber - b.questionNumber);
    if (detailExportCsvBtn) detailExportCsvBtn.disabled = currentQuestions.length === 0;
    renderSubjectOptions();
    renderQuestionPaperDetail();
  } catch (error) {
    console.error("Load question paper detail:", error);
    showDetailError(error.message || "Unable to load question paper.");
  }
}

function requireAuthThen(callback) {
  auth.onAuthStateChanged((user) => {
    if (!user) {
      currentUser = null;
      if (listSubtitleEl) listSubtitleEl.textContent = "Please sign in from the teacher dashboard first.";
      if (detailSubtitleEl) detailSubtitleEl.textContent = "Please sign in from the teacher dashboard first.";
      if (listContentEl) listContentEl.innerHTML = getSignInPromptHtml();
      if (detailContentEl) detailContentEl.innerHTML = getSignInPromptHtml();
      return;
    }
    currentUser = user;
    callback();
  });
}

if (listContentEl) {
  listSearchEl?.addEventListener("input", renderQuestionPaperList);
  listSortEl?.addEventListener("change", renderQuestionPaperList);
  listRefreshBtn?.addEventListener("click", loadQuestionPapers);
  createQuestionPaperBtn?.addEventListener("click", () => {
    resetQuestionPaperImportModal();
    bootstrap.Modal.getOrCreateInstance(importModalEl).show();
  });
  previewImportBtn?.addEventListener("click", previewQuestionPaperImport);
  confirmImportBtn?.addEventListener("click", confirmQuestionPaperImport);
  importCsvEl?.addEventListener("input", () => {
    pendingQuestionPaperImport = null;
    if (confirmImportBtn) confirmImportBtn.disabled = true;
    if (importPreviewEl) importPreviewEl.classList.add("d-none");
  });
  importFileEl?.addEventListener("change", () => {
    pendingQuestionPaperImport = null;
    if (confirmImportBtn) confirmImportBtn.disabled = true;
    if (importPreviewEl) importPreviewEl.classList.add("d-none");
  });
  requireAuthThen(loadQuestionPapers);
}

if (detailContentEl) {
  detailSearchEl?.addEventListener("input", renderQuestionPaperDetail);
  detailSubjectEl?.addEventListener("change", renderQuestionPaperDetail);
  detailExportCsvBtn?.addEventListener("click", exportQuestionPaperCSV);
  requireAuthThen(loadQuestionPaperDetail);
}
