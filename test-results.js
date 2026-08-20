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
  authDomain:
    firebaseConfigParts[0] +
    "." +
    firebaseConfigParts[1] +
    "." +
    firebaseConfigParts[5],
  projectId: firebaseConfigParts[0],
  storageBucket:
    firebaseConfigParts[0] +
    "." +
    firebaseConfigParts[1] +
    firebaseConfigParts[6] +
    "." +
    firebaseConfigParts[7],
  messagingSenderId: firebaseConfigParts[3],
  appId: firebaseConfigParts[4],
};

if (!firebase.apps || firebase.apps.length === 0) {
  firebase.initializeApp(firebaseConfig);
}

const firestore = firebase.firestore();
const auth = firebase.auth();
const contentEl = document.getElementById("test-results-content");
const subtitleEl = document.getElementById("test-results-subtitle");
const testSelectEl = document.getElementById("test-select");
const sortSelectEl = document.getElementById("sort-select");
const subjectSelectEl = document.getElementById("subject-select");
const resultsViewToggleEl = document.getElementById("results-view-toggle");
const tableScoreControlsEl = document.getElementById("table-score-controls");
const scoreCorrectInput = document.getElementById("scoreCorrect");
const scoreWrongInput = document.getElementById("scoreWrong");
const scoreSkippedInput = document.getElementById("scoreSkipped");

let currentTestId = null;
let availableTests = [];
let currentTestData = null;
let currentResultsData = [];
let currentStudentsData = [];
let currentQuestionPaperData = null;
let currentResultsView = "table";

const DEFAULT_SCORING_RULES = {
  correct: 3,
  wrong: -1,
  skipped: 0,
};
const GRADE_SCALE = [
  { min: 91, max: 100, grade: "A1", gradePoint: 10, pass: true },
  { min: 81, max: 90, grade: "A2", gradePoint: 9, pass: true },
  { min: 71, max: 80, grade: "B1", gradePoint: 8, pass: true },
  { min: 61, max: 70, grade: "B2", gradePoint: 7, pass: true },
  { min: 51, max: 60, grade: "C1", gradePoint: 6, pass: true },
  { min: 41, max: 50, grade: "C2", gradePoint: 5, pass: true },
  { min: 33, max: 40, grade: "D", gradePoint: 4, pass: true },
  { min: 21, max: 32, grade: "E1", gradePoint: 0, pass: false },
  { min: 0, max: 20, grade: "E2", gradePoint: 0, pass: false },
];

function setContentHtml(html) {
  contentEl.innerHTML = html;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

function renderRichText(value, fallback = "") {
  const sanitizedHtml = sanitizeRichHtml(value);
  if (sanitizedHtml) return sanitizedHtml;
  return escapeHtml(fallback);
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

function showError(message) {
  setResultsViewToggleVisible(false);
  setTableScoreControlsVisible(false);
  subtitleEl.textContent = message;
  setContentHtml(`<div class="alert alert-danger">${escapeHtml(message)}</div>`);
}

function getDashboardSignInUrl() {
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `index.html?redirect=${encodeURIComponent(currentPath)}`;
}

function showSignInPrompt() {
  const message = "Please sign in from the teacher dashboard first.";
  setResultsViewToggleVisible(false);
  setTableScoreControlsVisible(false);
  subtitleEl.textContent = message;
  setContentHtml(`
    <div class="alert alert-warning d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
      <div>${escapeHtml(message)}</div>
      <a class="btn btn-sm" style="background:#16a085;color:white;border:none;" href="${escapeHtml(getDashboardSignInUrl())}">
        <i class="bi bi-google me-1"></i>Sign in with Google
      </a>
    </div>
  `);
}

function normalizeAssignedSections(snapshot) {
  const sectionsMap = new Map();

  snapshot.docs.forEach((doc) => {
    const assignment = doc.data() || {};
    const sectionIds = Array.isArray(assignment.sectionIds) ? assignment.sectionIds : [];
    const sectionNames = Array.isArray(assignment.sectionNames) ? assignment.sectionNames : [];

    if (sectionIds.length > 0) {
      sectionIds.forEach((sectionId, index) => {
        if (!sectionId || sectionsMap.has(sectionId)) return;
        sectionsMap.set(sectionId, {
          id: sectionId,
          name: sectionNames[index] || assignment.sectionName || sectionId,
        });
      });
    }

    if (assignment.sectionId && !sectionsMap.has(assignment.sectionId)) {
      sectionsMap.set(assignment.sectionId, {
        id: assignment.sectionId,
        name: assignment.sectionName || assignment.sectionId,
      });
    }
  });

  return Array.from(sectionsMap.values());
}

function getTestIdFromQuery() {
  return new URLSearchParams(window.location.search).get("testId");
}
function getSectionIdFromQuery() {
  return new URLSearchParams(window.location.search).get("sectionId");
}
function getSubjectIdFromQuery() {
  return new URLSearchParams(window.location.search).get("subjectId");
}

function normalizeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function normalizeComparable(value) {
  return normalizeText(value).toLowerCase();
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

function getRollNumber(student, result) {
  return normalizeText(
    student?.rollNo || student?.rollNumber || student?.roll || student?.admissionNo || result?.rollNo || result?.rollNumber || result?.roll,
    "-"
  );
}

function isSkippedStatus(status) {
  return normalizeComparable(status) === "s";
}

function isRightStatus(status) {
  return normalizeComparable(status) === "r";
}

function getStatusClass(status) {
  if (!status) return "subject-status-empty";
  if (isRightStatus(status)) return "subject-status-right";
  if (isSkippedStatus(status)) return "subject-status-skipped";
  return "subject-status-wrong";
}

function findResultStatus(result, question) {
  const questionNumber = question.questionNumber;
  const subject = question.subject;
  const candidateKeys = [];

  if (question.raw?.subjectname_questionnumber) {
    const rawKey = String(question.raw.subjectname_questionnumber);
    candidateKeys.push(rawKey.replace(/_(?:Q)?(\d+)$/i, "_Q$1"));
    candidateKeys.push(rawKey);
  }

  candidateKeys.push(`${subject}_Q${questionNumber}`);
  candidateKeys.push(`${subject}_${questionNumber}`);
  candidateKeys.push(`Generic_Q${questionNumber}`);
  candidateKeys.push(`Q${questionNumber}`);

  for (const key of candidateKeys) {
    if (Object.prototype.hasOwnProperty.call(result, key)) return normalizeText(result[key], "-");
  }

  const suffix = `_Q${questionNumber}`;
  const fallbackKey = Object.keys(result).find((key) => {
    if (!key.endsWith(suffix)) return false;
    const keySubject = key.slice(0, -suffix.length);
    return normalizeComparable(keySubject) === normalizeComparable(subject);
  });
  return fallbackKey ? normalizeText(result[fallbackKey], "-") : "-";
}

function extractOptionText(value) {
  if (value == null) return "";
  if (typeof value === "object") return normalizeText(value.optionText || value.text || value.label || value.value);
  return normalizeText(value)
    .replace(/^Option\s*\d+\s*[:.)-]?\s*/i, "")
    .trim();
}

function getCorrectOptionNumber(question) {
  const explicitOption = parseInt(question?.["Correct Option"], 10);
  if (Number.isFinite(explicitOption) && explicitOption > 0) return explicitOption;

  for (let optionIndex = 1; optionIndex <= 4; optionIndex += 1) {
    const optionValue = question?.[`Option ${optionIndex}`];
    if (optionValue && typeof optionValue === "object" && optionValue.correct === true) {
      return optionIndex;
    }
  }

  const answerText = normalizeComparable(question?.Answer || question?.CorrectAnswer || question?.correctAnswer);
  if (!answerText) return null;

  for (let optionIndex = 1; optionIndex <= 4; optionIndex += 1) {
    const optionText = normalizeComparable(extractOptionText(question?.[`Option ${optionIndex}`]));
    if (optionText && optionText === answerText) return optionIndex;
  }

  return null;
}

function buildQuestionDetails(question, index) {
  const questionNumber = getQuestionNumber(question, index);
  return {
    questionNumber,
    subject: getQuestionSubject(question),
    chapter: normalizeText(question?.Chapter || question?.chapter),
    topic: normalizeText(question?.Topic || question?.topic),
    subtopic: normalizeText(question?.Subtopic || question?.subtopic),
    questionText: normalizeText(question?.Question || question?.question || question?.questionText),
    options: [1, 2, 3, 4]
      .map((optionIndex) => extractOptionText(question?.[`Option ${optionIndex}`]))
      .filter(Boolean),
    correctOption: getCorrectOptionNumber(question),
    explanation: normalizeText(question?.feedbackCorrectAnswer || question?.feedback || question?.explanation || question?.solution),
    raw: question,
  };
}

function getSubjectQuestions(test, questionPaper, subjectId) {
  const questions = questionPaper?.questions || test?.questions || [];
  const selectedSubject = normalizeComparable(subjectId);

  return questions
    .map(buildQuestionDetails)
    .filter((question) => normalizeComparable(question.subject) === selectedSubject)
    .sort((a, b) => a.questionNumber - b.questionNumber);
}

function getAvailableSubjects(test, questionPaper) {
  const questions = questionPaper?.questions || test?.questions || [];
  const subjects = new Map();

  questions.forEach((question) => {
    const subject = getQuestionSubject(question);
    const key = normalizeComparable(subject);
    if (key && !subjects.has(key)) subjects.set(key, subject);
  });

  return Array.from(subjects.values()).sort((a, b) => a.localeCompare(b));
}

function getSubjectColumns(test, questionPaper, results) {
  const subjects = new Map();

  getAvailableSubjects(test, questionPaper).forEach((subject) => {
    const key = normalizeComparable(subject);
    if (key) subjects.set(key, subject);
  });

  results.forEach((result) => {
    Object.keys(result || {}).forEach((key) => {
      const match = key.match(/^(.+)_Q\d+$/i);
      if (!match) return;
      const subject = normalizeText(match[1]);
      const normalized = normalizeComparable(subject);
      if (normalized && !subjects.has(normalized)) subjects.set(normalized, subject);
    });
  });

  return Array.from(subjects.values()).sort((a, b) => a.localeCompare(b));
}

function getSubjectCorrectCount(result, subject) {
  const normalizedSubject = normalizeComparable(subject);
  return Object.keys(result || {}).reduce((count, key) => {
    const match = key.match(/^(.+)_Q\d+$/i);
    if (!match || normalizeComparable(match[1]) !== normalizedSubject) return count;
    return isRightStatus(result[key]) ? count + 1 : count;
  }, 0);
}

function parseScoreInput(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getCurrentScoringRules() {
  return {
    correct: parseScoreInput(scoreCorrectInput?.value, DEFAULT_SCORING_RULES.correct),
    wrong: parseScoreInput(scoreWrongInput?.value, DEFAULT_SCORING_RULES.wrong),
    skipped: parseScoreInput(scoreSkippedInput?.value, DEFAULT_SCORING_RULES.skipped),
  };
}

function getQuestionRecordsForResult(result, subject = "") {
  const normalizedSubject = normalizeComparable(subject);
  return Object.keys(result || {}).reduce((records, key) => {
    const match = key.match(/^(.+)_Q\d+$/i);
    if (!match) return records;

    const recordSubject = normalizeText(match[1], "General");
    if (normalizedSubject && normalizeComparable(recordSubject) !== normalizedSubject) return records;

    const rawStatus = result[key];
    const status = isRightStatus(rawStatus) ? "correct" : isSkippedStatus(rawStatus) ? "skipped" : "wrong";
    records.push({ subject: recordSubject, status });
    return records;
  }, []);
}

function getGradeDetails(marks) {
  const normalizedMarks = Math.round(Math.max(0, Math.min(100, Number(marks) || 0)));
  return GRADE_SCALE.find((entry) => normalizedMarks >= entry.min && normalizedMarks <= entry.max) || GRADE_SCALE[GRADE_SCALE.length - 1];
}

function calculatePerformanceMetrics(records, scoringRules) {
  const counts = { correct: 0, wrong: 0, skipped: 0, total: 0 };

  (records || []).forEach((record) => {
    const status = record.status || "wrong";
    if (status === "correct") counts.correct += 1;
    else if (status === "skipped") counts.skipped += 1;
    else counts.wrong += 1;
    counts.total += 1;
  });

  const maxMarksPerQuestion = Math.max(Number(scoringRules.correct) || 0, 1);
  const earnedMarks =
    counts.correct * (Number(scoringRules.correct) || 0) +
    counts.wrong * (Number(scoringRules.wrong) || 0) +
    counts.skipped * (Number(scoringRules.skipped) || 0);
  const maxMarks = counts.total * maxMarksPerQuestion;
  const marks = maxMarks > 0 ? Math.max(0, Math.min(100, (earnedMarks / maxMarks) * 100)) : 0;
  const grade = getGradeDetails(marks);

  return {
    ...counts,
    earnedMarks,
    maxMarks,
    marks,
    grade: grade.grade,
    gradePoint: grade.gradePoint,
    passed: grade.pass,
  };
}

function formatMarksValue(value) {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function getStudentByIdMap(students) {
  const entries = [];
  students.forEach((student) => {
    if (student.id) entries.push([student.id, student]);
    if (student.studentId) entries.push([student.studentId, student]);
  });
  return new Map(entries);
}

function getResultStudent(result, studentById) {
  return studentById.get(result.studentId) || studentById.get(result.id) || null;
}

function getResultGrade(percent) {
  return getGradeDetails(percent).grade;
}

function getResultGpa(result, percent) {
  const explicitGpa = result?.gpa ?? result?.GPA ?? result?.gradePoint ?? result?.grade_point;
  const parsed = Number(explicitGpa);
  if (Number.isFinite(parsed)) return parsed.toFixed(2).replace(/\.00$/, ".0");
  return getGradeDetails(percent).gradePoint.toFixed(2);
}

function getStudentResultLinks(result, student, test) {
  const studentId = result.studentId || result.id || "";
  const studentName = student?.name || result.name || "Unknown";
  const studentPhone = student?.phone || "";
  const currentSectionId = test.sectionId || getSectionIdFromQuery() || "";
  const reportUrl = `report.html?studentId=${encodeURIComponent(studentId)}&testId=${encodeURIComponent(test.id)}&sectionId=${encodeURIComponent(currentSectionId)}`;
  const progressUrl = `report.html?studentId=${encodeURIComponent(studentId)}&sectionId=${encodeURIComponent(currentSectionId)}`;
  const reportLink = `${window.location.origin}/${progressUrl}`;
  const message = `Hi ${studentName}, your test report: ${reportLink}`;
  const whatsappBase = studentPhone
    ? `https://wa.me/${studentPhone.replace(/\D/g, "")}`
    : "https://wa.me/";

  return {
    reportUrl,
    progressUrl,
    whatsappUrl: `${whatsappBase}?text=${encodeURIComponent(message)}`,
    shareUrl: `${window.location.origin}/${reportUrl}`,
  };
}

function setResultsViewToggleVisible(visible) {
  if (!resultsViewToggleEl) return;
  resultsViewToggleEl.classList.toggle("d-none", !visible);
  resultsViewToggleEl.querySelectorAll("[data-results-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.resultsView === currentResultsView);
  });
}

function setTableScoreControlsVisible(visible) {
  if (!tableScoreControlsEl) return;
  tableScoreControlsEl.classList.toggle("d-none", !visible);
}

async function fetchTeacherSections(email) {
  const snapshot = await firestore
    .collection("teacherAssignments")
    .where("teacherEmail", "==", email)
    .get();

  return normalizeAssignedSections(snapshot);
}

async function fetchStudentsBySection(sectionId) {
  const snapshot = await firestore.collection("students").where("sectionId", "==", sectionId).get();
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

async function fetchTestsBySections(sectionIds) {
  if (!sectionIds || sectionIds.length === 0) return [];
  const tests = [];
  
  // Firestore 'in' query supports max 10 values
  const chunkSize = 10;
  for (let i = 0; i < sectionIds.length; i += chunkSize) {
    const chunk = sectionIds.slice(i, i + chunkSize);
    const snapshot = await firestore.collection("tests")
      .where("sectionId", "in", chunk)
      .get();
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      tests.push({
        id: doc.id,
        testName: data.testName || 'Test',
        sectionId: data.sectionId,
        testDate: data.testDate || ''
      });
    });
  }
  
  // Sort by test date (newest first), then by name
  return tests.sort((a, b) => {
    const dateA = a.testDate ? new Date(a.testDate) : null;
    const dateB = b.testDate ? new Date(b.testDate) : null;
    if (dateA && dateB && !isNaN(dateA) && !isNaN(dateB)) {
      return dateB - dateA;
    }
    return a.testName.localeCompare(b.testName);
  });
}

async function fetchQuestionPaper(questionPaperID) {
  if (!questionPaperID) return null;

  const querySnap = await firestore
    .collection("questionpapers")
    .where("questionPaperID", "==", questionPaperID)
    .limit(1)
    .get();

  if (!querySnap.empty) {
    const doc = querySnap.docs[0];
    return { id: doc.id, ...doc.data() };
  }

  const docSnap = await firestore.collection("questionpapers").doc(questionPaperID).get();
  return docSnap.exists ? { id: docSnap.id, ...docSnap.data() } : null;
}

function populateTestSelect(tests, selectedTestId) {
  if (!testSelectEl) return;
  
  availableTests = tests;
  
  if (tests.length === 0) {
    testSelectEl.innerHTML = '<option value="">No tests available</option>';
    return;
  }
  
  const optionsHtml = tests.map(test => {
    const selected = test.id === selectedTestId ? 'selected' : '';
    const dateStr = test.testDate ? ` (${new Date(test.testDate).toLocaleDateString()})` : '';
    return `<option value="${escapeHtml(test.id)}" ${selected}>${escapeHtml(test.testName)}${dateStr}</option>`;
  }).join('');
  
  testSelectEl.innerHTML = optionsHtml;
}

function populateSubjectSelect(test, questionPaper, selectedSubjectId) {
  if (!subjectSelectEl) return;

  const subjects = getAvailableSubjects(test, questionPaper);
  if (subjects.length === 0) {
    subjectSelectEl.classList.add("d-none");
    return;
  }

  subjectSelectEl.classList.remove("d-none");
  subjectSelectEl.innerHTML = [
    '<option value="">All Subjects</option>',
    ...subjects.map((subject) => {
      const selected = normalizeComparable(subject) === normalizeComparable(selectedSubjectId) ? "selected" : "";
      return `<option value="${escapeHtml(subject)}" ${selected}>${escapeHtml(subject)}</option>`;
    }),
  ].join("");
}

async function loadTestResults(testId) {
  if (!testId) return;
  currentTestId = testId;
  
  setContentHtml(`
    <div class="text-center py-5">
      <div class="spinner-border" style="color:#2c3e50"></div>
      <p class="mt-2">Loading student results...</p>
    </div>
  `);
  
  try {
    const user = auth.currentUser;
    if (!user) {
      showSignInPrompt();
      return;
    }
    
    const teacherSections = await fetchTeacherSections(user.email);
    
    if (teacherSections.length === 0) {
      showError("No sections are assigned to this teacher.");
      return;
    }
    
    const testSnap = await firestore.collection("tests").doc(testId).get();
    
    if (!testSnap.exists) {
      showError("Test not found.");
      return;
    }
    
    const test = { id: testSnap.id, ...testSnap.data() };
    const allowedSectionIds = new Set(teacherSections.map((section) => section.id));
    
    if (!allowedSectionIds.has(test.sectionId)) {
      showError("You do not have access to this test.");
      return;
    }
    
    const [resultsSnap, students, questionPaper] = await Promise.all([
      firestore.collection("results").where("testId", "==", testId).get(),
      fetchStudentsBySection(test.sectionId),
      fetchQuestionPaper(test.questionPaperID),
    ]);
    
    const results = resultsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    currentTestData = test;
    currentResultsData = results;
    currentStudentsData = students;
    currentQuestionPaperData = questionPaper;
    populateSubjectSelect(test, questionPaper, getSubjectIdFromQuery());

    const subjectId = getSubjectIdFromQuery();
    if (subjectId) {
      renderSubjectResults(test, results, students, questionPaper, subjectId);
    } else {
      renderStudentResults(test, results, students, sortSelectEl.value);
    }
  } catch (error) {
    console.error("Failed to load test results:", error);
    showError("Unable to load test results right now.");
  }
}

function renderQuestionDetailModal(question) {
  const existing = document.querySelector(".question-detail-overlay");
  if (existing) existing.remove();

  const correctOptionText = question.correctOption ? question.options[question.correctOption - 1] : "";
  const correctAnswerHtml = question.correctOption
    ? `Option ${escapeHtml(question.correctOption)}${correctOptionText ? `: <span class="question-detail-inline">${renderRichText(correctOptionText)}</span>` : ""}`
    : "Not available";

  const optionsHtml = question.options.length
    ? `<ol class="mb-0 question-detail-options">${question.options.map((option) => `<li>${renderRichText(option)}</li>`).join("")}</ol>`
    : '<div class="text-muted">No options available.</div>';

  const overlay = document.createElement("div");
  overlay.className = "question-detail-overlay";
  overlay.innerHTML = `
    <div class="question-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="question-detail-title">
      <div class="question-detail-header">
        <div>
          <h5 class="mb-1" id="question-detail-title">Question ${escapeHtml(question.questionNumber)}</h5>
          <div class="text-muted small">${escapeHtml(question.subject)}</div>
        </div>
        <button type="button" class="question-detail-close" aria-label="Close question details">&times;</button>
      </div>
      <div class="question-detail-body">
        <div class="question-detail-meta">
          ${question.chapter ? `<span class="badge bg-light text-dark border">Chapter: ${escapeHtml(question.chapter)}</span>` : ""}
          ${question.topic ? `<span class="badge bg-light text-dark border">Topic: ${escapeHtml(question.topic)}</span>` : ""}
          ${question.subtopic ? `<span class="badge bg-light text-dark border">Subtopic: ${escapeHtml(question.subtopic)}</span>` : ""}
        </div>
        <div class="mb-3">
          <div class="fw-semibold mb-1">Question</div>
          <div class="question-detail-text">${renderRichText(question.questionText, "Question text not available.")}</div>
        </div>
        <div class="mb-3">
          <div class="fw-semibold mb-1">Options</div>
          ${optionsHtml}
        </div>
        <div class="mb-3">
          <div class="fw-semibold mb-1">Correct Answer</div>
          <div>${correctAnswerHtml}</div>
        </div>
        ${question.explanation ? `
          <div>
            <div class="fw-semibold mb-1">Explanation</div>
            <div class="question-detail-text">${renderRichText(question.explanation)}</div>
          </div>
        ` : ""}
      </div>
    </div>
  `;

  const close = () => overlay.remove();
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  overlay.querySelector(".question-detail-close").addEventListener("click", close);
  document.addEventListener("keydown", function onKeydown(event) {
    if (event.key === "Escape") {
      close();
      document.removeEventListener("keydown", onKeydown);
    }
  });
  document.body.appendChild(overlay);
}

function buildSubjectTeacherPromptData(test, subjectId, questions, sortedResults, studentById) {
  const testName = test?.testName || "Test";
  const studentSummaries = [];
  const questionSummaries = questions.map((question) => ({
    question,
    correct: 0,
    wrong: 0,
    skipped: 0,
  }));

  const detailRows = [
    ["Test", "Subject", "Student", "Roll", "Question_No", "Chapter", "Topic", "Subtopic", "Question", "Status", "Correct_Answer"],
  ];

  sortedResults.forEach((result) => {
    const student = studentById.get(result.studentId);
    const studentName = student?.name || result.name || "Unknown";
    const roll = getRollNumber(student, result);
    let rightCount = 0;
    let wrongCount = 0;
    let skippedCount = 0;

    questions.forEach((question, questionIndex) => {
      const status = findResultStatus(result, question);
      const statusLabel = isRightStatus(status) ? "Correct" : isSkippedStatus(status) ? "Skipped" : "Wrong";
      const correctAnswer = question.correctOption
        ? `${question.correctOption}. ${plainTextFromRichHtml(question.options[question.correctOption - 1] || "")}`.trim()
        : "";

      if (isRightStatus(status)) {
        rightCount += 1;
        questionSummaries[questionIndex].correct += 1;
      } else if (isSkippedStatus(status)) {
        skippedCount += 1;
        questionSummaries[questionIndex].skipped += 1;
      } else {
        wrongCount += 1;
        questionSummaries[questionIndex].wrong += 1;
      }

      detailRows.push([
        testName,
        subjectId,
        studentName,
        roll,
        question.questionNumber,
        question.chapter,
        question.topic,
        question.subtopic,
        plainTextFromRichHtml(question.questionText),
        statusLabel,
        correctAnswer,
      ]);
    });

    const total = rightCount + wrongCount + skippedCount;
    studentSummaries.push({
      studentName,
      roll,
      rightCount,
      wrongCount,
      skippedCount,
      total,
      accuracy: total ? Math.round((rightCount / total) * 100) : 0,
    });
  });

  const studentSummaryCSV = rowsToCSV([
    ["Test", "Subject", "Student", "Roll", "Total_Correct", "Total_Wrong", "Total_Skipped", "Questions", "Accuracy_Percent"],
    ...studentSummaries.map((row) => [
      testName,
      subjectId,
      row.studentName,
      row.roll,
      row.rightCount,
      row.wrongCount,
      row.skippedCount,
      row.total,
      row.accuracy,
    ]),
  ]);

  const questionSummaryCSV = rowsToCSV([
    ["Test", "Subject", "Question_No", "Chapter", "Topic", "Subtopic", "Correct", "Wrong", "Skipped", "Questions", "Accuracy_Percent", "Question"],
    ...questionSummaries.map((row) => {
      const total = row.correct + row.wrong + row.skipped;
      const accuracy = total ? Math.round((row.correct / total) * 100) : 0;
      return [
        testName,
        subjectId,
        row.question.questionNumber,
        row.question.chapter,
        row.question.topic,
        row.question.subtopic,
        row.correct,
        row.wrong,
        row.skipped,
        total,
        accuracy,
        plainTextFromRichHtml(row.question.questionText),
      ];
    }),
  ]);

  return {
    detailCSV: rowsToCSV(detailRows),
    studentSummaryCSV,
    questionSummaryCSV,
  };
}

function buildSubjectTeacherPromptCardsHtml(test, subjectId, questions, sortedResults, studentById) {
  const { detailCSV, studentSummaryCSV, questionSummaryCSV } = buildSubjectTeacherPromptData(test, subjectId, questions, sortedResults, studentById);
  const prompts = [
    {
      id: "subjectDetail",
      title: "Analyze Class Detail CSV",
      prompt: [
        "I have a CSV of subject-wise class test results with columns: Test, Subject, Student, Roll, Question_No, Chapter, Topic, Subtopic, Question, Status, Correct_Answer.",
        "",
        "Analyze this data and:",
        "1. Identify the top 5 weakest questions and topics for the class",
        "2. List students who need immediate support and the exact questions they struggled with",
        "3. Find common error patterns by chapter, topic, and subtopic",
        "4. Suggest a focused reteaching plan for the subject teacher",
        "",
        "CSV content:",
        detailCSV,
      ].join("\n"),
    },
    {
      id: "studentSummary",
      title: "Analyze Student Summary CSV",
      prompt: [
        "I have a CSV summary of all students in one subject test with columns: Test, Subject, Student, Roll, Total_Correct, Total_Wrong, Total_Skipped, Questions, Accuracy_Percent.",
        "",
        "Analyze this data and:",
        "1. Rank students by performance bands",
        "2. Identify students with high wrong answers or high skipped answers",
        "3. Recommend groups for remediation, practice, and enrichment",
        "4. Write a concise teacher action plan for the next class",
        "",
        "CSV content:",
        studentSummaryCSV,
      ].join("\n"),
    },
    {
      id: "questionSummary",
      title: "Analyze Question/Topic Summary CSV",
      prompt: [
        "I have a CSV summary by question and topic with columns: Test, Subject, Question_No, Chapter, Topic, Subtopic, Correct, Wrong, Skipped, Questions, Accuracy_Percent, Question.",
        "",
        "Analyze this data and:",
        "1. Rank questions/topics from weakest to strongest",
        "2. Highlight topics with more than 50% wrong or skipped responses",
        "3. Recommend which concepts to reteach first",
        "4. Create a short practice plan using the weakest questions as anchors",
        "",
        "CSV content:",
        questionSummaryCSV,
      ].join("\n"),
    },
  ];

  return `
    <div class="ai-report-prompts card shadow-sm mb-4 no-print">
      <div class="card-body">
        <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 mb-3">
          <div>
            <h6 class="fw-bold mb-1">AI Analysis Prompts</h6>
            <p class="text-muted small mb-0">Copy a class-level subject prompt with matching student result data included.</p>
          </div>
        </div>
        <div class="ai-report-prompt-list">
          ${prompts.map((item) => {
            const targetId = `subjectTeacherPrompt${item.id}`;
            const preview = item.prompt.split("\n").slice(0, 5).join("\n");
            return `
              <details class="ai-report-prompt">
                <summary>
                  <div class="ai-report-prompt-summary">
                    <div>
                      <div class="fw-semibold">${escapeHtml(item.title)}</div>
                      <pre class="ai-report-prompt-preview">${escapeHtml(preview)}</pre>
                    </div>
                    <button type="button" class="btn btn-sm btn-outline-secondary ai-copy-prompt-btn" data-copy-target="${targetId}">
                      <i class="bi bi-clipboard"></i> Copy Prompt
                    </button>
                  </div>
                </summary>
                <div class="ai-report-prompt-body">
                  <label class="form-label small text-muted" for="${targetId}">${escapeHtml(item.title)} with data</label>
                  <textarea id="${targetId}" class="form-control ai-report-prompt-text" rows="12" readonly>${escapeHtml(item.prompt)}</textarea>
                </div>
              </details>
            `;
          }).join("")}
        </div>
      </div>
    </div>
  `;
}

function initPromptCopyButtons(root = document) {
  root.querySelectorAll(".ai-copy-prompt-btn").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();

      const target = document.getElementById(button.dataset.copyTarget || "");
      if (!target) return;

      const originalHtml = button.innerHTML;
      try {
        await navigator.clipboard.writeText(target.value || target.textContent || "");
        window.trackAppEvent?.('ai_prompt_copy_success', {
          prompt_target: button.dataset.copyTarget || '',
          button_label: (button.innerText || button.textContent || '').replace(/\s+/g, ' ').trim(),
        });
        button.innerHTML = '<i class="bi bi-check2"></i> Copied';
      } catch (error) {
        window.trackAppEvent?.('ai_prompt_copy_failed', {
          prompt_target: button.dataset.copyTarget || '',
          error_name: error?.name || 'ClipboardError',
        });
        target.focus();
        target.select?.();
        button.innerHTML = '<i class="bi bi-exclamation-circle"></i> Select text';
      }

      window.setTimeout(() => {
        button.innerHTML = originalHtml;
      }, 1800);
    });
  });
}

function renderSubjectResults(test, results, students, questionPaper, subjectId) {
  setResultsViewToggleVisible(false);
  setTableScoreControlsVisible(false);
  const questions = getSubjectQuestions(test, questionPaper, subjectId);
  const studentById = new Map(students.map((student) => [student.studentId || student.id, student]));
  const sortedResults = [...results].sort((a, b) => {
    const studentA = studentById.get(a.studentId);
    const studentB = studentById.get(b.studentId);
    const nameA = studentA?.name || a.name || a.studentId || "";
    const nameB = studentB?.name || b.name || b.studentId || "";
    return nameA.localeCompare(nameB);
  });

  subtitleEl.textContent = `${test.testName || "Test"} | ${subjectId} | ${sortedResults.length} student result${sortedResults.length === 1 ? "" : "s"}`;

  if (questions.length === 0) {
    setContentHtml(`
      <div class="alert alert-warning">
        No questions found for subject "${escapeHtml(subjectId)}" in this test.
      </div>
    `);
    return;
  }

  if (sortedResults.length === 0) {
    setContentHtml('<div class="alert alert-warning">No student results found for this test yet.</div>');
    return;
  }

  const headerHtml = questions
    .map((question, index) => `
      <th>
        <button type="button" class="subject-question-header" data-question-index="${index}" title="View question details">
          Q${escapeHtml(question.questionNumber)}
        </button>
      </th>
    `)
    .join("");

  const rowsHtml = sortedResults
    .map((result) => {
      const student = studentById.get(result.studentId);
      const studentName = student?.name || result.name || "Unknown";
      let rightCount = 0;
      let wrongCount = 0;
      let skippedCount = 0;

      const cellsHtml = questions
        .map((question) => {
          const status = findResultStatus(result, question);
          if (isRightStatus(status)) rightCount += 1;
          else if (isSkippedStatus(status)) skippedCount += 1;
          else wrongCount += 1;

          return `<td class="subject-status-cell ${getStatusClass(status)}">${escapeHtml(status)}</td>`;
        })
        .join("");

      return `
        <tr>
          <td>${escapeHtml(studentName)}</td>
          <td>${escapeHtml(getRollNumber(student, result))}</td>
          ${cellsHtml}
          <td class="subject-total-cell">${rightCount}</td>
          <td class="subject-total-cell">${wrongCount}</td>
          <td class="subject-total-cell">${skippedCount}</td>
        </tr>
      `;
    })
    .join("");

  setContentHtml(`
    ${buildSubjectTeacherPromptCardsHtml(test, subjectId, questions, sortedResults, studentById)}
    <div class="subject-results-wrap">
      <div class="subject-results-scroll">
        <table class="subject-results-table">
          <thead>
            <tr>
              <th>Student</th>
              <th>Roll</th>
              ${headerHtml}
              <th>Total R</th>
              <th>Total W</th>
              <th>Total S</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>
  `);

  initPromptCopyButtons(contentEl);

  contentEl.querySelectorAll(".subject-question-header").forEach((button) => {
    const showDetails = () => {
      const question = questions[Number(button.dataset.questionIndex)];
      if (question) renderQuestionDetailModal(question);
    };
    button.addEventListener("mouseenter", showDetails);
    button.addEventListener("focus", showDetails);
    button.addEventListener("click", showDetails);
  });
}

function renderStudentResults(test, results, students, sortOption = "score-desc") {
  subtitleEl.textContent = `${test.testName || "Test"} | ${results.length} student result${results.length === 1 ? "" : "s"}`;
  setResultsViewToggleVisible(true);

  if (results.length === 0) {
    setContentHtml('<div class="alert alert-warning">No student results found for this test yet.</div>');
    return;
  }

  const studentById = getStudentByIdMap(students);
  const scoringRules = getCurrentScoringRules();
  const rankRows = [...results]
    .map((result) => ({
      result,
      metrics: calculatePerformanceMetrics(getQuestionRecordsForResult(result), scoringRules),
    }))
    .sort((a, b) => {
      if (b.metrics.earnedMarks !== a.metrics.earnedMarks) return b.metrics.earnedMarks - a.metrics.earnedMarks;
      return b.metrics.marks - a.metrics.marks;
    });
  const rankByResultId = new Map(rankRows.map((row, index) => [row.result.id || row.result.studentId, index + 1]));

  const sortedResults = [...results].sort((a, b) => {
    const studentA = getResultStudent(a, studentById);
    const studentB = getResultStudent(b, studentById);
    const nameA = studentA?.name || a.name || a.studentId || "";
    const nameB = studentB?.name || b.name || b.studentId || "";
    const metricsA = calculatePerformanceMetrics(getQuestionRecordsForResult(a), scoringRules);
    const metricsB = calculatePerformanceMetrics(getQuestionRecordsForResult(b), scoringRules);

    switch (sortOption) {
      case "name-asc":
        return nameA.localeCompare(nameB);
      case "name-desc":
        return nameB.localeCompare(nameA);
      case "score-asc":
        if (metricsA.earnedMarks !== metricsB.earnedMarks) return metricsA.earnedMarks - metricsB.earnedMarks;
        return metricsA.marks - metricsB.marks;
      case "score-desc":
        if (metricsB.earnedMarks !== metricsA.earnedMarks) return metricsB.earnedMarks - metricsA.earnedMarks;
        return metricsB.marks - metricsA.marks;
      default:
        return nameA.localeCompare(nameB);
    }
  });

  if (currentResultsView === "cards") {
    renderStudentCards(test, sortedResults, studentById);
    return;
  }

  renderStudentTable(test, sortedResults, studentById, rankByResultId, scoringRules);
}

function renderStudentTable(test, sortedResults, studentById, rankByResultId, scoringRules) {
  setTableScoreControlsVisible(true);
  const subjects = getSubjectColumns(test, currentQuestionPaperData, sortedResults);
  const totalStudents = sortedResults.length;
  const subjectHeadersHtml = subjects.map((subject) => `<th>${escapeHtml(subject)}</th>`).join("");

  const rowsHtml = sortedResults
    .map((result, index) => {
      const student = getResultStudent(result, studentById);
      const studentName = student?.name || result.name || "Unknown";
      const scoreDetails = calculatePerformanceMetrics(getQuestionRecordsForResult(result), scoringRules);
      const rank = rankByResultId.get(result.id || result.studentId) || index + 1;
      const percentile = totalStudents ? ((totalStudents - rank + 1) / totalStudents) * 100 : 0;
      const links = getStudentResultLinks(result, student, test);
      const subjectCellsHtml = subjects
        .map((subject) => {
          const subjectMetrics = calculatePerformanceMetrics(getQuestionRecordsForResult(result, subject), scoringRules);
          const title = `${subjectMetrics.correct} correct, ${subjectMetrics.wrong} wrong, ${subjectMetrics.skipped} skipped`;
          return `<td title="${escapeHtml(title)}">${formatMarksValue(subjectMetrics.earnedMarks)}</td>`;
        })
        .join("");

      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(getRollNumber(student, result))}</td>
          <td class="student-results-name-cell">
            <a href="${links.reportUrl}" target="_blank">${escapeHtml(studentName)}</a>
          </td>
          ${subjectCellsHtml}
          <td title="${scoreDetails.correct} correct, ${scoreDetails.wrong} wrong, ${scoreDetails.skipped} skipped">${formatMarksValue(scoreDetails.earnedMarks)}</td>
          <td>${rank}</td>
          <td>${percentile.toFixed(2)}</td>
          <td>${escapeHtml(getResultGrade(scoreDetails.marks))}</td>
          <td>${escapeHtml(getResultGpa(result, scoreDetails.marks))}</td>
          <td class="student-results-actions-cell no-print">
            <a href="${links.reportUrl}" target="_blank" class="btn btn-sm btn-outline-dark" title="View this test report">
              <i class="bi bi-file-text"></i>
            </a>
            <a href="${links.progressUrl}" target="_blank" class="btn btn-sm btn-outline-success" title="Progress across all tests">
              <i class="bi bi-graph-up"></i>
            </a>
            <a href="${links.whatsappUrl}" target="_blank" class="btn btn-sm btn-outline-success" title="WhatsApp all tests">
              <i class="bi bi-whatsapp"></i>
            </a>
            ${navigator.share ? `<button type="button"
               class="btn btn-sm btn-outline-secondary share-link-btn"
               data-url="${links.shareUrl}"
               title="Share this test">
              <i class="bi bi-share"></i>
            </button>` : `<button type="button"
               class="btn btn-sm btn-outline-secondary copy-link-btn"
               data-url="${links.shareUrl}"
               title="Copy this test link">
              <i class="bi bi-link"></i>
            </button>`}
          </td>
        </tr>
      `;
    })
    .join("");

  setContentHtml(`
    <div class="student-results-table-wrap">
      <div class="student-results-table-scroll">
        <table class="student-results-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Roll</th>
              <th>Name</th>
              ${subjectHeadersHtml}
              <th>Total</th>
              <th>Rank</th>
              <th>Percentile</th>
              <th>Grade</th>
              <th>GPA</th>
              <th class="no-print">Links</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>
  `);

  bindStudentResultLinkButtons();
}

function renderStudentCards(test, sortedResults, studentById) {
  setTableScoreControlsVisible(false);
  const cardsHtml = sortedResults
    .map((result) => {
      const student = getResultStudent(result, studentById);
      const studentName = student?.name || result.name || "Unknown";
      const score = calculateScore(result);
      const links = getStudentResultLinks(result, student, test);

      return `
        <div class="student-card">
          <div>
            <h6 class="mb-1">${escapeHtml(studentName)}</h6>
            <small class="text-muted">${escapeHtml(result.studentId || "N/A")}</small>
          </div>
          <div class="d-flex align-items-center gap-2 flex-wrap justify-content-end">
            <span class="result-badge ${score >= 70 ? "correct" : "wrong"}">${score}%</span>
            <a href="${links.reportUrl}" target="_blank" class="btn btn-sm" style="background:#2c3e50;color:white;border:none">
              <i class="bi bi-file-text"></i> View this test Report
            </a>
            <a href="${links.progressUrl}" target="_blank" class="btn btn-sm" style="background:#16a085;color:white;border:none">
              <i class="bi bi-graph-up"></i> Progress(all tests)
            </a>
            <a href="${links.whatsappUrl}"
              target="_blank"
              class="btn btn-sm"
              style="background:#25D366;color:white;border:none">
              <i class="bi bi-whatsapp"></i> WhatsApp all tests
            </a>
            ${navigator.share ? `<button type="button"
               class="btn btn-sm share-link-btn"
               data-url="${links.shareUrl}"
               style="background:#6c757d;color:white;border:none">
              <i class="bi bi-share"></i> Share this test
            </button>` : `<button type="button"
               class="btn btn-sm copy-link-btn"
               data-url="${links.shareUrl}"
               style="background:#6c757d;color:white;border:none">
              <i class="bi bi-link"></i> Copy this test Link
            </button>`}
          </div>
        </div>
      `;
    })
    .join("");

  setContentHtml(cardsHtml);
  bindStudentResultLinkButtons();
}

function bindStudentResultLinkButtons() {
  contentEl.querySelectorAll(".copy-link-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const url = btn.dataset.url;
      try {
        await navigator.clipboard.writeText(url);
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="bi bi-check"></i> Copied';
        setTimeout(() => {
          btn.innerHTML = originalText;
        }, 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
        window.prompt("Copy this link:", url);
      }
    });
  });

  contentEl.querySelectorAll(".share-link-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const url = btn.dataset.url;
      try {
        await navigator.share({
          title: 'Test Report',
          text: 'Check out this test report',
          url: url
        });
      } catch (err) {
        console.error("Failed to share:", err);
      }
    });
  });
}

async function initializePage() {
  const urlTestId = getTestIdFromQuery();
  if (!urlTestId) {
    showError("Missing testId in URL.");
    return;
  }

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      showSignInPrompt();
      return;
    }
    if (resultsViewToggleEl && !resultsViewToggleEl.dataset.bound) {
      resultsViewToggleEl.dataset.bound = "true";
      resultsViewToggleEl.querySelectorAll("[data-results-view]").forEach((button) => {
        button.addEventListener("click", () => {
          currentResultsView = button.dataset.resultsView || "table";
          setResultsViewToggleVisible(!getSubjectIdFromQuery());
          if (currentTestData && currentResultsData.length > 0 && !getSubjectIdFromQuery()) {
            renderStudentResults(currentTestData, currentResultsData, currentStudentsData, sortSelectEl?.value || "score-desc");
          }
        });
      });
      setResultsViewToggleVisible(false);
    }
    [scoreCorrectInput, scoreWrongInput, scoreSkippedInput].forEach((input) => {
      if (!input || input.dataset.bound) return;
      input.dataset.bound = "true";
      input.addEventListener("input", () => {
        if (currentTestData && currentResultsData.length > 0 && currentResultsView === "table" && !getSubjectIdFromQuery()) {
          renderStudentResults(currentTestData, currentResultsData, currentStudentsData, sortSelectEl?.value || "score-desc");
        }
      });
    });
    setTableScoreControlsVisible(false);
    // Setup sort change listener
    if (sortSelectEl) {
      sortSelectEl.onchange = (e) => {
        if (currentTestData && currentResultsData.length > 0) {
          const subjectId = getSubjectIdFromQuery();
          if (subjectId) {
            renderSubjectResults(currentTestData, currentResultsData, currentStudentsData, currentQuestionPaperData, subjectId);
          } else {
            renderStudentResults(currentTestData, currentResultsData, currentStudentsData, e.target.value);
          }
        }
      };
    }
    if (subjectSelectEl) {
      subjectSelectEl.onchange = (e) => {
        const nextSubjectId = e.target.value;
        const newUrl = new URL(window.location.href);
        if (nextSubjectId) {
          newUrl.searchParams.set("subjectId", nextSubjectId);
        } else {
          newUrl.searchParams.delete("subjectId");
        }
        window.history.replaceState({}, "", newUrl);

        if (currentTestData && currentResultsData.length > 0) {
          if (nextSubjectId) {
            renderSubjectResults(currentTestData, currentResultsData, currentStudentsData, currentQuestionPaperData, nextSubjectId);
          } else {
            renderStudentResults(currentTestData, currentResultsData, currentStudentsData, sortSelectEl?.value || "name-asc");
          }
        }
      };
    }
    // Load results for the URL-specified test
    await loadTestResults(urlTestId);
    return;

    try {
      // Load teacher sections and all available tests
      const teacherSections = await fetchTeacherSections(user.email);
      
      if (teacherSections.length === 0) {
        showError("No sections are assigned to this teacher.");
        return;
      }
      
      const sectionIds = teacherSections.map(s => s.id);
      const tests = await fetchTestsBySections(sectionIds);
      
      // Populate dropdown with URL test pre-selected
      populateTestSelect(tests, urlTestId);
      
      // Setup change listener
      if (testSelectEl) {
        testSelectEl.onchange = (e) => {
          const selectedTestId = e.target.value;
          if (selectedTestId && selectedTestId !== currentTestId) {
            // Update URL without reloading page
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set("testId", selectedTestId);
            window.history.replaceState({}, "", newUrl);
            loadTestResults(selectedTestId);
          }
        };
      }

      // Load results for the URL-specified test
      await loadTestResults(urlTestId);
    } catch (error) {
      console.error("Failed to initialize page:", error);
      showError("Unable to load test results right now.");
    }
  });
}

initializePage();
