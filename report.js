// Firebase Configuration
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

// Initialize Firebase (safe if this page is opened multiple times in the same context)
if (!firebase.apps || firebase.apps.length === 0) {
  firebase.initializeApp(firebaseConfig);
}

const firestore = firebase.firestore();
const reportContentEl = document.getElementById("report-content");

// Hardcoded student ID mappings for students with different IDs in different tests
// Format: oldStudentId -> canonicalStudentId
const STUDENT_ID_MAPPINGS = {
  "67b70cdf6c2235e4246f5d67": "689da8cef835f5e2e7f61cba",
  "67b70f6c6c2235e4246f5e41":"689da8cef835f5e2e7f61cb8",
  "67b70cde6c2235e4246f5d3f":"689da8cef835f5e2e7f61cb2",
};

// Resolve a student ID to its canonical form (handles hardcoded mappings)
function resolveCanonicalStudentId(studentId) {
  return STUDENT_ID_MAPPINGS[studentId] || studentId;
}

// Get all student IDs that should be treated as the same student
// This includes the canonical ID and any mapped IDs pointing to it
function getLinkedStudentIds(canonicalId) {
  const linkedIds = new Set([canonicalId]);
  // Add any IDs that map to this canonical ID
  Object.entries(STUDENT_ID_MAPPINGS).forEach(([oldId, mappedId]) => {
    if (mappedId === canonicalId) {
      linkedIds.add(oldId);
    }
  });
  return Array.from(linkedIds);
}

function setReportHtml(html) {
  reportContentEl.innerHTML = html;
}

function setMetaTag(selector, attributeName, value) {
  const element = document.head.querySelector(selector);
  if (!element) return;
  element.setAttribute(attributeName, value);
}

function updatePageSeo({
  title,
  description,
  url,
  structuredData,
}) {
  if (title) {
    document.title = title;
    setMetaTag('meta[property="og:title"]', "content", title);
    setMetaTag('meta[name="twitter:title"]', "content", title);
  }

  if (description) {
    setMetaTag('meta[name="description"]', "content", description);
    setMetaTag('meta[property="og:description"]', "content", description);
    setMetaTag('meta[name="twitter:description"]', "content", description);
  }

  if (url) {
    setMetaTag('meta[property="og:url"]', "content", url);
  }

  if (structuredData) {
    const scriptEl = document.getElementById("report-structured-data");
    if (scriptEl) {
      scriptEl.textContent = JSON.stringify(structuredData);
    }
  }
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
  const raw = String(value ?? "").trim();
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

function renderAnswerLabel(value, fallback = "—") {
  const text = String(value ?? "").trim();
  if (!text) return escapeHtml(fallback);

  const optionMatch = text.match(/^([A-D]\.)\s*([\s\S]*)$/);
  if (optionMatch) {
    return `${escapeHtml(optionMatch[1])} <span class="report-rich-inline">${renderRichText(optionMatch[2])}</span>`;
  }

  return renderRichText(text);
}

function plainTextFromRichHtml(value) {
  const raw = String(value ?? "").trim();
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

function downloadCSV(filename, rows) {
  const csvContent = rows.map(row => row.map(escapeCSV).join(",")).join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

function showReportError(message) {
  setReportHtml(`<div class="alert alert-danger">${message}</div>`);
}

function showReportWarning(message) {
  setReportHtml(`<div class="alert alert-warning">${message}</div>`);
}

function showLoading(message) {
  setReportHtml(`
    <div class="text-center py-5">
      <div class="spinner-border" style="color:#2c3e50"></div>
      <p class="mt-2">${escapeHtml(message || "Loading...")}</p>
    </div>
  `);
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();

  if (typeof value === "string") {
    const trimmed = value.trim();

    // YYYY-MM-DD or YYYY/MM/DD
    let match = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

    // DD-MM-YYYY or DD/MM/YYYY
    match = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (match) return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function formatDate(dateObj, fallback) {
  if (dateObj && !Number.isNaN(dateObj.getTime())) {
    return dateObj.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  }
  return fallback || "N/A";
}

async function getStudentByStudentId(studentId) {
  const studentSnap = await firestore.collection("students").doc(studentId).get();
  /*const studentSnap = await firestore
    .collection("students")
    .where("studentId", "==", studentId)
    .limit(1)
    .get();*/
  console.log("Queried student by studentId:", { studentId, studentSnap });
  if (!studentSnap.exists) return null;
  return { id: studentSnap.id, ...studentSnap.data() };
  /*if (studentSnap.empty) return null;
  const doc = studentSnap.docs[0];
  return { id: doc.id, ...doc.data() };*/
}

async function fetchTestsByIds(testIds) {
  const uniqueIds = [...new Set((testIds || []).filter(Boolean))];
  const testsById = new Map();
  if (uniqueIds.length === 0) return testsById;

  // Prefer batched "in" queries (max 10 ids per query)
  try {
    const chunkSize = 10;
    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      const chunk = uniqueIds.slice(i, i + chunkSize);
      const snap = await firestore
        .collection("tests")
        .where(firebase.firestore.FieldPath.documentId(), "in", chunk)
        .get();
      snap.forEach((doc) => testsById.set(doc.id, doc.data()));
    }
    return testsById;
  } catch (err) {
    console.warn("Batched test fetch failed, falling back to per-doc fetch:", err);
  }

  const snaps = await Promise.all(uniqueIds.map((id) => firestore.collection("tests").doc(id).get()));
  for (const snap of snaps) {
    if (snap.exists) testsById.set(snap.id, snap.data());
  }
  return testsById;
}

async function fetchQuestionPaper(questionPaperID) {
  if (!questionPaperID) return null;
  console.log("Fetching question paper with ID:", questionPaperID);
  try {
    const querySnap = await firestore
      .collection("questionpapers")
      .where("questionPaperID", "==", questionPaperID)
      .limit(1)
      .get();

    if (!querySnap.empty) {
      const doc = querySnap.docs[0];
      console.log("Found question paper via query:", doc.id, doc.data());
      return { id: doc.id, ...doc.data() };
    }
  } catch (err) {
    console.warn("Question paper query failed, trying direct doc lookup:", err);
  }
  console.log("Attempting direct document fetch for question paper ID:", questionPaperID);
  const docSnap = await firestore.collection("questionpapers").doc(questionPaperID).get();
  console.log("Fetched question paper:", docSnap.id, docSnap.data());
  if (!docSnap.exists) return null;
  return { id: docSnap.id, ...docSnap.data() };
}

function buildQuestionRecordsForResult(test, result, questionPaper) {
  let questions = questionPaper?.questions || test?.questions || [];
  const records = [];

  if (!questions || questions.length === 0) {
    questions = [];
    for (const key in (result || {})) {
      if (key.includes("_Q") || key.startsWith("Q")) {
        let section = "";
        let questionNumber;
        if (key.includes("_Q")) {
          const match = key.match(/(.+)_Q(\d+)/);
          if (match) [, section, questionNumber] = match;
        } else {
          const match = key.match(/Q(\d+)/);
          if (match) {
            section = "General";
            [, questionNumber] = match;
          }
        }
        if (questionNumber) {
          const qNum = parseInt(questionNumber, 10);
          questions[qNum - 1] = {
            questionNumber: qNum,
            section,
            isCorrect: result[key] === "R",
          };
        }
      }
    }
    questions = questions.filter((question) => question !== undefined);
  }

  questions.forEach((question, index) => {
    const parsedQuestionNumber = String(question.subjectname_questionnumber || "").match(/_(\d+)$/);
    const questionNumber = parsedQuestionNumber
      ? Number(parsedQuestionNumber[1])
      : (Number.isFinite(Number(question.questionNumber)) ? Number(question.questionNumber) : index + 1);
    const subject = normalizeFilterValue(question.Subject || question.section || "General");
    const chapter = normalizeFilterValue(question.Chapter);
    const topic = normalizeFilterValue(question.Topic);
    const subtopic = normalizeFilterValue(question.Subtopic);

    const candidateKeys = [];
    if (question.subjectname_questionnumber) {
      candidateKeys.push(String(question.subjectname_questionnumber).replace("_", "_Q"));
    }
    candidateKeys.push(`${subject}_Q${questionNumber}`);
    candidateKeys.push(`Generic_Q${questionNumber}`);
    candidateKeys.push(`Q${questionNumber}`);

    let userAnswer = candidateKeys.find((key) => Object.prototype.hasOwnProperty.call(result || {}, key))
      ? result[candidateKeys.find((key) => Object.prototype.hasOwnProperty.call(result || {}, key))]
      : null;

    if (userAnswer == null) {
      const suffix = `_Q${questionNumber}`;
      const candidates = Object.keys(result || {}).filter((key) => key.endsWith(suffix));
      if (candidates.length === 1) userAnswer = result[candidates[0]];
      else {
        const sameSubject = candidates.find((key) => key.startsWith(`${subject}_Q`));
        if (sameSubject) userAnswer = result[sameSubject];
      }
    }

    const isCorrect = question.isCorrect || userAnswer === "R";
    const status = getQuestionStatus(userAnswer, isCorrect);

    records.push({
      questionNumber,
      subject,
      chapter,
      topic,
      subtopic,
      status,
      isCorrect,
    });
  });

  return records;
}

function buildSubjectStatsFromQuestionRecords(records, scoringRules = DEFAULT_SCORING_RULES) {
  const bySubject = new Map();

  (records || []).forEach((record) => {
    const subject = record.subject || "General";
    if (!bySubject.has(subject)) bySubject.set(subject, []);
    bySubject.get(subject).push(record);
  });

  return Array.from(bySubject.entries())
    .map(([subject, subjectRecords]) => ({
      subject,
      ...calculatePerformanceMetrics(subjectRecords, scoringRules),
    }))
    .sort((a, b) => a.subject.localeCompare(b.subject));
}

function extractOptionText(optionValue) {
  if (optionValue == null) return "";
  if (typeof optionValue === "string") return optionValue;
  if (typeof optionValue === "object") return optionValue.optionText || "";
  return String(optionValue);
}

function getCorrectOptionNumber(question) {
  const explicitOption = parseInt(question["Correct Option"], 10);
  if (!Number.isNaN(explicitOption) && explicitOption > 0) {
    return explicitOption;
  }

  for (let optionIndex = 1; optionIndex <= 4; optionIndex += 1) {
    const optionValue = question[`Option ${optionIndex}`];
    if (optionValue && typeof optionValue === "object" && optionValue.correct === true) {
      return optionIndex;
    }
  }

  return 0;
}

function normalizeFilterValue(value) {
  return String(value || "").trim();
}

function buildFilterOptions(questions, fieldName) {
  const uniqueValues = [...new Set(
    questions
      .map((question) => {
        // For Subject field, also check section property
        if (fieldName === "Subject") {
          return normalizeFilterValue(question.Subject || question.section);
        }
        return normalizeFilterValue(question[fieldName]);
      })
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  return uniqueValues
    .map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join("");
}

async function loadSingleTestReport(testId, studentId) {
  showLoading("Loading report...");
  const [testSnap, resultSnap, studentSnap] = await Promise.all([
    firestore.collection("tests").doc(testId).get(),
    firestore.collection("results").doc(`${testId}_${studentId}`).get(),
    /*firestore
      .collection("results")
      .where("testId", "==", testId)
      .where("studentId", "==", studentId)
      .limit(1)
      .get(),*/
    firestore.collection("students").doc(studentId).get(),
  ]);

  //if (!testSnap.exists || resultSnap.empty || studentSnap.empty) {
  //if (!testSnap.exists || !resultSnap.exists || !studentSnap.exists) {
  if (!testSnap.exists || !resultSnap.exists) {
    showReportWarning("Data not found");
    return;
  }

  const test = testSnap.data();
  //const result = resultSnap.docs[0].data();
  const result = resultSnap.data();
  console.log("Fetched test, result, student:", { test, result, studentSnap });
  //const studentDoc = studentSnap.docs[0];
  const studentDoc = studentSnap; // since we switched to direct doc fetch, studentSnap is a single document snapshot, not a query snapshot
  const student = { id: studentDoc.id, ...studentDoc.data() };
  const questionPaper = test.questionPaperID
    ? await fetchQuestionPaper(test.questionPaperID)
    : null;
  console.log("Fetched question paper:", questionPaper);
  renderSingleTestReport(test, result, student, studentId, testId, questionPaper);
}

async function loadStudentProgressReport(studentId) {
  showLoading("Loading student progress...");

  // Resolve to canonical student ID and get all linked IDs
  const canonicalStudentId = resolveCanonicalStudentId(studentId);
  const linkedStudentIds = getLinkedStudentIds(canonicalStudentId);
  console.log("Loading progress for student:", { inputId: studentId, canonicalId: canonicalStudentId, linkedIds: linkedStudentIds });

  // Fetch student info using canonical ID
  const [student] = await Promise.all([
    getStudentByStudentId(canonicalStudentId),
  ]);

  // Fetch results for all linked student IDs (same student may have different IDs in different tests)
  let allResults = [];
  for (const linkedId of linkedStudentIds) {
    const resultsSnap = await firestore.collection("results").where("studentId", "==", linkedId).get();
    const results = resultsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    allResults = allResults.concat(results);
  }
  // Remove duplicates (same test result might appear with different student IDs)
  const seenTestIds = new Set();
  allResults = allResults.filter((r) => {
    if (seenTestIds.has(r.testId)) return false;
    seenTestIds.add(r.testId);
    return true;
  });

  console.log("Fetched student and results:", { student, resultsCount: allResults.length, allResults });

  // Build student object from results if not found in students collection
  let studentData = student;
  if (!studentData && allResults.length > 0) {
    const firstResult = allResults[0];
    studentData = {
      id: canonicalStudentId,
      name: firstResult.name || "Unknown",
      studentId: firstResult.studentId || canonicalStudentId,
      phone: firstResult.phone || "",
    };
  }

  if (!studentData) {
    showReportWarning("Student not found");
    return;
  }

  if (allResults.length === 0) {
    setReportHtml(`
      <div class="card shadow-sm mb-4">
        <div class="card-body">
          <h5 class="fw-bold mb-3">Student Information</h5>
          <p><strong>Name:</strong> ${escapeHtml(studentData.name || "N/A")}</p>
          <p><strong>Student ID:</strong> ${escapeHtml(studentData.studentId || canonicalStudentId)}</p>
${studentData.phone ? `<p><strong>Phone:</strong> ${escapeHtml(studentData.phone)}</p>` : ''}
        </div>
      </div>
      <div class="alert alert-warning">No test results found for this student.</div>
    `);
    return;
  }

  const results = allResults;
  console.log("Using combined results data:", results);
  const testIds = results.map((r) => r.testId).filter(Boolean);
  const testsById = await fetchTestsByIds(testIds);

  const rows = [];
  for (const result of results) {
    const testId = result.testId;
    const test = testsById.get(testId) || {};
    const questionPaper = test.questionPaperID
      ? await fetchQuestionPaper(test.questionPaperID)
      : null;
    const questionRecords = buildQuestionRecordsForResult(test, result, questionPaper);
    const subjectStats = buildSubjectStatsFromQuestionRecords(questionRecords);

    const scoreDetails = typeof calculateScoreDetails === "function"
      ? calculateScoreDetails(result)
      : { percent: calculateScore(result), correct: null, total: null };

    const dateObj = parseDate(test.testDate);
    rows.push({
      testId,
      testName: test.testName || result.testName || testId || "Test",
      testDateRaw: test.testDate || "",
      dateObj,
      classValue: normalizeFilterValue(test.class || test.className || test.grade || test.standard || result.class || result.grade),
      percent: scoreDetails.percent,
      correct: scoreDetails.correct,
      total: scoreDetails.total,
      subjectStats,
      questionRecords,
    });
  }

  // Sort by date (oldest -> newest). Unknown dates go last.
  rows.sort((a, b) => {
    const at = a.dateObj?.getTime?.();
    const bt = b.dateObj?.getTime?.();
    const aValid = typeof at === "number" && !Number.isNaN(at);
    const bValid = typeof bt === "number" && !Number.isNaN(bt);
    if (aValid && bValid) return at - bt;
    if (aValid) return -1;
    if (bValid) return 1;
    return String(a.testName).localeCompare(String(b.testName));
  });

  renderStudentProgress(studentData, canonicalStudentId, rows);
}

async function loadReportFromQueryParams() {
  const params = new URLSearchParams(window.location.search);
  const testId = params.get("testId");
  const studentId = params.get("studentId");

  if (!studentId) {
    showReportError("Invalid report link");
    return;
  }

  try {
    if (testId) {
      await loadSingleTestReport(testId, studentId);
    } else {
      await loadStudentProgressReport(studentId);
    }
  } catch (err) {
    console.error("Load error:", err);
    showReportError("Error loading report");
  }
}

let currentTestQuestionsData = [];
let currentSingleTestAIContext = null;
let reportAIChatPanel = null;
let ctsStatsDataTable = null;
let statsDataTables = {};
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

function getQuestionStatus(userAnswer, isCorrect) {
  if (!userAnswer || userAnswer === "" || userAnswer === "S") return "skipped";
  return isCorrect ? "correct" : "wrong";
}

function parseScoreInput(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getSelectedValues(select) {
  if (!select) return [];
  return Array.from(select.selectedOptions || [])
    .map((option) => option.value)
    .filter(Boolean);
}

function matchesMultiValueFilter(recordValue, selectedValues) {
  return selectedValues.length === 0 || selectedValues.includes(recordValue || "");
}

function getScopedQuestionRecords(records, filters, excludeKey) {
  return (records || []).filter((record) => {
    if (excludeKey !== "subject" && !matchesMultiValueFilter(record.subject, filters.subjects || [])) return false;
    if (excludeKey !== "chapter" && !matchesMultiValueFilter(record.chapter, filters.chapters || [])) return false;
    if (excludeKey !== "topic" && !matchesMultiValueFilter(record.topic, filters.topics || [])) return false;
    if (excludeKey !== "subtopic" && !matchesMultiValueFilter(record.subtopic, filters.subtopics || [])) return false;
    return true;
  });
}

function updateMultiSelectOptions(select, values, placeholder, selectedValues) {
  if (!select) return;
  const nextSelected = new Set((selectedValues || []).filter((value) => values.includes(value)));
  const optionsHtml = values.length
    ? values.map((value) => `<option value="${escapeHtml(value)}"${nextSelected.has(value) ? " selected" : ""}>${escapeHtml(value)}</option>`).join("")
    : `<option value="" disabled>${escapeHtml(placeholder)}</option>`;
  select.innerHTML = optionsHtml;
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

function formatScoreDisplay(metrics) {
  const earned = Number(metrics?.earnedMarks || 0);
  const max = Number(metrics?.maxMarks || 0);
  return `${Number.isInteger(earned) ? earned : earned.toFixed(1)}/${Number.isInteger(max) ? max : max.toFixed(1)}`;
}

function getFieldToggleDefinitions() {
  return [
    { key: "subject", label: "Subject" },
    { key: "chapter", label: "Chapter" },
    { key: "topic", label: "Topic" },
    { key: "subtopic", label: "Subtopic" },
    { key: "question", label: "Question" },
    { key: "options", label: "Options" },
    { key: "answer", label: "Answers" },
    { key: "explanation", label: "Explanation" },
  ];
}

function buildCurrentTestSummaryData(records = currentTestQuestionsData) {
  const summaryMap = new Map();

  records.forEach((q) => {
    const key = `${q.subject}|${q.chapter}|${q.topic}`;
    if (!summaryMap.has(key)) {
      summaryMap.set(key, {
        subject: q.subject || "General",
        chapter: q.chapter || "",
        topic: q.topic || "General",
        correct: 0,
        wrong: 0,
        skipped: 0,
        total: 0,
        subtopics: new Set(),
      });
    }

    const entry = summaryMap.get(key);
    entry.total += 1;
    if (q.status === "correct") entry.correct += 1;
    else if (q.status === "skipped") entry.skipped += 1;
    else entry.wrong += 1;
    if (q.subtopic) entry.subtopics.add(q.subtopic);
  });

  return Array.from(summaryMap.values())
    .map((entry) => ({
      ...entry,
      accuracy: entry.total > 0 ? Math.round((entry.correct / entry.total) * 100) : 0,
      subtopics: Array.from(entry.subtopics),
    }))
    .sort((a, b) => {
      if (b.wrong !== a.wrong) return b.wrong - a.wrong;
      if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
      return `${a.subject} ${a.topic}`.localeCompare(`${b.subject} ${b.topic}`);
    });
}

function rowsToCSV(rows) {
  return rows.map((row) => row.map(escapeCSV).join(",")).join("\n");
}

function getSingleTestDateLabel(test) {
  const dateObj = parseDate(test?.testDate || test?.date || test?.createdAt);
  return formatDate(dateObj, test?.testDate || test?.date || "Current test");
}

function buildSingleTestPromptData(test, student) {
  const testName = test?.testName || "Test";
  const studentName = student?.name || "Student";
  const summaryRows = buildCurrentTestSummaryData();

  const detailCSV = rowsToCSV([
    ["Test", "Student", "Question_No", "Question", "Your_Answer", "Correct_Answer", "Time_Taken", "Status"],
    ...currentTestQuestionsData.map((q) => [
      testName,
      studentName,
      q.questionNumber,
      plainTextFromRichHtml(q.questionText),
      plainTextFromRichHtml(q.userAnswerLabel),
      plainTextFromRichHtml(q.correctAnswerLabel),
      "",
      q.statusLabel || q.status,
    ]),
  ]);

  const summaryCSV = rowsToCSV([
    ["Subject", "Topic", "Num_Correct", "Num_Wrong", "Num_Skipped", "Questions"],
    ...summaryRows.map((row) => [
      row.subject,
      row.topic,
      row.correct,
      row.wrong,
      row.skipped,
      row.total,
    ]),
  ]);

  const progressCSV = rowsToCSV([
    ["Date", "Subject", "Topic", "Num_Correct", "Num_Wrong"],
    ...summaryRows.map((row) => [
      getSingleTestDateLabel(test),
      row.subject,
      row.topic,
      row.correct,
      row.wrong,
    ]),
  ]);

  return { detailCSV, summaryCSV, progressCSV };
}

function buildAIPromptCardsHtml(test, student) {
  const { detailCSV, summaryCSV, progressCSV } = buildSingleTestPromptData(test, student);
  const prompts = [
    {
      id: "detail",
      title: "Analyze Detail CSV",
      prompt: [
        "I have a CSV of student test results with columns: Test, Student, Question_No, Question, Your_Answer, Correct_Answer, Time_Taken, Status.",
        "",
        "Analyze this data and:",
        "1. Identify the top 3 weakest topics based on incorrect answers",
        "2. List specific question numbers where the student struggled most",
        "3. Calculate average time spent per question",
        "4. Suggest 5 targeted study areas",
        "",
        "CSV content:",
        detailCSV,
      ].join("\n"),
    },
    {
      id: "summary",
      title: "Analyze Summary CSV",
      prompt: [
        "I have a CSV summary with columns: Subject, Topic, Num_Correct, Num_Wrong, Num_Skipped, Questions.",
        "",
        "Analyze this data and:",
        "1. Rank topics by accuracy percentage (correct/total)",
        "2. Highlight topics with >50% error rate",
        "3. Recommend priority topics for revision",
        "4. Calculate overall subject-wise performance",
        "",
        "CSV content:",
        summaryCSV,
      ].join("\n"),
    },
    {
      id: "progress",
      title: "Analyze Progress CSV",
      prompt: [
        "I have a CSV progress report with columns: Date, Subject, Topic, Num_Correct, Num_Wrong.",
        "",
        "Analyze this data and:",
        "1. Show learning trends over time per subject",
        "2. Identify topics showing improvement vs decline",
        "3. Calculate weekly/monthly accuracy rates",
        "4. Predict which topics need immediate attention",
        "",
        "Note: the CSV below contains current-test rows. Add previous exported progress rows below it for a stronger trend analysis.",
        "",
        "CSV content:",
        progressCSV,
      ].join("\n"),
    },
  ];

  return `
    <div class="ai-report-prompts card shadow-sm mb-4 no-print">
      <div class="card-body">
        <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 mb-3">
          <div>
            <h6 class="fw-bold mb-1">AI Analysis Prompts</h6>
            <p class="text-muted small mb-0">Copy a prompt with the matching report data already included.</p>
          </div>
        </div>
        <div class="ai-report-prompt-list">
          ${prompts.map((item) => {
            const targetId = `aiPrompt${item.id}`;
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

function buildSingleTestAIContext({ test, student, correct, total, scorePercent }) {
  const summaryRows = buildCurrentTestSummaryData();
  console.log("Built summary rows for AI context:", summaryRows);
  const weakTopics = summaryRows.filter((row) => row.wrong > 0);

  const summaryText = summaryRows.length
    ? summaryRows
      .map((row) => {
        const subtopicText = row.subtopics.length ? `; subtopics: ${row.subtopics.join(", ")}` : "";
        const chapterText = row.chapter ? ` > ${row.chapter}` : "";
        return `${row.subject}${chapterText} > ${row.topic}: correct ${row.correct}, wrong ${row.wrong}, skipped ${row.skipped}${subtopicText}`;
      })
      .join("\n")
    : "No summary rows available.";

  const weakTopicsText = weakTopics.length
    ? weakTopics
      .map((row, index) => {
        const chapterText = row.chapter ? ` > ${row.chapter}` : "";
        return `${index + 1}. ${row.subject}${chapterText} > ${row.topic} - wrong ${row.wrong}/${row.total}, skipped ${row.skipped}, accuracy ${row.accuracy}%`;
      })
      .join("\n")
    : "No weak topics detected. The student got every tracked topic correct.";

  const detailText = currentTestQuestionsData.length
    ? currentTestQuestionsData
      .map((q) => `Q${q.questionNumber} | Subject: ${q.subject || "General"} | Chapter: ${q.chapter || "General"} | Topic: ${q.topic || "General"} | Subtopic: ${q.subtopic || "General"} | Result: ${q.status || (q.isCorrect ? "Correct" : "Wrong")} | Question: ${q.questionText || "N/A"}`)
      .join("\n")
    : "No detailed question data available.";

    console.log("Built AI context:", {
      testName: test?.testName,
      studentName: student?.name,
      scorePercent,
      correct,
      total,
      summaryRows,
      weakTopics,
      summaryText,
      weakTopicsText,
      detailText,
    });
  return {
    testName: test?.testName || "Test",
    studentName: student?.name || "Student",
    scorePercent,
    correct,
    total,
    summaryRows,
    weakTopics,
    summaryText,
    weakTopicsText,
    detailText,
    contextText: [
      /*`Student: ${student?.name || "Student"}`,
      `Test: ${test?.testName || "Test"}`,
      `Score: ${correct}/${total} (${scorePercent}%)`,
      "",
      "Topic Summary:",*/
      summaryText,
      "",
     /* "Weak Topics:",
      weakTopicsText,
      "",
      "Question Details:",
      detailText,*/
    ].join("\n"),
  };
}

class ReportAIChatPanel {
  constructor() {
    this.engine = null;
    this.provider = "webllm";
    this.messages = [];
    this.isLoading = false;
    this.isReady = false;
    this.modelCacheStatus = {};
    this.geminiStorageKey = "report_ai_gemini_api_key";
    this.currentQuizQuestions = [];
    this.activeQuizQuestion = null;
    this.activeQuizIndex = null;

    this.container = document.getElementById("aiChatContainer");
    this.fab = document.getElementById("aiChatFab");
    this.header = document.getElementById("aiChatHeader");
    this.toggleBtn = document.getElementById("aiChatToggle");
    this.clearBtn = document.getElementById("aiChatClear");
    this.fullscreenBtn = document.getElementById("aiChatFullscreen");
    this.messagesEl = document.getElementById("aiChatMessages");
    this.inputEl = document.getElementById("aiChatInput");
    this.sendBtn = document.getElementById("aiChatSend");
    this.statusText = document.getElementById("aiStatusText");
    this.statusIndicator = document.getElementById("aiStatusIndicator");
    this.modelSelect = document.getElementById("aiModelSelect");
    this.loadBtn = document.getElementById("aiLoadModel");
    this.deleteBtn = document.getElementById("aiDeleteModel");
    this.modelSection = document.querySelector(".ai-chat-model-select");
    this.providerPanel = document.getElementById("aiProviderPanel");
    this.geminiApiKeyInput = document.getElementById("aiGeminiApiKey");
    this.geminiKeyStatus = document.getElementById("aiGeminiKeyStatus");
    this.geminiInstructionsBtn = document.getElementById("aiGeminiInstructionsBtn");
    this.geminiInstructions = document.getElementById("aiGeminiInstructions");
    this.geminiSaveKeyBtn = document.getElementById("aiGeminiSaveKeyBtn");
    this.geminiClearKeyBtn = document.getElementById("aiGeminiClearKeyBtn");
    this.progressContainer = document.getElementById("aiProgressContainer");
    this.progressFill = document.getElementById("aiProgressFill");
    this.progressText = document.getElementById("aiProgressText");
    this.quickActions = document.getElementById("aiQuickActions");
    this.statusSection = document.getElementById("aiChatStatusSection");
    this.quizContainer = document.getElementById("aiChatQuiz");
    this.quizHeader = document.getElementById("aiQuizHeader");
    this.quizGenerateBtn = document.getElementById("aiQuizGenerate");
    this.quizQuestions = document.getElementById("aiQuizQuestions");
    this.helpContainer = document.getElementById("aiChatHelp");
    this.helpHeader = document.getElementById("aiHelpHeader");
    this.chatInputArea = document.getElementById("aiChatInputArea");
    this.toolbarButtons = Array.from(document.querySelectorAll("[data-chat-toggle]"));
    this.sectionMap = {
      model: this.modelSection,
      provider: this.providerPanel,
      status: this.statusSection,
      actions: this.quickActions,
      quiz: this.quizContainer,
      help: this.helpContainer,
    };

    this.bindEvents();
    this.restoreGeminiApiKey();
    this.updateProviderUI();
    this.initializeToolbar();
    this.checkModelCacheStatus();
    this.refreshContextState();
  }

  bindEvents() {
    if (this.header) {
      this.header.addEventListener("click", (e) => {
        if (!e.target.closest("button")) this.toggleChat();
      });
    }
    if (this.toggleBtn) this.toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleChat();
    });
    if (this.fab) this.fab.addEventListener("click", () => this.openChat());
    if (this.clearBtn) this.clearBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.clearChat();
    });
    if (this.fullscreenBtn) this.fullscreenBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleFullscreen();
    });
    if (this.loadBtn) this.loadBtn.addEventListener("click", () => this.loadModel());
    if (this.deleteBtn) this.deleteBtn.addEventListener("click", () => this.deleteModel());
    if (this.modelSelect) this.modelSelect.addEventListener("change", () => {
      this.updateProviderUI();
      this.updateDeleteButtonVisibility();
    });
    if (this.geminiInstructionsBtn) this.geminiInstructionsBtn.addEventListener("click", () => {
      this.geminiInstructions?.classList.toggle("open");
    });
    if (this.geminiSaveKeyBtn) this.geminiSaveKeyBtn.addEventListener("click", () => this.saveGeminiApiKey());
    if (this.geminiClearKeyBtn) this.geminiClearKeyBtn.addEventListener("click", () => this.clearGeminiApiKey());
    if (this.sendBtn) this.sendBtn.addEventListener("click", () => this.sendMessage());
    if (this.inputEl) {
      this.inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
      this.inputEl.addEventListener("input", () => {
        this.inputEl.style.height = "auto";
        this.inputEl.style.height = `${Math.min(this.inputEl.scrollHeight, 120)}px`;
      });
    }
    document.querySelectorAll(".ai-chat-quick-btn[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => this.handleQuickAction(btn.dataset.action));
    });
    document.querySelectorAll(".ai-sample-btn").forEach((btn) => {
      btn.addEventListener("click", () => this.useSamplePrompt(btn.dataset.prompt || ""));
    });
    if (this.helpHeader && this.helpContainer) {
      this.helpHeader.addEventListener("click", () => this.helpContainer.classList.toggle("collapsed"));
    }
    if (this.quizHeader && this.quizContainer) {
      this.quizHeader.addEventListener("click", () => this.quizContainer.classList.toggle("collapsed"));
    }
    if (this.quizGenerateBtn) {
      this.quizGenerateBtn.addEventListener("click", () => this.generateQuizQuestions());
    }
    this.toolbarButtons.forEach((button) => {
      button.addEventListener("click", () => this.toggleToolbarSection(button.dataset.chatToggle || ""));
    });
  }

  getCurrentReportContext() {
    return currentSingleTestAIContext;
  }

  getSelectedProvider() {
    const selectedOption = this.modelSelect?.selectedOptions?.[0];
    return selectedOption?.dataset?.provider || "webllm";
  }

  getSelectedModelId() {
    return this.modelSelect?.value || "";
  }

  getSavedGeminiApiKey() {
    try {
      return window.localStorage.getItem(this.geminiStorageKey) || "";
    } catch (error) {
      console.error("Failed to read Gemini API key from localStorage:", error);
      return "";
    }
  }

  restoreGeminiApiKey() {
    const apiKey = this.getSavedGeminiApiKey();
    if (this.geminiApiKeyInput) this.geminiApiKeyInput.value = apiKey;
    this.updateGeminiKeyStatus(apiKey ? "Saved Gemini API key found in this browser." : "No saved Gemini API key found.");
  }

  saveGeminiApiKey() {
    const apiKey = this.geminiApiKeyInput?.value?.trim() || "";
    if (!apiKey) {
      this.updateGeminiKeyStatus("Enter an API key before saving.");
      return;
    }

    try {
      window.localStorage.setItem(this.geminiStorageKey, apiKey);
      this.updateGeminiKeyStatus("Gemini API key saved locally in this browser.");
      this.addMessage("ai", "Gemini API key saved in local storage. You won't need to re-enter it after a page reload.");
    } catch (error) {
      console.error("Failed to save Gemini API key:", error);
      this.updateGeminiKeyStatus("Unable to save the API key in local storage.");
    }
  }

  clearGeminiApiKey() {
    try {
      window.localStorage.removeItem(this.geminiStorageKey);
      if (this.geminiApiKeyInput) this.geminiApiKeyInput.value = "";
      this.updateGeminiKeyStatus("Saved Gemini API key cleared.");
      if (this.provider === "gemini") {
        this.isReady = false;
        this.disableInteractions();
        this.updateStatus("ready", "Gemini key cleared. Add a key and connect again to continue.");
      }
    } catch (error) {
      console.error("Failed to clear Gemini API key:", error);
      this.updateGeminiKeyStatus("Unable to clear the saved API key.");
    }
  }

  updateGeminiKeyStatus(message) {
    if (this.geminiKeyStatus) this.geminiKeyStatus.textContent = message;
  }

  updateProviderUI() {
    const provider = this.getSelectedProvider();
    const isGemini = provider === "gemini";
    this.provider = provider;

    if (this.providerPanel && !isGemini) {
      this.providerPanel.classList.add("ai-chat-section-hidden");
      this.setToolbarButtonState("provider", false);
    }
    if (this.loadBtn) {
      this.loadBtn.innerHTML = isGemini
        ? '<i class="fas fa-bolt"></i> Connect'
        : '<i class="fas fa-download"></i> Load';
    }
    if (isGemini) {
      const hasKey = Boolean((this.geminiApiKeyInput?.value || this.getSavedGeminiApiKey()).trim());
      this.updateGeminiKeyStatus(hasKey ? "Saved Gemini API key available." : "No saved Gemini API key found.");
    } else if (!this.isReady && this.getSavedGeminiApiKey()) {
      this.updateStatus("ready", "Saved Gemini API key detected. Switch to Gemini and click Connect.");
    }
  }

  refreshContextState() {
    const context = this.getCurrentReportContext();
    if (!context) {
      this.updateStatus("error", "Open a single test report to use AI study help");
      this.disableInteractions();
      this.messagesEl.innerHTML = `
        <div class="ai-chat-message ai">
          <div class="message-bubble markdown-content">This AI panel is ready for single test reports. Open a report with both \`testId\` and \`studentId\`, then load WebLLM or Gemini.</div>
          <span class="message-time">Just now</span>
        </div>
      `;
      return;
    }

    if (!this.isReady) {
      const savedGeminiKey = this.getSavedGeminiApiKey();
      this.updateStatus(
        "ready",
        savedGeminiKey
          ? `Report ready: ${context.studentName} scored ${context.scorePercent}%. Saved Gemini API key detected.`
          : `Report ready: ${context.studentName} scored ${context.scorePercent}%`
      );
    }

    if (this.messages.length === 0) {
      this.clearChat();
    }
  }

  disableInteractions() {
    if (this.inputEl) this.inputEl.disabled = true;
    if (this.sendBtn) this.sendBtn.disabled = true;
    if (this.quizGenerateBtn) this.quizGenerateBtn.disabled = true;
    if (this.quickActions) this.quickActions.style.display = "none";
    if (this.chatInputArea) this.chatInputArea.style.display = "none";
  }

  enableInteractions() {
    if (this.inputEl) this.inputEl.disabled = false;
    if (this.sendBtn) this.sendBtn.disabled = false;
    if (this.quizGenerateBtn) this.quizGenerateBtn.disabled = false;
    if (this.quickActions) this.quickActions.style.display = "flex";
    if (this.chatInputArea) this.chatInputArea.style.display = "block";
  }

  initializeToolbar() {
    this.setToolbarButtonState("model", true);
  }

  setToolbarButtonState(key, isActive) {
    const button = this.toolbarButtons.find((item) => item.dataset.chatToggle === key);
    if (button) button.classList.toggle("active", isActive);
  }

  toggleToolbarSection(key) {
    const section = this.sectionMap[key];
    if (!section) return;
    if (key === "provider" && this.getSelectedProvider() !== "gemini") {
      this.addMessage("ai", "Switch the model dropdown to Gemini to manage the API key section.");
      return;
    }

    const shouldShow = section.classList.contains("ai-chat-section-hidden");
    section.classList.toggle("ai-chat-section-hidden", !shouldShow);
    if (key === "actions") {
      section.style.display = shouldShow && this.isReady ? "flex" : "none";
    }
    this.setToolbarButtonState(key, shouldShow);
  }

  buildSystemPrompt(context) {
    return [
      "You are an AI learning assistant helping a student review a completed test report.",
      "Use the report summary and question detail below to answer questions, create markdown study material, and generate practice quizzes.",
      "Prioritize the student's weak topics and wrong answers.",
      "Be encouraging, concrete, and educational.",
      "If you create study material, use markdown headings, bullet points, and short examples.",
      "",
      "Current report context:",
      context.contextText.substring(0, 12000),
    ].join("\n");
  }

  formatAIError(error, contextLabel = "request") {
    const rawMessage = String(error?.message || error || "Unknown error");
    let parsed = null;

    try {
      parsed = JSON.parse(rawMessage);
    } catch (parseError) {
      const jsonMatch = rawMessage.match(/\{[\s\S]*\}$/);
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (_ignored) {
          parsed = null;
        }
      }
    }

    const apiError = parsed?.error || null;
    const status = String(apiError?.status || "").toUpperCase();
    const code = apiError?.code;
    const providerLabel = this.provider === "gemini" ? "Google Gemini" : "AI";
    const detailedMessage = apiError?.message || rawMessage;

    if (status === "UNAVAILABLE" || code === 503) {
      return `${providerLabel} is currently experiencing high demand. Please wait a little and try again.\n\nDetails: ${detailedMessage}`;
    }

    if (status === "RESOURCE_EXHAUSTED" || code === 429) {
      return `${providerLabel} quota or rate limit was exceeded for this ${contextLabel}. Please check your Gemini plan/quota, wait a bit, or switch to WebLLM.\n\nDetails: ${detailedMessage}`;
    }

    if (status === "PERMISSION_DENIED" || status === "UNAUTHENTICATED" || code === 401 || code === 403) {
      return `${providerLabel} rejected the API key. Please open the Gemini key section, verify the key, save it again, and reconnect.\n\nDetails: ${detailedMessage}`;
    }

    if (rawMessage.includes("Gemini API key missing")) {
      return "Gemini API key is missing. Open the Gemini key section, paste your API key, save it, and click Connect.";
    }

    return `${providerLabel} ${contextLabel} failed. Please try again.${detailedMessage ? `\n\nDetails: ${detailedMessage}` : ""}`;
  }

  async initializeWebLLM(context) {
    if (!navigator.gpu) {
      this.showError("WebGPU is not supported in this browser. Please use a recent Chrome or Edge build.");
      this.updateStatus("error", "WebGPU not supported");
      return false;
    }

    if (typeof window.CreateMLCEngine === "undefined") {
      this.showError("WebLLM library is not available. Please check your internet connection and refresh.");
      this.updateStatus("error", "WebLLM unavailable");
      return false;
    }

    const modelId = this.getSelectedModelId();
    this.addMessage("ai", `Loading ${modelId}. First-time setup can take a few minutes.`);

    this.engine = await window.CreateMLCEngine(modelId, {
      initProgressCallback: (progress) => {
        const percent = Math.round((progress.progress || 0) * 100);
        this.progressFill.style.width = `${percent}%`;
        this.progressText.textContent = `${percent}%`;
        this.updateStatus("loading", `Loading model... ${percent}%`);
      },
    });

    this.provider = "webllm";
    this.messages = [{
      role: "system",
      content: this.buildSystemPrompt(context),
    }];
    this.checkModelCacheStatus();
    return true;
  }

  async initializeGemini(context) {
    const apiKey = (this.geminiApiKeyInput?.value || this.getSavedGeminiApiKey()).trim();
    if (!apiKey) {
      this.updateStatus("error", "Gemini API key required");
      this.showError("Add your Gemini API key, save it, and then click Connect.");
      return false;
    }

    this.provider = "gemini";
    this.engine = null;
    this.messages = [{
      role: "system",
      content: this.buildSystemPrompt(context),
    }];
    this.updateGeminiKeyStatus("Saved Gemini API key available.");
    this.addMessage("ai", `Gemini ${this.getSelectedModelId()} connected. Your API key is stored only in this browser's local storage.`);
    return true;
  }

  async loadModel() {
    const context = this.getCurrentReportContext();
    if (!context) {
      this.addMessage("ai", "Open a single test report first so I can use its summary and detailed results.");
      return;
    }

    const provider = this.getSelectedProvider();
    this.loadBtn.disabled = true;
    this.modelSelect.disabled = true;
    if (provider === "webllm") {
      this.progressContainer.classList.add("active");
      this.progressFill.style.width = "0%";
      this.progressText.textContent = "0%";
    }

    try {
      const didLoad = provider === "gemini"
        ? await this.initializeGemini(context)
        : await this.initializeWebLLM(context);
      if (!didLoad) return;

      this.progressContainer.classList.remove("active");
      this.isReady = true;
      this.enableInteractions();
      this.updateStatus("ready", `${provider === "gemini" ? "Gemini" : "WebLLM"} ready for ${context.studentName}'s ${context.testName}`);
      if (provider === "webllm") {
        this.addMessage("ai", "Model loaded. You can ask for weak-topic notes, markdown study material, or practice quizzes based on this report.");
      }
    } catch (error) {
      console.error("Failed to load AI provider:", error);
      this.progressContainer.classList.remove("active");
      this.updateStatus("error", "Failed to load AI");
      this.addMessage("ai", this.formatAIError(error, provider === "gemini" ? "connection" : "model load"));
    } finally {
      this.loadBtn.disabled = false;
      this.modelSelect.disabled = false;
    }
  }

  async checkModelCacheStatus() {
    if (!("caches" in window) || !this.modelSelect) return;

    try {
      const cacheNames = await caches.keys();
      const modelCacheNames = cacheNames.filter((name) => name.includes("webllm") || name.includes("mlc"));

      Array.from(this.modelSelect.options).forEach((option) => {
        if ((option.dataset.provider || "webllm") === "webllm") {
          option.textContent = option.textContent.replace(/^[✓↓]\s*/, "");
        }
      });

      for (const option of this.modelSelect.options) {
        if ((option.dataset.provider || "webllm") !== "webllm") continue;
        const modelId = option.value;
        let downloaded = false;

        for (const cacheName of modelCacheNames) {
          const cache = await caches.open(cacheName);
          const requests = await cache.keys();
          if (requests.some((request) => request.url.includes(modelId))) {
            downloaded = true;
            break;
          }
        }

        this.modelCacheStatus[modelId] = downloaded;
        option.textContent = `${downloaded ? "✓" : "↓"} ${option.textContent.replace(/^[✓↓]\s*/, "")}`;
      }

      this.updateDeleteButtonVisibility();
    } catch (error) {
      console.error("Error checking model cache:", error);
    }
  }

  updateDeleteButtonVisibility() {
    if (!this.deleteBtn || !this.modelSelect) return;
    if (this.getSelectedProvider() !== "webllm") {
      this.deleteBtn.style.display = "none";
      return;
    }
    const downloaded = this.modelCacheStatus[this.modelSelect.value];
    this.deleteBtn.style.display = downloaded ? "inline-flex" : "none";
  }

  async deleteModel() {
    if (this.getSelectedProvider() !== "webllm") return;
    const modelId = this.modelSelect.value;
    if (!confirm(`Delete ${modelId} from local cache?`)) return;

    this.deleteBtn.disabled = true;
    try {
      const cacheNames = await caches.keys();
      const modelCacheNames = cacheNames.filter((name) => name.includes("webllm") || name.includes("mlc"));

      for (const cacheName of modelCacheNames) {
        const cache = await caches.open(cacheName);
        const requests = await cache.keys();
        for (const request of requests) {
          if (request.url.includes(modelId)) {
            await cache.delete(request);
          }
        }
      }

      this.modelCacheStatus[modelId] = false;
      this.updateDeleteButtonVisibility();
      this.addMessage("ai", `${modelId} was removed from local cache.`);

      if (this.isReady) {
        this.isReady = false;
        this.engine = null;
        this.disableInteractions();
        this.updateStatus("ready", "Model removed. Load a model to continue.");
      }
      this.checkModelCacheStatus();
    } catch (error) {
      console.error("Delete model error:", error);
      this.addMessage("ai", `Error deleting model: ${error.message}`);
    } finally {
      this.deleteBtn.disabled = false;
    }
  }

  updateStatus(state, text) {
    if (this.statusText) this.statusText.textContent = text;
    if (this.statusIndicator) this.statusIndicator.className = `status-indicator ${state}`;
  }

  openChat() {
    this.container.classList.remove("collapsed");
    this.fab.classList.add("hidden");
    if (this.isReady) this.inputEl.focus();
  }

  closeChat() {
    this.container.classList.add("collapsed");
    this.fab.classList.remove("hidden");
  }

  toggleChat() {
    if (this.container.classList.contains("collapsed")) this.openChat();
    else this.closeChat();
  }

  clearChat() {
    const context = this.getCurrentReportContext();
    this.currentQuizQuestions = [];
    this.activeQuizQuestion = null;
    this.activeQuizIndex = null;
    if (this.quizQuestions) this.quizQuestions.innerHTML = "";

    if (context && this.isReady) {
      this.messages = [{
        role: "system",
        content: this.buildSystemPrompt(context),
      }];
      this.messagesEl.innerHTML = `
        <div class="ai-chat-message ai">
          <div class="message-bubble markdown-content">Chat cleared. I still have this report loaded, including topic summary, weak areas, and question detail. What would you like to study?</div>
          <span class="message-time">Just now</span>
        </div>
      `;
      return;
    }

    this.messages = [];
    this.messagesEl.innerHTML = `
      <div class="ai-chat-message ai">
        <div class="message-bubble markdown-content">${context
          ? "This report is ready. Load WebLLM or Gemini to start asking about weak topics and revision material."
          : "Open a single test report first, then load a model to start."}</div>
        <span class="message-time">Just now</span>
      </div>
    `;
  }

  toggleFullscreen() {
    const isFullscreen = this.container.classList.toggle("fullscreen");
    const icon = this.fullscreenBtn?.querySelector("i");
    if (icon) {
      icon.classList.toggle("fa-expand", !isFullscreen);
      icon.classList.toggle("fa-compress", isFullscreen);
    }
    this.fullscreenBtn?.setAttribute("title", isFullscreen ? "Exit fullscreen" : "Toggle fullscreen");
  }

  handleQuickAction(action) {
    if (!this.isReady) {
      this.addMessage("ai", "Load WebLLM or Gemini first so I can work with this report.");
      return;
    }

    const context = this.getCurrentReportContext();
    if (!context) {
      this.addMessage("ai", "I need a single test report to prepare the right context.");
      return;
    }

    if (action === "summary") {
      this.addMessage("user", "Summarize this report and tell me what to study next.");
      this.generateResponse([
        "Summarize this test report in markdown.",
        "Include strengths, weak topics, and a short next-step study plan.",
        "",
        context.contextText.substring(0, 12000),
      ].join("\n"));
    } else if (action === "weak-topics") {
      this.addMessage("user", "Create study material for my weak topics.");
      this.generateResponse([
        "Create markdown study material focused on the weakest topics only.",
        "For each weak topic include: a simple explanation, 1 short example, common mistakes, and a 3-step revision checklist.",
        "",
        context.contextText.substring(0, 12000),
      ].join("\n"));
    } else if (action === "questions") {
      this.addMessage("user", "Generate practice questions from my weak topics.");
      this.generateResponse([
        "Create 5 practice questions from the student's weak topics.",
        "Return markdown with numbered questions and bold answers.",
        "",
        context.contextText.substring(0, 12000),
      ].join("\n"));
    }
  }

  useSamplePrompt(prompt) {
    if (!prompt) return;
    if (!this.isReady) {
      navigator.clipboard.writeText(prompt).then(() => {
        this.addMessage("ai", "Prompt copied to clipboard! You can paste it into any AI service. Load a model to chat here directly.");
      }).catch(() => {
        this.addMessage("ai", `Copy this prompt to use elsewhere:\n\n${prompt}\n\nLoad a model to chat here directly.`);
      });
      return;
    }
    this.addMessage("user", prompt);
    this.generateResponse(`${prompt}\n\nUse this report context:\n${this.getCurrentReportContext().contextText.substring(0, 12000)}`);
  }

  async sendMessage() {
    if (!this.isReady || this.isLoading) {
      if (!this.isReady) this.addMessage("ai", "Load WebLLM or Gemini first so I can answer using this report.");
      return;
    }

    const text = this.inputEl.value.trim();
    if (!text) return;

    this.addMessage("user", text);
    this.inputEl.value = "";
    this.inputEl.style.height = "auto";

    const wasQuizAnswer = await this.handleQuizAnswer(text);
    if (wasQuizAnswer) return;

    const context = this.getCurrentReportContext();
    const prompt = [
      text,
      "",
      "Answer using the test report context below. Focus on weak topics and wrong answers when relevant.",
      context ? context.contextText.substring(0, 12000) : "",
    ].join("\n");
    console.log("Sending user message with prompt:", { text, prompt });

    await this.generateResponse(prompt);
  }

  async generateResponse(prompt) {
    this.isLoading = true;
    this.showTyping();
    this.sendBtn.disabled = true;

    try {
      this.messages.push({ role: "user", content: prompt });
      let responseText = "";
      if (this.provider === "gemini") {
        responseText = await this.generateGeminiResponse(this.messages, { temperature: 0.7, maxOutputTokens: 1200 });
      } else {
        const reply = await this.engine.chat.completions.create({
          messages: this.messages,
          temperature: 0.7,
          max_tokens: 1200,
        });
        responseText = reply.choices[0].message.content;
      }
      this.messages.push({ role: "assistant", content: responseText });
      if (this.messages.length > 12) {
        this.messages = [this.messages[0], ...this.messages.slice(-11)];
      }
      this.hideTyping();
      this.addMessage("ai", responseText);
    } catch (error) {
      console.error("AI response error:", error);
      this.hideTyping();
      this.addMessage("ai", this.formatAIError(error, "response"));
    } finally {
      this.isLoading = false;
      this.sendBtn.disabled = false;
    }
  }

  async generateGeminiResponse(messages, generationConfig = { temperature: 0.7, maxOutputTokens: 1200 }) {
    const apiKey = (this.geminiApiKeyInput?.value || this.getSavedGeminiApiKey()).trim();
    if (!apiKey) throw new Error("Gemini API key missing");

    const modelId = this.getSelectedModelId();
    const systemMessage = messages.find((message) => message.role === "system")?.content || "";
    const contents = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      }));

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: systemMessage ? { parts: [{ text: systemMessage }] } : undefined,
        contents,
        generationConfig,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Gemini request failed with ${response.status}`);
    }

    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim() || "No response returned.";
  }

  async generateQuizQuestions() {
    const context = this.getCurrentReportContext();
    if (!this.isReady) {
      this.addMessage("ai", "Load WebLLM or Gemini first so I can generate quiz questions.");
      return;
    }
    if (!context) {
      this.addMessage("ai", "I need a single test report before I can generate a quiz.");
      return;
    }

    this.quizGenerateBtn.disabled = true;
    this.quizGenerateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
    this.quizQuestions.innerHTML = "";

    try {
      const prompt = [
        "Generate 3 to 5 simple factual or conceptual quiz questions based mainly on the student's weak topics.",
        "Format exactly like:",
        "Q: <question>",
        "A: <answer>",
        "",
        "Keep each answer short and study-oriented.",
        "",
        context.contextText.substring(0, 12000),
      ].join("\n");

      const response = this.provider === "gemini"
        ? await this.generateGeminiResponse([{ role: "user", content: prompt }], { temperature: 0.7, maxOutputTokens: 1000 })
        : (await this.engine.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            max_tokens: 1000,
          })).choices[0].message.content || "";
      const qaPairs = [];
      let currentQuestion = null;

      response.split("\n").forEach((line) => {
        const trimmed = line.trim();
        if (/^Q\s*:/i.test(trimmed)) {
          currentQuestion = trimmed.replace(/^Q\s*:\s*/i, "").trim();
        } else if (/^A\s*:/i.test(trimmed) && currentQuestion) {
          qaPairs.push({
            question: currentQuestion,
            answer: trimmed.replace(/^A\s*:\s*/i, "").trim(),
          });
          currentQuestion = null;
        }
      });

      this.currentQuizQuestions = qaPairs.length ? qaPairs : [{
        question: "What topic needs the most revision in this report?",
        answer: context.weakTopics[0]
          ? `${context.weakTopics[0].subject}${context.weakTopics[0].chapter ? ` > ${context.weakTopics[0].chapter}` : ""} > ${context.weakTopics[0].topic}`
          : "No weak topic identified.",
      }];
      this.renderQuizQuestions();
    } catch (error) {
      console.error("Quiz generation error:", error);
      this.addMessage("ai", this.formatAIError(error, "quiz generation"));
    } finally {
      this.quizGenerateBtn.disabled = false;
      this.quizGenerateBtn.innerHTML = '<i class="fas fa-magic"></i> Generate Quiz Questions';
    }
  }

  renderQuizQuestions() {
    this.quizQuestions.innerHTML = "";
    this.currentQuizQuestions.forEach((qaPair, index) => {
      const wrapper = document.createElement("div");
      wrapper.style.marginBottom = "8px";

      const questionBtn = document.createElement("button");
      questionBtn.className = "ai-quiz-question-btn";
      questionBtn.innerHTML = `<i class="fas fa-question-circle"></i> ${index + 1}. ${this.escapeHtml(qaPair.question)}`;
      questionBtn.addEventListener("click", () => this.selectQuizQuestion(qaPair.question, index));

      const answerBtn = document.createElement("button");
      answerBtn.className = "ai-quiz-view-btn";
      answerBtn.innerHTML = '<i class="fas fa-eye"></i>';
      answerBtn.title = "View answer";
      answerBtn.addEventListener("click", () => this.viewQuizAnswer(qaPair, index));

      wrapper.appendChild(questionBtn);
      wrapper.appendChild(answerBtn);
      this.quizQuestions.appendChild(wrapper);
    });
  }

  selectQuizQuestion(question, index) {
    this.activeQuizQuestion = question;
    this.activeQuizIndex = index;
    this.inputEl.placeholder = `Answer: ${question}`;
    this.inputEl.focus();
    document.querySelectorAll(".ai-quiz-question-btn").forEach((btn, btnIndex) => {
      btn.style.borderColor = btnIndex === index ? "#1f6feb" : "#d6dce5";
      btn.style.background = btnIndex === index ? "#eff6ff" : "#fff";
    });
    this.addMessage("ai", `Selected quiz question ${index + 1}. Type your answer below and I'll compare it with the expected answer.`);
  }

  viewQuizAnswer(qaPair, index) {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const messageEl = document.createElement("div");
    messageEl.className = "ai-chat-message ai";
    messageEl.innerHTML = `
      <div class="message-bubble markdown-content">
        <p><strong>Q${index + 1}:</strong> ${this.escapeHtml(qaPair.question)}</p>
        <p><strong>Answer:</strong> ${this.escapeHtml(qaPair.answer)}</p>
      </div>
      <span class="message-time">${time}</span>
    `;
    this.messagesEl.appendChild(messageEl);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  async handleQuizAnswer(text) {
    if (!this.activeQuizQuestion || this.activeQuizIndex === null) return false;

    const qaPair = this.currentQuizQuestions[this.activeQuizIndex];
    this.activeQuizQuestion = null;
    this.activeQuizIndex = null;
    this.inputEl.placeholder = "Ask about this report...";
    document.querySelectorAll(".ai-quiz-question-btn").forEach((btn) => {
      btn.style.borderColor = "#d6dce5";
      btn.style.background = "#fff";
    });
    this.addMessage("ai", "Evaluating your answer...");

    try {
      const messages = [
        {
          role: "system",
          content: "You are a supportive study coach. Compare the student's answer with the expected answer, appreciate what is correct, gently fix mistakes, and keep the response concise in markdown.",
        },
        {
          role: "user",
          content: `Question: ${qaPair.question}\nExpected answer: ${qaPair.answer}\nStudent answer: ${text}`,
        },
      ];
      const feedback = this.provider === "gemini"
        ? await this.generateGeminiResponse(messages, { temperature: 0.7, maxOutputTokens: 700 })
        : (await this.engine.chat.completions.create({
            messages,
            temperature: 0.7,
            max_tokens: 700,
          })).choices[0].message.content.trim();
      this.addMessage("ai", feedback);
    } catch (error) {
      console.error("Quiz evaluation error:", error);
      this.addMessage("ai", this.formatAIError(error, "quiz evaluation"));
    }

    return true;
  }

  addMessage(role, text) {
    const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const messageEl = document.createElement("div");
    messageEl.className = `ai-chat-message ${role}`;
    const content = role === "ai" && typeof marked !== "undefined"
      ? marked.parse(text)
      : this.escapeHtml(text);
    messageEl.innerHTML = `
      <div class="message-bubble markdown-content">${content}</div>
      <span class="message-time">${time}</span>
    `;
    this.messagesEl.appendChild(messageEl);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  showTyping() {
    const typingEl = document.createElement("div");
    typingEl.className = "ai-chat-message ai";
    typingEl.id = "typingIndicator";
    typingEl.innerHTML = `
      <div class="message-bubble ai-chat-typing">
        <span></span><span></span><span></span>
      </div>
    `;
    this.messagesEl.appendChild(typingEl);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  hideTyping() {
    const typingEl = document.getElementById("typingIndicator");
    if (typingEl) typingEl.remove();
  }

  showError(message) {
    const errorEl = document.createElement("div");
    errorEl.className = "ai-chat-error";
    errorEl.textContent = message;
    this.messagesEl.appendChild(errorEl);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  escapeHtml(text) {
    return escapeHtml(text);
  }
}

function getLetter(index) {
  const letters = ['A', 'B', 'C', 'D'];
  return letters[index - 1] || null; // returns null if out of range
}

function buildGroupedPerformanceRows(records, keys, scoringRules, { wrongOnly = false } = {}) {
  const groups = new Map();

  (records || []).forEach((record) => {
    const values = keys.map((key) => record[key] || "—");
    const groupKey = values.join("|||");
    if (!groups.has(groupKey)) groups.set(groupKey, { values, records: [] });
    groups.get(groupKey).records.push(record);
  });

  return Array.from(groups.values())
    .map((entry) => ({
      values: entry.values,
      metrics: calculatePerformanceMetrics(entry.records, scoringRules),
    }))
    .filter((entry) => !wrongOnly || entry.metrics.wrong > 0)
    .sort((a, b) => {
      if (wrongOnly && b.metrics.wrong !== a.metrics.wrong) return b.metrics.wrong - a.metrics.wrong;
      return a.values.join(" ").localeCompare(b.values.join(" "));
    });
}

function renderPerformanceTableSection(title, columns, rows, emptyMessage, tableId) {
  const tableAttr = tableId ? ` id="${escapeHtml(tableId)}"` : '';
  return `
    <div class="mb-4">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h6 class="fw-bold mb-0">${escapeHtml(title)}</h6>
        <span class="text-muted small">${rows.length} row${rows.length === 1 ? "" : "s"}</span>
      </div>
      ${rows.length ? `
        <div class="table-responsive">
          <table class="table table-sm align-middle mb-0"${tableAttr}>
            <thead>
              <tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
            </thead>
            <tbody>${rows.join("")}</tbody>
          </table>
        </div>
      ` : `<div class="text-muted small">${escapeHtml(emptyMessage)}</div>`}
    </div>
  `;
}

function renderSubjectStatsTable(records, scoringRules) {
  const subjectRows = buildGroupedPerformanceRows(records, ["subject"], scoringRules)
    .map(({ values, metrics }) => `
      <tr>
        <td>${escapeHtml(values[0])}</td>
        <td>${metrics.total}</td>
        <td>${metrics.correct}</td>
        <td>${metrics.wrong}</td>
        <td>${metrics.skipped}</td>
        <td>${formatScoreDisplay(metrics)}</td>
        <td>${metrics.marks.toFixed(1)}%</td>
        <td>${escapeHtml(metrics.grade)}</td>
        <td>${metrics.gradePoint}</td>
        <td><span class="badge ${metrics.passed ? "bg-success" : "bg-danger"}">${metrics.passed ? "Pass" : "Fail"}</span></td>
      </tr>
    `);

  // Check if there's actual chapter/topic/subtopic data (not just "—" placeholders)
  const hasChapterData = (records || []).some((r) => r.chapter && r.chapter.trim() && r.chapter !== "—");
  const hasTopicData = (records || []).some((r) => r.topic && r.topic.trim() && r.topic !== "—");
  const hasSubtopicData = (records || []).some((r) => r.subtopic && r.subtopic.trim() && r.subtopic !== "—");

  const chapterRows = buildGroupedPerformanceRows(records, ["subject", "chapter"], scoringRules, { wrongOnly: true })
    .map(({ values, metrics }) => `
      <tr>
        <td>${escapeHtml(values[0])}</td>
        <td>${escapeHtml(values[1])}</td>
        <td>${metrics.total}</td>
        <td>${metrics.wrong}</td>
        <td>${metrics.skipped}</td>
        <td>${metrics.correct}</td>
        <td>${metrics.marks.toFixed(1)}%</td>
      </tr>
    `);

  const topicRows = buildGroupedPerformanceRows(records, ["subject", "chapter", "topic"], scoringRules, { wrongOnly: true })
    .map(({ values, metrics }) => `
      <tr>
        <td>${escapeHtml(values[0])}</td>
        <td>${escapeHtml(values[1])}</td>
        <td>${escapeHtml(values[2])}</td>
        <td>${metrics.total}</td>
        <td>${metrics.wrong}</td>
        <td>${metrics.skipped}</td>
        <td>${metrics.correct}</td>
        <td>${metrics.marks.toFixed(1)}%</td>
      </tr>
    `);

  const subtopicRows = buildGroupedPerformanceRows(records, ["subject", "chapter", "topic", "subtopic"], scoringRules, { wrongOnly: true })
    .map(({ values, metrics }) => `
      <tr>
        <td>${escapeHtml(values[0])}</td>
        <td>${escapeHtml(values[1])}</td>
        <td>${escapeHtml(values[2])}</td>
        <td>${escapeHtml(values[3])}</td>
        <td>${metrics.total}</td>
        <td>${metrics.wrong}</td>
        <td>${metrics.skipped}</td>
        <td>${metrics.correct}</td>
        <td>${metrics.marks.toFixed(1)}%</td>
      </tr>
    `);

  const sections = [
    renderPerformanceTableSection(
      "Per Subject Stats",
      ["Subject", "Questions", "Correct", "Wrong", "Skipped", "Score", "Score %", "Grade", "Point", "Status"],
      subjectRows,
      "No subject data available for the current filter.",
      "statsTableSubject"
    ),
  ];

  if (hasChapterData) {
    sections.push(renderPerformanceTableSection(
      "Chapter Stats",
      ["Subject", "Chapter", "Questions", "Wrong", "Skipped", "Correct", "Score %"],
      chapterRows,
      "No chapters with wrong answers for the current filter.",
      "statsTableChapter"
    ));
  }

  if (hasTopicData) {
    sections.push(renderPerformanceTableSection(
      "Topic Stats",
      ["Subject", "Chapter", "Topic", "Questions", "Wrong", "Skipped", "Correct", "Score %"],
      topicRows,
      "No topics with wrong answers for the current filter.",
      "statsTableTopic"
    ));
  }

  if (hasSubtopicData) {
    sections.push(renderPerformanceTableSection(
      "Subtopic Stats",
      ["Subject", "Chapter", "Topic", "Subtopic", "Questions", "Wrong", "Skipped", "Correct", "Score %"],
      subtopicRows,
      "No subtopics with wrong answers for the current filter.",
      "statsTableSubtopic"
    ));
  }

  return sections.join("");
}

function renderQuestionTable(records) {
  if (!records.length) {
    return `<div class="text-muted small">No questions available for the current filter.</div>`;
  }

  const rows = records.map((record) => `
    <tr>
      <td>${record.questionNumber}</td>
      <td class="question-field question-field-subject">${escapeHtml(record.subject || "—")}</td>
      <td class="question-field question-field-chapter">${escapeHtml(record.chapter || "—")}</td>
      <td class="question-field question-field-topic">${escapeHtml(record.topic || "—")}</td>
      <td class="question-field question-field-subtopic">${escapeHtml(record.subtopic || "—")}</td>
      <td class="question-field question-field-question report-rich-text">${renderRichText(record.questionText, "—")}</td>
      <td>${escapeHtml(record.statusLabel || "—")}</td>
      <td class="question-field question-field-answer">${renderAnswerLabel(record.userAnswerLabel)}</td>
      <td class="question-field question-field-answer">${renderAnswerLabel(record.correctAnswerLabel)}</td>
      <td class="question-field question-field-options report-rich-text">${(record.options || []).length ? record.options.map(renderAnswerLabel).join(" ") : "—"}</td>
      <td class="question-field question-field-explanation report-rich-text">${renderRichText(record.explanation, "—")}</td>
    </tr>
  `).join("");

  return `
    <div class="table-responsive">
      <table class="table table-sm align-middle mb-0" id="questionsTableView">
        <thead>
          <tr>
            <th><button class="btn btn-link btn-sm p-0 question-sort" type="button" data-sort-key="questionNumber">Q No</button></th>
            <th class="question-field question-field-subject"><button class="btn btn-link btn-sm p-0 question-sort" type="button" data-sort-key="subject">Subject</button></th>
            <th class="question-field question-field-chapter"><button class="btn btn-link btn-sm p-0 question-sort" type="button" data-sort-key="chapter">Chapter</button></th>
            <th class="question-field question-field-topic"><button class="btn btn-link btn-sm p-0 question-sort" type="button" data-sort-key="topic">Topic</button></th>
            <th class="question-field question-field-subtopic"><button class="btn btn-link btn-sm p-0 question-sort" type="button" data-sort-key="subtopic">Subtopic</button></th>
            <th class="question-field question-field-question"><button class="btn btn-link btn-sm p-0 question-sort" type="button" data-sort-key="questionText">Question</button></th>
            <th><button class="btn btn-link btn-sm p-0 question-sort" type="button" data-sort-key="status">Status</button></th>
            <th class="question-field question-field-answer"><button class="btn btn-link btn-sm p-0 question-sort" type="button" data-sort-key="userAnswerLabel">Your Answer</button></th>
            <th class="question-field question-field-answer"><button class="btn btn-link btn-sm p-0 question-sort" type="button" data-sort-key="correctAnswerLabel">Correct Answer</button></th>
            <th class="question-field question-field-options">Options</th>
            <th class="question-field question-field-explanation">Explanation</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function initStatsDataTables() {
  if (!window.simpleDatatables?.DataTable) return;

  // Destroy existing DataTables
  Object.values(statsDataTables).forEach((dt) => dt?.destroy?.());
  statsDataTables = {};

  const tableConfigs = {
    statsTableSubject: {
      perPage: 10,
      columns: [
        { select: 0, sort: "asc" }, // Subject
        { select: 1, type: "number", sort: "desc" }, // Questions
        { select: 2, type: "number", sort: "desc" }, // Correct
        { select: 3, type: "number", sort: "desc" }, // Wrong
        { select: 4, type: "number", sort: "desc" }, // Skipped
        { select: 5, sort: "desc" }, // Score
        { select: 6, type: "number", sort: "desc" }, // Score %
        { select: 7, sort: "asc" }, // Grade
        { select: 8, type: "number", sort: "desc" }, // Point
        { select: 9, sort: "asc" }, // Status
      ],
    },
    statsTableChapter: {
      perPage: 10,
      columns: [
        { select: 0, sort: "asc" }, // Subject
        { select: 1, sort: "asc" }, // Chapter
        { select: 2, type: "number", sort: "desc" }, // Questions
        { select: 3, type: "number", sort: "desc" }, // Wrong
        { select: 4, type: "number", sort: "desc" }, // Skipped
        { select: 5, type: "number", sort: "desc" }, // Correct
        { select: 6, type: "number", sort: "desc" }, // Score %
      ],
    },
    statsTableTopic: {
      perPage: 10,
      columns: [
        { select: 0, sort: "asc" }, // Subject
        { select: 1, sort: "asc" }, // Chapter
        { select: 2, sort: "asc" }, // Topic
        { select: 3, type: "number", sort: "desc" }, // Questions
        { select: 4, type: "number", sort: "desc" }, // Wrong
        { select: 5, type: "number", sort: "desc" }, // Skipped
        { select: 6, type: "number", sort: "desc" }, // Correct
        { select: 7, type: "number", sort: "desc" }, // Score %
      ],
    },
    statsTableSubtopic: {
      perPage: 10,
      columns: [
        { select: 0, sort: "asc" }, // Subject
        { select: 1, sort: "asc" }, // Chapter
        { select: 2, sort: "asc" }, // Topic
        { select: 3, sort: "asc" }, // Subtopic
        { select: 4, type: "number", sort: "desc" }, // Questions
        { select: 5, type: "number", sort: "desc" }, // Wrong
        { select: 6, type: "number", sort: "desc" }, // Skipped
        { select: 7, type: "number", sort: "desc" }, // Correct
        { select: 8, type: "number", sort: "desc" }, // Score %
      ],
    },
  };

  Object.entries(tableConfigs).forEach(([tableId, config]) => {
    const table = document.getElementById(tableId);
    if (table) {
      statsDataTables[tableId] = new window.simpleDatatables.DataTable(table, {
        searchable: true,
        fixedHeight: true,
        perPage: config.perPage,
        columns: config.columns,
      });
    }
  });
}

function initSingleTestInsights() {
  const toggle = document.getElementById("wrongOnlyToggle");
  const subjectFilter = document.getElementById("subjectFilter");
  const chapterFilter = document.getElementById("chapterFilter");
  const topicFilter = document.getElementById("topicFilter");
  const subtopicFilter = document.getElementById("subtopicFilter");
  const status = document.getElementById("question-filter-status");
  const chartTypeSelect = document.getElementById("chartTypeFilter");
  const chartGroupSelect = document.getElementById("chartGroupFilter");
  const scoreCorrectInput = document.getElementById("scoreCorrect");
  const scoreWrongInput = document.getElementById("scoreWrong");
  const scoreSkippedInput = document.getElementById("scoreSkipped");
  const resetScoringBtn = document.getElementById("resetScoringBtn");
  const statsCards = document.getElementById("statsCards");
  const subjectStatsTable = document.getElementById("subjectStatsTable");
  const chartCanvas = document.getElementById("performanceBreakdownChart");
  const questionsCardView = document.getElementById("questionsCardView");
  const questionsTableView = document.getElementById("questionsTableViewWrap");
  const questionViewButtons = Array.from(document.querySelectorAll("[data-question-view]"));
  const fieldToggles = Array.from(document.querySelectorAll(".question-field-toggle"));
  const questionItems = Array.from(document.querySelectorAll(".question-item"));

  if (
    !toggle || !status || !subjectFilter || !chapterFilter || !topicFilter || !subtopicFilter ||
    !chartTypeSelect || !chartGroupSelect || !scoreCorrectInput || !scoreWrongInput ||
    !scoreSkippedInput || !statsCards || !subjectStatsTable || !chartCanvas || !questionsCardView || !questionsTableView
  ) {
    return;
  }

  let chart = null;
  let currentQuestionSort = { key: "questionNumber", direction: "asc" };
  let currentQuestionView = "card";

  const getFilters = () => ({
    subjects: getSelectedValues(subjectFilter),
    chapters: getSelectedValues(chapterFilter),
    topics: getSelectedValues(topicFilter),
    subtopics: getSelectedValues(subtopicFilter),
  });

  const updateFilterOptions = (filters) => {
    const subjectValues = [...new Set(getScopedQuestionRecords(currentTestQuestionsData, filters, "subject").map((record) => record.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const chapterValues = [...new Set(getScopedQuestionRecords(currentTestQuestionsData, filters, "chapter").map((record) => record.chapter).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const topicValues = [...new Set(getScopedQuestionRecords(currentTestQuestionsData, filters, "topic").map((record) => record.topic).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const subtopicValues = [...new Set(getScopedQuestionRecords(currentTestQuestionsData, filters, "subtopic").map((record) => record.subtopic).filter(Boolean))].sort((a, b) => a.localeCompare(b));

    updateMultiSelectOptions(subjectFilter, subjectValues, "No matching subjects", filters.subjects);
    updateMultiSelectOptions(chapterFilter, chapterValues, "No matching chapters", filters.chapters);
    updateMultiSelectOptions(topicFilter, topicValues, "No matching topics", filters.topics);
    updateMultiSelectOptions(subtopicFilter, subtopicValues, "No matching subtopics", filters.subtopics);
  };

  const renderStats = (records, scoringRules) => {
    const overallMetrics = calculatePerformanceMetrics(records, scoringRules);
    const subjectMetrics = Array.from(
      records.reduce((map, record) => {
        const subject = record.subject || "General";
        if (!map.has(subject)) map.set(subject, []);
        map.get(subject).push(record);
        return map;
      }, new Map()).values()
    ).map((subjectRecords) => calculatePerformanceMetrics(subjectRecords, scoringRules));

    const cgpa = subjectMetrics.length
      ? subjectMetrics.reduce((sum, metric) => sum + metric.gradePoint, 0) / subjectMetrics.length
      : 0;
    const hasRecords = records.length > 0;

    statsCards.innerHTML = `
      <div class="col-md-6 col-xl-3">
        <div class="card shadow-sm h-100 report-stat-card">
          <div class="card-body">
            <div class="text-muted small mb-1">Correct</div>
            <div class="report-stat-value text-success">${overallMetrics.correct}</div>
          </div>
        </div>
      </div>
      <div class="col-md-6 col-xl-3">
        <div class="card shadow-sm h-100 report-stat-card">
          <div class="card-body">
            <div class="text-muted small mb-1">Wrong</div>
            <div class="report-stat-value text-danger">${overallMetrics.wrong}</div>
          </div>
        </div>
      </div>
      <div class="col-md-6 col-xl-3">
        <div class="card shadow-sm h-100 report-stat-card">
          <div class="card-body">
            <div class="text-muted small mb-1">Skipped</div>
            <div class="report-stat-value text-warning">${overallMetrics.skipped}</div>
          </div>
        </div>
      </div>
      <div class="col-md-6 col-xl-3">
        <div class="card shadow-sm h-100 report-stat-card">
          <div class="card-body">
            <div class="text-muted small mb-1">Total Questions</div>
            <div class="report-stat-value text-primary">${overallMetrics.total}</div>
          </div>
        </div>
      </div>
      <div class="col-md-6 col-xl-4">
        <div class="card shadow-sm h-100 report-stat-card">
          <div class="card-body">
            <div class="text-muted small mb-1">Total Score</div>
            <div class="report-stat-value">${hasRecords ? formatScoreDisplay(overallMetrics) : "—"}</div>
            <div class="small text-muted">Recalculated using current scoring inputs</div>
          </div>
        </div>
      </div>
      <div class="col-md-6 col-xl-4">
        <div class="card shadow-sm h-100 report-stat-card">
          <div class="card-body">
            <div class="text-muted small mb-1">Score Percentage</div>
            <div class="report-stat-value">${hasRecords ? `${overallMetrics.marks.toFixed(1)}%` : "—"}</div>
            <div class="small text-muted">${hasRecords ? "Based on total score, not question count" : "No questions in current selection"}</div>
          </div>
        </div>
      </div>
      <div class="col-md-6 col-xl-4">
        <div class="card shadow-sm h-100 report-stat-card">
          <div class="card-body">
            <div class="text-muted small mb-1">Grade</div>
            <div class="report-stat-value">${escapeHtml(hasRecords ? overallMetrics.grade : "—")}</div>
            <div class="small text-muted">${hasRecords ? `Grade point ${overallMetrics.gradePoint}` : "Adjust filters to view grade"}</div>
          </div>
        </div>
      </div>
      <div class="col-md-12 col-xl-4">
        <div class="card shadow-sm h-100 report-stat-card">
          <div class="card-body">
            <div class="text-muted small mb-1">CGPA</div>
            <div class="report-stat-value">${hasRecords ? cgpa.toFixed(2) : "—"}</div>
            <div class="small text-muted">${hasRecords ? "Average grade points across subjects" : "Adjust filters to view CGPA"}</div>
          </div>
        </div>
      </div>
      <div class="col-md-12 col-xl-4">
        <div class="card shadow-sm h-100 report-stat-card">
          <div class="card-body">
            <div class="text-muted small mb-1">Pass Rule</div>
            <div class="fw-semibold">${hasRecords ? (subjectMetrics.every((metric) => metric.passed) ? "Pass" : "Fail") : "—"}</div>
            <div class="small text-muted">${hasRecords ? "Minimum 33% marks required in each subject" : "No subject data in current selection"}</div>
          </div>
        </div>
      </div>
    `;

    subjectStatsTable.innerHTML = renderSubjectStatsTable(records, scoringRules);

    // Initialize DataTables on stats tables
    initStatsDataTables();
  };

  const applyFieldVisibility = () => {
    const enabledFields = new Set(fieldToggles.filter((toggleEl) => toggleEl.checked).map((toggleEl) => toggleEl.value));
    getFieldToggleDefinitions().forEach((field) => {
      const isVisible = enabledFields.has(field.key);
      document.querySelectorAll(`.question-field-${field.key}`).forEach((element) => {
        element.classList.toggle("d-none", !isVisible);
      });
    });
  };

  const renderQuestionViews = (records) => {
    const sortedRecords = [...records].sort((a, b) => {
      const left = a[currentQuestionSort.key] ?? "";
      const right = b[currentQuestionSort.key] ?? "";
      if (typeof left === "number" && typeof right === "number") {
        return currentQuestionSort.direction === "asc" ? left - right : right - left;
      }
      return currentQuestionSort.direction === "asc"
        ? String(left).localeCompare(String(right))
        : String(right).localeCompare(String(left));
    });

    questionItems.forEach((item) => {
      const questionNumber = Number(item.dataset.questionNumber);
      const record = sortedRecords.find((entry) => entry.questionNumber === questionNumber);
      const shouldShow = Boolean(record);
      item.classList.toggle("d-none", !shouldShow);
      if (shouldShow) questionsCardView.appendChild(item);
    });

    questionsTableView.innerHTML = renderQuestionTable(sortedRecords);
    questionsCardView.classList.toggle("d-none", currentQuestionView !== "card");
    questionsTableView.classList.toggle("d-none", currentQuestionView !== "table");
    questionViewButtons.forEach((button) => {
      const active = button.dataset.questionView === currentQuestionView;
      button.classList.toggle("btn-dark", active);
      button.classList.toggle("btn-outline-secondary", !active);
    });
    applyFieldVisibility();

    questionsTableView.querySelectorAll(".question-sort").forEach((button) => {
      button.addEventListener("click", () => {
        const sortKey = button.dataset.sortKey;
        currentQuestionSort = {
          key: sortKey,
          direction: currentQuestionSort.key === sortKey && currentQuestionSort.direction === "asc" ? "desc" : "asc",
        };
        renderQuestionViews(records);
      });
    });
  };

  const renderChart = (records) => {
    if (typeof Chart === "undefined") return;
    const groupKey = chartGroupSelect.value || "subject";
    const chartType = chartTypeSelect.value || "bar";
    const aggregateMap = new Map();

    records.forEach((record) => {
      const key = record[groupKey] || "General";
      if (!aggregateMap.has(key)) {
        aggregateMap.set(key, { label: key, correct: 0, wrong: 0, skipped: 0 });
      }
      const entry = aggregateMap.get(key);
      if (record.status === "correct") entry.correct += 1;
      else if (record.status === "skipped") entry.skipped += 1;
      else entry.wrong += 1;
    });

    const entries = Array.from(aggregateMap.values())
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(0, 20);

    if (chart) chart.destroy();

    chart = new Chart(chartCanvas.getContext("2d"), {
      type: chartType,
      data: {
        labels: entries.map((entry) => entry.label),
        datasets: [
          { label: "Correct", data: entries.map((entry) => entry.correct), backgroundColor: "rgba(22, 163, 74, 0.7)", borderColor: "#16a34a", borderWidth: 1 },
          { label: "Wrong", data: entries.map((entry) => entry.wrong), backgroundColor: "rgba(220, 38, 38, 0.7)", borderColor: "#dc2626", borderWidth: 1 },
          { label: "Skipped", data: entries.map((entry) => entry.skipped), backgroundColor: "rgba(245, 158, 11, 0.7)", borderColor: "#f59e0b", borderWidth: 1 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: { legend: { position: "bottom" } },
        scales: ["bar", "line"].includes(chartType)
          ? {
              x: { stacked: chartType === "bar" },
              y: { beginAtZero: true, stacked: chartType === "bar", ticks: { precision: 0 } },
            }
          : {},
      },
    });
  };

  const updateView = () => {
    const filters = getFilters();
    updateFilterOptions(filters);
    const syncedFilters = getFilters();
    const scoringRules = {
      correct: parseScoreInput(scoreCorrectInput.value, DEFAULT_SCORING_RULES.correct),
      wrong: parseScoreInput(scoreWrongInput.value, DEFAULT_SCORING_RULES.wrong),
      skipped: parseScoreInput(scoreSkippedInput.value, DEFAULT_SCORING_RULES.skipped),
    };
    const visibleRecords = currentTestQuestionsData.filter((record) => (
      matchesMultiValueFilter(record.subject, syncedFilters.subjects) &&
      matchesMultiValueFilter(record.chapter, syncedFilters.chapters) &&
      matchesMultiValueFilter(record.topic, syncedFilters.topics) &&
      matchesMultiValueFilter(record.subtopic, syncedFilters.subtopics)
    ));
    const displayedRecords = toggle.checked
      ? visibleRecords.filter((record) => record.status !== "correct")
      : visibleRecords;

    const activeFilters = [];
    if (toggle.checked) activeFilters.push("wrong and skipped only");
    if (syncedFilters.subjects.length) activeFilters.push(`Subjects: ${syncedFilters.subjects.join(", ")}`);
    if (syncedFilters.chapters.length) activeFilters.push(`Chapters: ${syncedFilters.chapters.join(", ")}`);
    if (syncedFilters.topics.length) activeFilters.push(`Topics: ${syncedFilters.topics.join(", ")}`);
    if (syncedFilters.subtopics.length) activeFilters.push(`Subtopics: ${syncedFilters.subtopics.join(", ")}`);

    status.textContent = activeFilters.length
      ? `Showing ${displayedRecords.length} question${displayedRecords.length === 1 ? "" : "s"} for ${activeFilters.join(" | ")}`
      : `Showing all ${questionItems.length} questions`;

    renderStats(visibleRecords, scoringRules);
    renderChart(visibleRecords);
    renderQuestionViews(displayedRecords);
  };

  [
    toggle,
    subjectFilter,
    chapterFilter,
    topicFilter,
    subtopicFilter,
    chartTypeSelect,
    chartGroupSelect,
    scoreCorrectInput,
    scoreWrongInput,
    scoreSkippedInput,
  ].forEach((element) => element.addEventListener("change", updateView));

  [scoreCorrectInput, scoreWrongInput, scoreSkippedInput].forEach((element) => element.addEventListener("input", updateView));
  fieldToggles.forEach((fieldToggle) => fieldToggle.addEventListener("change", applyFieldVisibility));
  questionViewButtons.forEach((button) => button.addEventListener("click", () => {
    currentQuestionView = button.dataset.questionView || "card";
    updateView();
  }));

  resetScoringBtn.addEventListener("click", () => {
    scoreCorrectInput.value = DEFAULT_SCORING_RULES.correct;
    scoreWrongInput.value = DEFAULT_SCORING_RULES.wrong;
    scoreSkippedInput.value = DEFAULT_SCORING_RULES.skipped;
    updateView();
  });

  updateFilterOptions(getFilters());
  updateView();
}

function renderSingleTestReport(test, result, student, studentId, testId, questionPaper) {
  console.log("Rendering report with test, result, student, questionPaper:", {
    test,
    result,
    student,
    questionPaper,
  });

  // remove section prefix from question keys to group them by question number
  /*for (let key in result) {
    if (key.includes('_Q')) {
      const newKey = key.replace(/^.+?_Q/, 'Q');
      result[newKey] = result[key];
      delete result[key];
    }
  }*/
  let questions = questionPaper?.questions || test.questions || [];
  let correct = 0;
  let total = 0;
  let questionsHtml = "";
  currentTestQuestionsData = [];

  if (!questions || questions.length === 0) {
    questions = [];

    for (let key in result) {
      if (key.includes('_Q') || key.startsWith('Q')) {
        let section = '';
        let questionNumber;

        if (key.includes('_Q')) {
          const match = key.match(/(.+)_Q(\d+)/);
          if (match) {
            [, section, questionNumber] = match;
          }
        } else if (key.startsWith('Q')) {
          const match = key.match(/Q(\d+)/);
          if (match) {
            section = 'General'; // or set default section
            [, questionNumber] = match;
          }
        }

        if (questionNumber) {
          const qNum = parseInt(questionNumber, 10);
          const isCorrect = result[key] === "R";

          questions[qNum - 1] = {
            questionNumber: qNum,
            section: section,
            isCorrect: isCorrect,
          };
        }
      }
    }

    // Remove undefined entries and sort
    questions = questions.filter(q => q !== undefined);
  }
  console.log("Final questions array for rendering:", questions);
  questions.forEach((question, index) => {
    const questionNumber = index + 1;
    const subject = normalizeFilterValue(question.Subject || question.section);

    // Build candidate keys to lookup user answer (handles various result key formats)
    const candidateKeys = [];
    if (question.subjectname_questionnumber) {
      candidateKeys.push(String(question.subjectname_questionnumber).replace("_", "_Q"));
    }
    candidateKeys.push(`${subject}_Q${questionNumber}`);
    candidateKeys.push(`Generic_Q${questionNumber}`);
    candidateKeys.push(`Q${questionNumber}`);
    // Also try subject_number format (e.g., "Mathematics_1")
    if (subject && subject !== "General") {
      candidateKeys.push(`${subject}_${questionNumber}`);
    }

    // Find first matching key in result
    let userAnswer = null;
    for (const key of candidateKeys) {
      if (Object.prototype.hasOwnProperty.call(result || {}, key)) {
        userAnswer = result[key];
        break;
      }
    }

    // Fallback: try to match by suffix if no exact match found
    if (userAnswer == null) {
      const suffix = `_Q${questionNumber}`;
      const suffixCandidates = Object.keys(result || {}).filter((key) => key.endsWith(suffix));
      if (suffixCandidates.length === 1) {
        userAnswer = result[suffixCandidates[0]];
      } else if (suffixCandidates.length > 1 && subject) {
        // If multiple candidates, try to match by subject
        const sameSubject = suffixCandidates.find((key) => key.startsWith(`${subject}_Q`));
        if (sameSubject) userAnswer = result[sameSubject];
      }
    }
    const chapter = normalizeFilterValue(question.Chapter);
    const topic = normalizeFilterValue(question.Topic);
    const subtopic = normalizeFilterValue(question.Subtopic);
    const isSkipped = !userAnswer || userAnswer === "" || userAnswer === "S";

    total += 1;
    const isCorrect = question.isCorrect || userAnswer === "R";
    const status = getQuestionStatus(userAnswer, isCorrect);
    if (isCorrect) correct += 1;

    const options = [1, 2, 3, 4].map((optionIndex) =>
      extractOptionText(question[`Option ${optionIndex}`])
    );

    const correctOption = getCorrectOptionNumber(question);
    const correctAnswerLabel = correctOption ? `${getLetter(correctOption)}. ${options[correctOption - 1] || ""}`.trim() : "";
    const userAnswerLabel = isSkipped
      ? "Skipped"
      : [1, 2, 3, 4].map((optionNumber) => {
          const isChosen = userAnswer === getLetter(optionNumber);
          return isChosen ? `${getLetter(optionNumber)}. ${options[optionNumber - 1] || ""}`.trim() : null;
        }).find(Boolean) || String(userAnswer || "");
    const feedbackCorrectAnswer = question.feedbackCorrectAnswer || question.feedback || question.explanation || question.solution;

    currentTestQuestionsData.push({
      questionNumber,
      subject,
      chapter,
      topic,
      subtopic,
      questionText: question.Question?.trim() || "",
      isCorrect,
      status,
      userAnswer: userAnswer || "",
      userAnswerLabel,
      correctAnswerLabel,
      options: options.filter(Boolean).map((optionText, optionIndex) => `${getLetter(optionIndex + 1)}. ${optionText}`),
      explanation: feedbackCorrectAnswer || "",
      statusLabel: status === "correct" ? "Correct" : status === "skipped" ? "Skipped" : "Wrong",
    });

    questionsHtml += `
      <div class="question-item"
           data-question-number="${questionNumber}"
           data-is-correct="${isCorrect ? "true" : "false"}"
           data-status="${status}"
           data-subject="${escapeHtml(subject)}"
           data-chapter="${escapeHtml(chapter)}"
           data-topic="${escapeHtml(topic)}"
           data-subtopic="${escapeHtml(subtopic)}">
        <div class="d-flex justify-content-between mb-3">
          <h6 class="fw-bold">Question ${questionNumber}</h6>
          <span class="badge ${status === "correct" ? "bg-success" : status === "skipped" ? "bg-warning text-dark" : "bg-danger"}">
            ${status === "correct" ? "Correct" : status === "skipped" ? "Skipped" : "Wrong"}
          </span>
        </div>
        ${(subject || chapter || topic || subtopic) ? `
          <div class="d-flex flex-wrap gap-2 mb-3">
            ${subject ? `<span class="badge bg-light text-dark border question-field question-field-subject">Subject: ${escapeHtml(subject)}</span>` : ""}
            ${chapter ? `<span class="badge bg-light text-dark border question-field question-field-chapter">Chapter: ${escapeHtml(chapter)}</span>` : ""}
            ${topic ? `<span class="badge bg-light text-dark border question-field question-field-topic">Topic: ${escapeHtml(topic)}</span>` : ""}
            ${subtopic ? `<span class="badge bg-light text-dark border question-field question-field-subtopic">Subtopic: ${escapeHtml(subtopic)}</span>` : ""}
          </div>
        ` : ""}
        ${question.Question?.trim()
        ? `<div class="mb-3 question-field question-field-question report-rich-text">${renderRichText(question.Question)}</div>`
        : ""}
        <div class="question-field question-field-answer small text-muted mb-3">
          <div><strong>Your Answer:</strong> ${renderAnswerLabel(userAnswerLabel)}</div>
          <div><strong>Correct Answer:</strong> ${renderAnswerLabel(correctAnswerLabel)}</div>
        </div>
    `;

    options.forEach((opt, optionIndex) => {
      if (!opt) return;

      const optionNumber = optionIndex + 1;
      const isCorrectOption = optionNumber === correctOption;
      const isUserAnswer = userAnswer === getLetter(optionNumber);
      const optionLetter = String.fromCharCode(65 + optionIndex);

      let className = "option-neutral";
      if (isSkipped && isCorrectOption) className = "option-skipped";
      else if (isCorrectOption) className = "option-correct";
      else if (isUserAnswer) className = "option-wrong";
      //else if (isSkipped && isCorrectOption) className = "option-skipped";

      let indicator = "";
      if (isCorrectOption) indicator = " <strong class='hidden'>R</strong>";
      else if (isUserAnswer && !isCorrectOption) indicator = ` <strong class='hidden'>${optionLetter} ✗</strong>`;
      else if (isSkipped && !isCorrectOption) indicator = " <strong class='hidden'>S</strong>";

      questionsHtml += `
        <div class="option-box ${className} question-field question-field-options">
          <strong>${optionLetter}.</strong>
          <span class="report-rich-inline">${renderRichText(opt)}</span>
          ${indicator}
        </div>
      `;
    });

    if (feedbackCorrectAnswer) {
      const feedbackId = `feedback-${questionNumber}`;
      questionsHtml += `
        <div class="feedback-section mt-3 question-field question-field-explanation">
          <button class="btn btn-sm btn-outline-secondary" type="button" data-bs-toggle="collapse" data-bs-target="#${feedbackId}" aria-expanded="false" aria-controls="${feedbackId}">
            <i class="bi bi-chevron-down me-1"></i> View Explanation
          </button>
          <div class="collapse mt-2" id="${feedbackId}">
            <div class="card card-body bg-light border-start border-4 border-success">
              <h6 class="fw-bold text-success mb-2">Explanation</h6>
              <div class="feedback-content report-rich-text">${renderRichText(feedbackCorrectAnswer)}</div>
            </div>
          </div>
        </div>
      `;
    }

    questionsHtml += "</div>";
  });

  const scorePercent = total > 0 ? Math.round((correct / total) * 100) : 0;
  const scoreBadgeClass = scorePercent >= 70 ? "bg-success" : "bg-danger";
  currentSingleTestAIContext = buildSingleTestAIContext({
    test,
    student,
    correct,
    total,
    scorePercent,
  });
  const currentSectionId = new URLSearchParams(window.location.search).get("sectionId") || test.sectionId || "";
  const allTestsProgressUrl = `report.html?studentId=${encodeURIComponent(studentId)}${currentSectionId ? `&sectionId=${encodeURIComponent(currentSectionId)}` : ""}`;

  setReportHtml(`
    <div class="card shadow-sm mb-4">
      <div class="card-body">
        <div class="row">
          <div class="col-md-6">
            <h5 class="fw-bold mb-3">Student Information</h5>
            <p><strong>Name:</strong> ${escapeHtml(student.name || "N/A")}</p>
            <p><strong>Student ID:</strong> ${escapeHtml(student.studentId || studentId || result.studentId || "N/A")}</p>
${student.phone ? `<p><strong>Phone:</strong> ${escapeHtml(student.phone)}</p>` : ''}
          </div>
          <div class="col-md-6">
            <h5 class="fw-bold mb-3">Test Information</h5>
            <p><strong>Test:</strong> ${escapeHtml(test.testName || "N/A")}</p>
            <p><strong>Total Questions:</strong> ${total}</p>
            <p>
              <strong>Accuracy:</strong>
              <span class="badge ${scoreBadgeClass} fs-6">
                ${correct}/${total} correct (${scorePercent}%)
              </span>
            </p>
            <p class="small text-muted mb-2">Score cards below separately show recalculated score and score percentage.</p>
            <a class="btn btn-sm" style="background:#16a085;color:white;border:none"
               href="${allTestsProgressUrl}">
              <i class="bi bi-graph-up"></i> Progress (all tests)
            </a>
            <p class="hidden mt-2 mb-0">
              <a class="btn btn-sm" style="background:#2c3e50;color:white;border:none"
                 href="report.html?testId=${encodeURIComponent(testId)}&studentId=${encodeURIComponent(studentId)}" target="_blank">
                Open Link
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
    <div class="card shadow-sm mb-4">
      <div class="card-body">
        <div class="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-2 mb-3">
          <div>
            <h5 class="fw-bold mb-1">Performance Dashboard</h5>
            <p class="text-muted small mb-0">Use multi-select filters, switch chart type, and recalculate marks with your own scoring rules.</p>
          </div>
          <div class="small text-muted">Default scoring: +3 correct, -1 wrong, 0 skipped</div>
        </div>
        <div class="row g-3 mb-3 no-print">
          <div class="col-md-3">
            <label class="form-label small text-muted mb-1" for="subjectFilter">Subjects</label>
            <select class="form-select report-multiselect" id="subjectFilter" multiple size="5"></select>
            <div class="form-text">Select one or more subjects.</div>
          </div>
          <div class="col-md-3">
            <label class="form-label small text-muted mb-1" for="chapterFilter">Chapters</label>
            <select class="form-select report-multiselect" id="chapterFilter" multiple size="5"></select>
            <div class="form-text">Options adjust to your current subject selection.</div>
          </div>
          <div class="col-md-3">
            <label class="form-label small text-muted mb-1" for="topicFilter">Topics</label>
            <select class="form-select report-multiselect" id="topicFilter" multiple size="5"></select>
            <div class="form-text">Options adjust to the current chapter selection.</div>
          </div>
          <div class="col-md-3">
            <label class="form-label small text-muted mb-1" for="subtopicFilter">Subtopics</label>
            <select class="form-select report-multiselect" id="subtopicFilter" multiple size="5"></select>
            <div class="form-text">Use Ctrl/Cmd-click to pick multiple values.</div>
          </div>
        </div>
        <div class="row g-3 align-items-end mb-3 no-print">
          <div class="col-md-3">
            <label class="form-label small text-muted mb-1" for="chartTypeFilter">Chart Type</label>
            <select class="form-select" id="chartTypeFilter">
              <option value="bar">Stacked Bar</option>
              <option value="line">Line</option>
              <option value="radar">Radar</option>
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label small text-muted mb-1" for="chartGroupFilter">Chart Grouping</label>
            <select class="form-select" id="chartGroupFilter">
              <option value="subject">Subject Wise</option>
              <option value="chapter">Chapter Wise</option>
              <option value="topic">Topic Wise</option>
              <option value="subtopic">Subtopic Wise</option>
            </select>
          </div>
          <div class="col-md-2">
            <label class="form-label small text-muted mb-1" for="scoreCorrect">Correct</label>
            <input class="form-control" id="scoreCorrect" type="number" step="0.5" value="${DEFAULT_SCORING_RULES.correct}">
          </div>
          <div class="col-md-2">
            <label class="form-label small text-muted mb-1" for="scoreWrong">Wrong</label>
            <input class="form-control" id="scoreWrong" type="number" step="0.5" value="${DEFAULT_SCORING_RULES.wrong}">
          </div>
          <div class="col-md-2">
            <label class="form-label small text-muted mb-1" for="scoreSkipped">Skipped</label>
            <input class="form-control" id="scoreSkipped" type="number" step="0.5" value="${DEFAULT_SCORING_RULES.skipped}">
          </div>
        </div>
        <div class="d-flex flex-wrap gap-2 align-items-center mb-3 no-print">
          <button id="resetScoringBtn" class="btn btn-sm btn-outline-secondary">Reset Scoring</button>
          <div class="form-check form-switch d-flex align-items-center mb-0">
            <input class="form-check-input" type="checkbox" id="wrongOnlyToggle">
            <label class="form-check-label ms-2" for="wrongOnlyToggle">Show only wrong and skipped</label>
          </div>
        </div>
        <div id="question-filter-status" class="text-muted small mb-3"></div>
        <div class="row g-3 mb-4" id="statsCards"></div>
        <div class="card bg-light border-0 mb-4">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <h6 class="fw-bold mb-0">Interactive Chart</h6>
              <span class="text-muted small">Counts update with the current filters.</span>
            </div>
            <div class="report-chart-wrap">
              <canvas id="performanceBreakdownChart"></canvas>
            </div>
          </div>
        </div>
        <div class="card bg-light border-0">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <h6 class="fw-bold mb-0">Performance Tables</h6>
              <span class="text-muted small">Subjects show all rows. Chapter, topic, and subtopic tables show wrong-only rows by default.</span>
            </div>
            <div id="subjectStatsTable"></div>
          </div>
        </div>
      </div>
    </div>
    <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 mb-3">
      <h5 class="fw-bold mb-0">Detailed Results</h5>
      <div class="d-flex gap-2 no-print">
        <button id="exportCSVDetail" class="btn btn-sm" style="background:#16a085;color:white;border:none">
          <i class="bi bi-download"></i> Export Detail Excel
        </button>
        <button id="exportCSVSummary" class="btn btn-sm" style="background:#2c3e50;color:white;border:none">
          <i class="bi bi-download"></i> Export Summary Excel
        </button>
      </div>
    </div>
    ${buildAIPromptCardsHtml(test, student)}
    <div class="card shadow-sm mb-4 no-print">
      <div class="card-body">
        <div class="row g-3 align-items-start">
          <div class="col-lg-4">
            <label class="form-label small text-muted mb-2 d-block">Question View</label>
            <div class="btn-group" role="group" aria-label="Question view">
              <button type="button" class="btn btn-dark btn-sm" data-question-view="card">Card</button>
              <button type="button" class="btn btn-outline-secondary btn-sm" data-question-view="table">Table</button>
            </div>
          </div>
          <div class="col-lg-8">
            <label class="form-label small text-muted mb-2 d-block">Show Fields</label>
            <div class="d-flex flex-wrap gap-3">
              ${getFieldToggleDefinitions().map((field) => `
                <div class="form-check">
                  <input class="form-check-input question-field-toggle" type="checkbox" value="${field.key}" id="fieldToggle${field.key}" checked>
                  <label class="form-check-label small" for="fieldToggle${field.key}">${escapeHtml(field.label)}</label>
                </div>
              `).join("")}
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="alert alert-warning small mb-3 d-flex align-items-center" role="alert">
      <i class="bi bi-exclamation-triangle-fill me-2"></i>
      <span><strong>AI-Generated Content:</strong> AI can make mistakes. Always verify important information like question papers and chat responses.</span>
    </div>
    <div id="questionsCardView">${questionsHtml}</div>
    <div id="questionsTableViewWrap" class="d-none"></div>
  `);

  initSingleTestInsights();
  initSingleTestCSVExport(test.testName, student.name);
  initReportPromptCopyButtons();
  initSingleTestAIChat();
  renderMathInReport();
}

function renderMathInReport() {
  if (typeof renderMathInElement !== "undefined") {
    renderMathInElement(document.getElementById("report-content"), {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false }
      ],
      throwOnError: false
    });
  }
}

function initSingleTestCSVExport(testName, studentName) {
  const detailBtn = document.getElementById("exportCSVDetail");
  const summaryBtn = document.getElementById("exportCSVSummary");
  if (!detailBtn || !summaryBtn || !currentTestQuestionsData.length) return;

  const safeTestName = (testName || "Test").replace(/[^a-zA-Z0-9]/g, "_");
  const safeStudentName = (studentName || "Student").replace(/[^a-zA-Z0-9]/g, "_");

  detailBtn.addEventListener("click", () => {
    const rows = [
      ["Subject", "Chapter", "Topic", "Subtopic", "Question", "Status"],
      ...currentTestQuestionsData.map(q => [
        q.subject,
        q.chapter,
        q.topic,
        q.subtopic,
        q.questionText,
        q.status
      ])
    ];
    downloadCSV(`${safeTestName}_Detail.csv`, rows);
  });

  summaryBtn.addEventListener("click", () => {
    const rows = [
      ["Subject", "Chapter", "Topic", "Num_Correct", "Num_Wrong", "Num_Skipped", "Questions"],
      ...buildCurrentTestSummaryData().map((s) => [s.subject, s.chapter, s.topic, s.correct, s.wrong, s.skipped, s.total]),
    ];
    downloadCSV(`${safeTestName}_Summary.csv`, rows);
  });
}

function initReportPromptCopyButtons() {
  document.querySelectorAll(".ai-copy-prompt-btn").forEach((button) => {
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

function initSingleTestAIChat() {
  if (!reportAIChatPanel) {
    reportAIChatPanel = new ReportAIChatPanel();
  } else {
    reportAIChatPanel.refreshContextState();
    reportAIChatPanel.clearChat();
  }
}

function buildStudentProgressSubjectSummary(rows) {
  const subjectMap = new Map();

  rows.forEach((row) => {
    (row.subjectStats || []).forEach((subjectStat) => {
      const subject = subjectStat.subject || "General";
      if (!subjectMap.has(subject)) {
        subjectMap.set(subject, {
          subject,
          tests: [],
          correct: 0,
          wrong: 0,
          skipped: 0,
          totalQuestions: 0,
        });
      }

      const entry = subjectMap.get(subject);
      entry.tests.push({
        testName: row.testName,
        testId: row.testId,
        dateObj: row.dateObj,
        testDateRaw: row.testDateRaw,
        percent: subjectStat.marks,
        scoreText: formatScoreDisplay(subjectStat),
      });
      entry.correct += subjectStat.correct;
      entry.wrong += subjectStat.wrong;
      entry.skipped += subjectStat.skipped;
      entry.totalQuestions += subjectStat.total;
    });
  });

  return Array.from(subjectMap.values())
    .map((entry) => {
      const tests = entry.tests
        .slice()
        .sort((a, b) => {
          const at = a.dateObj?.getTime?.();
          const bt = b.dateObj?.getTime?.();
          const aValid = typeof at === "number" && !Number.isNaN(at);
          const bValid = typeof bt === "number" && !Number.isNaN(bt);
          if (aValid && bValid) return at - bt;
          if (aValid) return -1;
          if (bValid) return 1;
          return String(a.testName).localeCompare(String(b.testName));
        });
      const percents = tests.map((test) => Number(test.percent) || 0);
      const averagePercent = percents.length
        ? percents.reduce((sum, value) => sum + value, 0) / percents.length
        : 0;
      const bestPercent = percents.length ? Math.max(...percents) : 0;
      const latestPercent = percents.length ? percents[percents.length - 1] : 0;
      const firstPercent = percents.length ? percents[0] : 0;
      return {
        ...entry,
        tests,
        testsTaken: tests.length,
        averagePercent,
        bestPercent,
        latestPercent,
        improvement: latestPercent - firstPercent,
      };
    })
    .sort((a, b) => a.subject.localeCompare(b.subject));
}

function buildStudentProgressChapterTopicSubtopicSummary(rows) {
  const ctsMap = new Map(); // chapter-topic-subtopic as key

  rows.forEach((row) => {
    (row.questionRecords || []).forEach((record) => {
      const subject = normalizeFilterValue(record.subject);
      const chapter = normalizeFilterValue(record.chapter);
      const topic = normalizeFilterValue(record.topic);
      const subtopic = normalizeFilterValue(record.subtopic);

      // Only include if chapter is available
      if (!chapter) return;

      const key = `${subject}|${chapter}|${topic}|${subtopic}`;

      if (!ctsMap.has(key)) {
        ctsMap.set(key, {
          subject,
          chapter,
          topic,
          subtopic,
          testPerformances: new Map(), // testId -> { correct, total }
        });
      }

      const entry = ctsMap.get(key);
      if (!entry.testPerformances.has(row.testId)) {
        entry.testPerformances.set(row.testId, {
          testName: row.testName,
          dateObj: row.dateObj,
          testDateRaw: row.testDateRaw,
          correct: 0,
          total: 0,
        });
      }

      const testPerf = entry.testPerformances.get(row.testId);
      testPerf.total++;
      if (record.isCorrect) testPerf.correct++;
    });
  });

  return Array.from(ctsMap.values())
    .filter((entry) => entry.testPerformances.size >= 2) // Only include if appears in multiple tests
    .map((entry) => {
      const testResults = Array.from(entry.testPerformances.values())
        .map((perf) => ({
          ...perf,
          percent: perf.total > 0 ? (perf.correct / perf.total) * 100 : 0,
        }))
        .sort((a, b) => {
          const at = a.dateObj?.getTime?.();
          const bt = b.dateObj?.getTime?.();
          const aValid = typeof at === "number" && !Number.isNaN(at);
          const bValid = typeof bt === "number" && !Number.isNaN(bt);
          if (aValid && bValid) return at - bt;
          if (aValid) return -1;
          if (bValid) return 1;
          return String(a.testName).localeCompare(String(b.testName));
        });

      const percents = testResults.map((tr) => tr.percent);
      const averagePercent = percents.length
        ? percents.reduce((sum, value) => sum + value, 0) / percents.length
        : 0;
      const bestPercent = percents.length ? Math.max(...percents) : 0;
      const latestPercent = percents.length ? percents[percents.length - 1] : 0;
      const firstPercent = percents.length ? percents[0] : 0;

      const totalCorrect = testResults.reduce((sum, tr) => sum + tr.correct, 0);
      const totalWrong = testResults.reduce((sum, tr) => sum + (tr.total - tr.correct), 0);
      const totalSkipped = 0; // We don't track skipped in this aggregation
      const totalQuestions = testResults.reduce((sum, tr) => sum + tr.total, 0);

      return {
        subject: entry.subject,
        chapter: entry.chapter,
        topic: entry.topic,
        subtopic: entry.subtopic,
        testResults,
        testsTaken: testResults.length,
        correct: totalCorrect,
        wrong: totalWrong,
        skipped: totalSkipped,
        totalQuestions,
        averagePercent,
        bestPercent,
        latestPercent,
        improvement: latestPercent - firstPercent,
      };
    })
    .sort((a, b) => {
      // Sort by subject, chapter, topic, then subtopic
      const aKey = `${a.subject}|${a.chapter}|${a.topic}|${a.subtopic}`;
      const bKey = `${b.subject}|${b.chapter}|${b.topic}|${b.subtopic}`;
      return aKey.localeCompare(bKey);
    });
}

function renderSubjectProgressSummaryTable(subjectSummary) {
  if (!subjectSummary.length) {
    return `<div class="text-muted small">No subject-wise progress data available yet.</div>`;
  }

  const rowsHtml = subjectSummary.map((subject) => `
    <tr>
      <td>${escapeHtml(subject.subject)}</td>
      <td>${subject.testsTaken}</td>
      <td>${subject.correct}</td>
      <td>${subject.wrong}</td>
      <td>${subject.skipped}</td>
      <td>${subject.totalQuestions}</td>
      <td>${subject.averagePercent.toFixed(1)}%</td>
      <td>${subject.bestPercent.toFixed(1)}%</td>
      <td>${subject.latestPercent.toFixed(1)}%</td>
      <td class="${subject.improvement >= 0 ? "text-success" : "text-danger"}">${subject.improvement >= 0 ? "+" : ""}${subject.improvement.toFixed(1)}%</td>
    </tr>
  `).join("");

  return `
    <div class="table-responsive">
      <table class="table table-sm align-middle mb-0">
        <thead>
          <tr>
            <th>Subject</th>
            <th>Tests</th>
            <th>Correct</th>
            <th>Wrong</th>
            <th>Skipped</th>
            <th>Questions</th>
            <th>Average</th>
            <th>Best</th>
            <th>Latest</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;
}

function renderChapterTopicSubtopicProgressSummaryTable(ctsSummary, hideNoErrors = true) {
  if (!ctsSummary.length) {
    return `<div class="text-muted small">No chapter/topic/subtopic progress data available yet (requires common topics across multiple tests).</div>`;
  }

  const rowsHtml = ctsSummary
    .filter((entry) => !hideNoErrors || entry.wrong + entry.skipped > 0)
    .map((entry) => {
      const hasErrors = entry.wrong + entry.skipped > 0;
    return `
    <tr data-has-errors="${hasErrors}">
      <td>${escapeHtml(entry.subject || "—")}</td>
      <td>${escapeHtml(entry.chapter)}</td>
      <td>${escapeHtml(entry.topic || "—")}</td>
      <td>${escapeHtml(entry.subtopic || "—")}</td>
      <td data-order="${entry.testsTaken}">${entry.testsTaken}</td>
      <td data-order="${entry.correct}">${entry.correct}</td>
      <td data-order="${entry.wrong}">${entry.wrong}</td>
      <td data-order="${entry.skipped}">${entry.skipped}</td>
      <td data-order="${entry.totalQuestions}">${entry.totalQuestions}</td>
      <td data-order="${entry.averagePercent.toFixed(1)}">${entry.averagePercent.toFixed(1)}%</td>
      <td data-order="${entry.bestPercent.toFixed(1)}">${entry.bestPercent.toFixed(1)}%</td>
      <td data-order="${entry.latestPercent.toFixed(1)}">${entry.latestPercent.toFixed(1)}%</td>
      <td data-order="${entry.improvement.toFixed(1)}" class="${entry.improvement >= 0 ? "text-success" : "text-danger"}">${entry.improvement >= 0 ? "+" : ""}${entry.improvement.toFixed(1)}%</td>
    </tr>
  `;
  }).join("");

  return `
    <div class="mb-3 no-print">
      <div class="form-check form-switch">
        <input class="form-check-input" type="checkbox" id="ctsHideNoErrorsToggle"${hideNoErrors ? " checked" : ""}>
        <label class="form-check-label small" for="ctsHideNoErrorsToggle">Hide topics with no errors (0 wrong & 0 skipped)</label>
      </div>
    </div>
    <div class="table-responsive">
      <table id="ctsProgressTable" class="table table-sm align-middle mb-0">
        <thead>
          <tr>
            <th>Subject</th>
            <th>Chapter</th>
            <th>Topic</th>
            <th>Subtopic</th>
            <th>Tests</th>
            <th>Correct</th>
            <th>Wrong</th>
            <th>Skipped</th>
            <th>Questions</th>
            <th>Average</th>
            <th>Best</th>
            <th>Latest</th>
            <th>Trend</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
  `;
}

function getProgressYearLabel(row) {
  const year = row?.dateObj?.getFullYear?.();
  return Number.isFinite(year) ? String(year) : "Unknown";
}

function getProgressClassLabel(row) {
  return row?.classValue || "Unspecified";
}

function buildStudentProgressPromptData(student, rows, subjectSummary, ctsSummary) {
  const studentName = student?.name || "Student";

  const testsCSV = rowsToCSV([
    ["Student", "Date", "Year", "Grade_Class", "Test", "Total_Percent", "Correct", "Total", "Subjects"],
    ...rows.map((row) => [
      studentName,
      formatDate(row.dateObj, row.testDateRaw),
      getProgressYearLabel(row),
      getProgressClassLabel(row),
      row.testName,
      Number(row.percent) || 0,
      typeof row.correct === "number" ? row.correct : "",
      typeof row.total === "number" ? row.total : "",
      (row.subjectStats || []).map((subject) => subject.subject).join(" | "),
    ]),
  ]);

  const subjectTimelineCSV = rowsToCSV([
    ["Student", "Date", "Year", "Grade_Class", "Test", "Subject", "Percent", "Correct", "Wrong", "Skipped", "Total", "Score"],
    ...rows.flatMap((row) => (row.subjectStats || []).map((subject) => [
      studentName,
      formatDate(row.dateObj, row.testDateRaw),
      getProgressYearLabel(row),
      getProgressClassLabel(row),
      row.testName,
      subject.subject,
      Number(subject.marks) || 0,
      subject.correct,
      subject.wrong,
      subject.skipped,
      subject.total,
      formatScoreDisplay(subject),
    ])),
  ]);

  const topicSubtopicCSV = rowsToCSV([
    ["Subject", "Chapter", "Topic", "Subtopic", "Tests", "Correct", "Wrong", "Skipped", "Questions", "Average_Percent", "Best_Percent", "Latest_Percent", "Trend_Percent"],
    ...ctsSummary.map((entry) => [
      entry.subject,
      entry.chapter,
      entry.topic,
      entry.subtopic,
      entry.testsTaken,
      entry.correct,
      entry.wrong,
      entry.skipped,
      entry.totalQuestions,
      entry.averagePercent.toFixed(1),
      entry.bestPercent.toFixed(1),
      entry.latestPercent.toFixed(1),
      entry.improvement.toFixed(1),
    ]),
  ]);

  const questionAttemptsCSV = rowsToCSV([
    ["Student", "Date", "Year", "Grade_Class", "Test", "Subject", "Chapter", "Topic", "Subtopic", "Question_No", "Status"],
    ...rows.flatMap((row) => (row.questionRecords || []).map((record) => [
      studentName,
      formatDate(row.dateObj, row.testDateRaw),
      getProgressYearLabel(row),
      getProgressClassLabel(row),
      row.testName,
      record.subject,
      record.chapter,
      record.topic,
      record.subtopic,
      record.questionNumber,
      record.status,
    ])),
  ]);

  const subjectGradeYearMap = new Map();
  rows.forEach((row) => {
    (row.subjectStats || []).forEach((subject) => {
      const key = `${subject.subject}|${getProgressYearLabel(row)}|${getProgressClassLabel(row)}`;
      if (!subjectGradeYearMap.has(key)) {
        subjectGradeYearMap.set(key, {
          subject: subject.subject,
          year: getProgressYearLabel(row),
          classValue: getProgressClassLabel(row),
          tests: 0,
          correct: 0,
          wrong: 0,
          skipped: 0,
          total: 0,
          percentSum: 0,
        });
      }
      const entry = subjectGradeYearMap.get(key);
      entry.tests += 1;
      entry.correct += subject.correct;
      entry.wrong += subject.wrong;
      entry.skipped += subject.skipped;
      entry.total += subject.total;
      entry.percentSum += Number(subject.marks) || 0;
    });
  });

  const subjectGradeYearCSV = rowsToCSV([
    ["Student", "Subject", "Year", "Grade_Class", "Tests", "Correct", "Wrong", "Skipped", "Questions", "Average_Percent"],
    ...Array.from(subjectGradeYearMap.values()).map((entry) => [
      studentName,
      entry.subject,
      entry.year,
      entry.classValue,
      entry.tests,
      entry.correct,
      entry.wrong,
      entry.skipped,
      entry.total,
      entry.tests ? (entry.percentSum / entry.tests).toFixed(1) : "0.0",
    ]),
  ]);

  const weakPrerequisiteCSV = rowsToCSV([
    ["Subject", "Chapter", "Topic", "Subtopic", "Wrong", "Skipped", "Questions", "Average_Percent", "Latest_Percent", "Trend_Percent", "Prerequisite_Reason"],
    ...ctsSummary
      .filter((entry) => entry.wrong + entry.skipped > 0 || entry.averagePercent < 70 || entry.latestPercent < 70)
      .sort((a, b) => {
        if ((b.wrong + b.skipped) !== (a.wrong + a.skipped)) return (b.wrong + b.skipped) - (a.wrong + a.skipped);
        return a.averagePercent - b.averagePercent;
      })
      .map((entry) => [
        entry.subject,
        entry.chapter,
        entry.topic,
        entry.subtopic,
        entry.wrong,
        entry.skipped,
        entry.totalQuestions,
        entry.averagePercent.toFixed(1),
        entry.latestPercent.toFixed(1),
        entry.improvement.toFixed(1),
        "Treat this as a prerequisite gap if later topics in the same subject depend on it.",
      ]),
  ]);

  return {
    testsCSV,
    subjectTimelineCSV,
    topicSubtopicCSV,
    questionAttemptsCSV,
    subjectGradeYearCSV,
    weakPrerequisiteCSV,
  };
}

function buildStudentProgressPromptCardsHtml(student, rows, subjectSummary, ctsSummary) {
  const promptData = buildStudentProgressPromptData(student, rows, subjectSummary, ctsSummary);
  const prompts = [
    {
      id: "longTermTrend",
      title: "Long-Term Progress Trend",
      data: promptData.testsCSV,
      intro: "I have a multi-test student progress CSV with columns: Student, Date, Year, Grade_Class, Test, Total_Percent, Correct, Total, Subjects.",
      tasks: [
        "Analyze progress across all tests, years, and grade/classes.",
        "Identify improving, declining, and inconsistent periods.",
        "Find tests that look like turning points.",
        "Give a practical 30-day improvement plan.",
      ],
    },
    {
      id: "subjectContinuity",
      title: "Same-Subject Continuity",
      data: promptData.subjectTimelineCSV,
      intro: "I have subject-wise progress across multiple tests with columns: Student, Date, Year, Grade_Class, Test, Subject, Percent, Correct, Wrong, Skipped, Total, Score.",
      tasks: [
        "Compare the same subjects across tests and years.",
        "Identify subjects with stable mastery versus recurring weakness.",
        "Explain whether the student is improving within each subject.",
        "Recommend subject-specific revision priorities.",
      ],
    },
    {
      id: "gradeYearTransitions",
      title: "Grade/Year Transition Gaps",
      data: promptData.subjectGradeYearCSV,
      intro: "I have progress aggregated by subject, year, and grade/class with columns: Student, Subject, Year, Grade_Class, Tests, Correct, Wrong, Skipped, Questions, Average_Percent.",
      tasks: [
        "Compare performance across years and grade/classes.",
        "Identify subjects that dropped after a grade/year transition.",
        "Suggest bridge topics to review before advancing.",
        "Create a transition recovery plan.",
      ],
    },
    {
      id: "topicSubtopicMastery",
      title: "Topic/Subtopic Mastery",
      data: promptData.topicSubtopicCSV,
      intro: "I have chapter/topic/subtopic progress across repeated tests with columns: Subject, Chapter, Topic, Subtopic, Tests, Correct, Wrong, Skipped, Questions, Average_Percent, Best_Percent, Latest_Percent, Trend_Percent.",
      tasks: [
        "Rank topics and subtopics from weakest to strongest.",
        "Separate conceptual gaps from carelessness patterns where possible.",
        "Identify repeated weak subtopics that block future learning.",
        "Suggest targeted practice for each weak topic.",
      ],
    },
    {
      id: "prerequisiteMap",
      title: "Prerequisite Gap Map",
      data: promptData.weakPrerequisiteCSV,
      intro: "I have weak prerequisite candidates with columns: Subject, Chapter, Topic, Subtopic, Wrong, Skipped, Questions, Average_Percent, Latest_Percent, Trend_Percent, Prerequisite_Reason.",
      tasks: [
        "Infer prerequisite relationships within each subject.",
        "Identify foundational topics that should be fixed first.",
        "Build a dependency-ordered revision path from basics to advanced topics.",
        "Warn where later topics may remain weak until prerequisites improve.",
      ],
    },
    {
      id: "questionAttempts",
      title: "Question Attempt Pattern",
      data: promptData.questionAttemptsCSV,
      intro: "I have question-level attempts across tests with columns: Student, Date, Year, Grade_Class, Test, Subject, Chapter, Topic, Subtopic, Question_No, Status.",
      tasks: [
        "Find patterns in wrong versus skipped questions over time.",
        "Identify chapters/topics where the student avoids attempting questions.",
        "Recommend test-taking strategies and practice formats.",
        "List the most urgent question clusters to revisit.",
      ],
    },
    {
      id: "studentActionPlan",
      title: "Student Study Plan",
      data: [promptData.subjectTimelineCSV, "", promptData.topicSubtopicCSV].join("\n"),
      intro: "I have subject timeline data and chapter/topic/subtopic data for a student across multiple tests.",
      tasks: [
        "Create a weekly study plan that balances weak subjects and repeated prerequisite gaps.",
        "Include daily practice targets, revision blocks, and checkpoint tests.",
        "Keep the plan realistic for a school student.",
        "Prioritize long-term improvement over one-test cramming.",
      ],
    },
    {
      id: "parentTeacherSummary",
      title: "Parent/Teacher Summary",
      data: [promptData.testsCSV, "", promptData.subjectGradeYearCSV, "", promptData.weakPrerequisiteCSV].join("\n"),
      intro: "I have multi-year progress, subject/year aggregates, and weak prerequisite candidates for one student.",
      tasks: [
        "Write a concise parent-friendly progress summary.",
        "Write a teacher action summary with interventions.",
        "Highlight strengths, risks, and next measurable goals.",
        "Avoid blaming language and focus on improvement steps.",
      ],
    },
  ];

  return `
    <div class="ai-report-prompts mb-4 no-print">
        <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 mb-3">
          <div>
            <h6 class="fw-bold mb-1">AI Progress Prompts</h6>
            <p class="text-muted small mb-0">Copy a prompt with multi-test progress data for long-term improvement planning.</p>
          </div>
        </div>
        <div class="ai-report-prompt-list">
          ${prompts.map((item) => {
            const targetId = `studentProgressPrompt${item.id}`;
            const prompt = [
              item.intro,
              "",
              "Analyze this data and:",
              ...item.tasks.map((task, index) => `${index + 1}. ${task}`),
              "",
              "CSV content:",
              item.data,
            ].join("\n");
            const preview = prompt.split("\n").slice(0, 5).join("\n");
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
                  <textarea id="${targetId}" class="form-control ai-report-prompt-text" rows="12" readonly>${escapeHtml(prompt)}</textarea>
                </div>
              </details>
            `;
          }).join("")}
        </div>
    </div>
  `;
}

function formatSubjectScoreSummary(subjectStats) {
  if (!subjectStats || !subjectStats.length) return "—";
  return subjectStats
    .map((subjectStat) => `${subjectStat.subject}: ${subjectStat.marks.toFixed(1)}% (${formatScoreDisplay(subjectStat)})`)
    .join(" | ");
}

function formatSubjectColumnKey(subject) {
  return String(subject || "general")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getGradeBadgeClass(marks) {
  const grade = getGradeDetails(marks);
  if (grade.grade === "A1") return "bg-success";
  if (grade.grade === "A2") return "bg-success";
  if (grade.grade === "B1") return "bg-info text-dark";
  if (grade.grade === "B2") return "bg-info text-dark";
  if (grade.grade === "C1") return "bg-primary";
  if (grade.grade === "C2") return "bg-primary";
  if (grade.grade === "D") return "bg-warning text-dark";
  return "bg-danger";
}

function renderStudentProgress(student, studentId, rows) {
  currentSingleTestAIContext = null;
  if (reportAIChatPanel) {
    reportAIChatPanel.refreshContextState();
  }
  const taken = rows.length;
  const avg = taken > 0 ? Math.round(rows.reduce((sum, r) => sum + (Number(r.percent) || 0), 0) / taken) : 0;
  const best = taken > 0 ? Math.max(...rows.map((r) => Number(r.percent) || 0)) : 0;
  const latest = taken > 0 ? (Number(rows[taken - 1].percent) || 0) : 0;
  const subjectSummary = buildStudentProgressSubjectSummary(rows);
  const ctsSummary = buildStudentProgressChapterTopicSubtopicSummary(rows);
  const strongestSubject = subjectSummary.length
    ? subjectSummary.reduce((bestEntry, entry) => (entry.averagePercent > bestEntry.averagePercent ? entry : bestEntry), subjectSummary[0])
    : null;
  const needsAttentionSubject = subjectSummary.length
    ? subjectSummary.reduce((worstEntry, entry) => (entry.averagePercent < worstEntry.averagePercent ? entry : worstEntry), subjectSummary[0])
    : null;
  const improvingSubjectCount = subjectSummary.filter((entry) => entry.improvement > 0).length;
  const consistentSubjectCount = subjectSummary.filter((entry) => entry.testsTaken >= 2).length;
  const subjectColumnHeaders = subjectSummary.map((entry) => entry.subject);
  const studentName = student.name || "Student";
  const pageTitle = `${studentName} Progress Summary`;
  const pageDescription = `${studentName}'s progress summary shows ${taken} tests, ${avg}% average score, ${best}% best score, and ${latest}% latest score. Analyze score trends by test date, compare results across tests, and use the report to help the student, parent, and teacher prioritize revision topics.`;
  const canonicalUrl = window.location.href;
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Report",
    name: pageTitle,
    description: pageDescription,
    url: canonicalUrl,
    about: {
      "@type": "Person",
      name: studentName,
      identifier: student.studentId || studentId,
    },
    audience: [
      {
        "@type": "Audience",
        audienceType: "Student",
      },
      {
        "@type": "Audience",
        audienceType: "Parent",
      },
      {
        "@type": "Audience",
        audienceType: "Teacher",
      },
    ],
    learningResourceType: "Progress Report",
    educationalUse: "assessment",
    abstract: "Use this report to review score trends by test date, identify improvement or decline across tests, and decide which topics need revision support.",
    hasPart: [
      {
        "@type": "HowTo",
        name: "How to analyze this report",
        step: [
          { "@type": "HowToStep", text: "Check the progress summary to understand the student's overall average, best score, and latest result." },
          { "@type": "HowToStep", text: "Read the chart from left to right to compare performance by test date and spot improvement or decline over time." },
          { "@type": "HowToStep", text: "Open any test from the table to review detailed answers and identify topics that need revision." },
          { "@type": "HowToStep", text: "Use the detailed test reports to plan follow-up practice for the student and discuss progress with the parent." },
        ],
      },
    ],
  };

  updatePageSeo({
    title: pageTitle,
    description: pageDescription,
    url: canonicalUrl,
    structuredData,
  });

  const tableRowsHtml = [...rows]
    .sort((a, b) => {
      const at = a.dateObj?.getTime?.();
      const bt = b.dateObj?.getTime?.();
      const aValid = typeof at === "number" && !Number.isNaN(at);
      const bValid = typeof bt === "number" && !Number.isNaN(bt);
      if (aValid && bValid) return bt - at;
      if (aValid) return -1;
      if (bValid) return 1;
      return String(a.testName).localeCompare(String(b.testName));
    })
    .map((r) => {
      const displayDate = formatDate(r.dateObj, r.testDateRaw);
      const sortableDate = r.dateObj && !Number.isNaN(r.dateObj.getTime())
        ? r.dateObj.getTime()
        : 0;
      const reportHref = `report.html?testId=${encodeURIComponent(r.testId)}&studentId=${encodeURIComponent(studentId)}`;
      const badgeClass = (Number(r.percent) || 0) >= 70 ? "bg-success" : "bg-danger";
      const totalGrade = getGradeDetails(Number(r.percent) || 0);
      const totalGradeBadgeClass = getGradeBadgeClass(Number(r.percent) || 0);
      const correctText =
        typeof r.correct === "number" && typeof r.total === "number"
          ? `${r.correct}/${r.total}`
          : "—";
      const totalScoreText =
        typeof r.correct === "number" && typeof r.total === "number"
          ? `${r.percent}%`
          : `${r.percent}%`;
      const subjectScoreCells = subjectColumnHeaders.map((subjectName) => {
        const subjectStat = (r.subjectStats || []).find((entry) => entry.subject === subjectName);
        const percent = subjectStat ? Number(subjectStat.marks) || 0 : -1;
        const grade = subjectStat ? getGradeDetails(percent) : null;
        const gradeBadgeClass = subjectStat ? getGradeBadgeClass(percent) : "";
        const text = subjectStat
          ? `${subjectStat.marks.toFixed(1)}% (${formatScoreDisplay(subjectStat)})`
          : "—";
        return `<td data-order="${percent}" class="small">
          ${subjectStat ? `<span class="badge ${gradeBadgeClass}">${escapeHtml(grade.grade)}</span> ` : ""}
          <span class="${percent >= 91 ? "text-success fw-semibold" : percent >= 71 ? "text-primary fw-semibold" : percent >= 33 ? "text-warning fw-semibold" : "text-danger fw-semibold"}">${escapeHtml(text)}</span>
        </td>`;
      }).join("");

      return `
        <tr>
          <td data-order="${sortableDate}">${escapeHtml(displayDate)}</td>
          <td>${escapeHtml(r.testName || "Test")}</td>
          <td data-order="${Number(r.percent) || 0}">
            <span class="badge ${badgeClass}">${escapeHtml(totalScoreText)}</span>
            <span class="badge ${totalGradeBadgeClass} ms-1">${escapeHtml(totalGrade.grade)}</span>
          </td>
          <td class="${(Number(r.percent) || 0) >= 70 ? "text-success fw-semibold" : "text-danger fw-semibold"}">${escapeHtml(correctText)}</td>
          ${subjectScoreCells}
          <td>
            <a class="btn btn-sm" style="background:#2c3e50;color:white;border:none" href="${reportHref}" target="_blank">
              View Report
            </a>
          </td>
        </tr>
      `;
    })
    .join("");

  setReportHtml(`
    <div class="card shadow-sm mb-4">
      <div class="card-body">
        <div class="row">
          <div class="col-md-6">
            <h5 class="fw-bold mb-3">Student Information</h5>
            <p><strong>Name:</strong> ${escapeHtml(student.name || "N/A")}</p>
            <p><strong>Student ID:</strong> ${escapeHtml(student.studentId || studentId)}</p>
${student.phone ? `<p><strong>Phone:</strong> ${escapeHtml(student.phone)}</p>` : ''}
          </div>
          <div class="col-md-6">
            <h5 class="fw-bold mb-3">Progress Summary</h5>
            <p><strong>Tests Taken:</strong> ${escapeHtml(taken)}</p>
            <p><strong>Average Score:</strong> ${escapeHtml(avg)}%</p>
            <p><strong>Best Score:</strong> ${escapeHtml(best)}%</p>
            <p class="mb-0"><strong>Latest Score:</strong> ${escapeHtml(latest)}%</p>
          </div>
        </div>
      </div>
    </div>

    <div class="row g-3 mb-4">
      <div class="col-md-6 col-xl-3">
        <div class="card shadow-sm h-100 report-stat-card">
          <div class="card-body">
            <div class="text-muted small mb-1">Subjects Tracked</div>
            <div class="report-stat-value">${subjectSummary.length}</div>
            <div class="small text-muted">Subjects seen across all tests</div>
          </div>
        </div>
      </div>
      <div class="col-md-6 col-xl-3">
        <div class="card shadow-sm h-100 report-stat-card">
          <div class="card-body">
            <div class="text-muted small mb-1">Strongest Subject</div>
            <div class="report-stat-value" style="font-size:1.35rem">${escapeHtml(strongestSubject?.subject || "—")}</div>
            <div class="small text-muted">${strongestSubject ? `${strongestSubject.averagePercent.toFixed(1)}% average` : "No subject data yet"}</div>
          </div>
        </div>
      </div>
      <div class="col-md-6 col-xl-3">
        <div class="card shadow-sm h-100 report-stat-card">
          <div class="card-body">
            <div class="text-muted small mb-1">Needs Attention</div>
            <div class="report-stat-value" style="font-size:1.35rem">${escapeHtml(needsAttentionSubject?.subject || "—")}</div>
            <div class="small text-muted">${needsAttentionSubject ? `${needsAttentionSubject.averagePercent.toFixed(1)}% average` : "No subject data yet"}</div>
          </div>
        </div>
      </div>
      <div class="col-md-6 col-xl-3">
        <div class="card shadow-sm h-100 report-stat-card">
          <div class="card-body">
            <div class="text-muted small mb-1">Improving Subjects</div>
            <div class="report-stat-value">${improvingSubjectCount}</div>
            <div class="small text-muted">${consistentSubjectCount} subjects have 2+ tests to compare</div>
          </div>
        </div>
      </div>
    </div>

    <div class="card shadow-sm mb-4">
      <div class="card-body">
        <div class="d-flex flex-column flex-lg-row justify-content-between align-items-lg-center gap-3 mb-3">
          <div>
            <h5 class="fw-bold mb-1">Progress Across Tests</h5>
            <small class="text-muted">Compare total score and subject-wise score by test date. Click a point or bar to open that test report.</small>
          </div>
          <div class="d-flex gap-2 align-items-center">
            <label class="small text-muted mb-0" for="subjectProgressChartType">Chart Type</label>
            <select id="subjectProgressChartType" class="form-select form-select-sm" style="min-width:150px">
              <option value="line">Line</option>
              <option value="bar">Bar</option>
            </select>
          </div>
        </div>
        <div style="height:360px">
          <canvas id="subjectProgressChart"></canvas>
        </div>
      </div>
    </div>

    <div class="card shadow-sm mb-4">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="fw-bold mb-0">Subject-wise Progress Stats</h5>
          <small class="text-muted">Average, best, latest, and trend across tests for each subject.</small>
        </div>
        <div id="subjectProgressSummaryTable">
          ${renderSubjectProgressSummaryTable(subjectSummary)}
        </div>
      </div>
    </div>

    <div class="card shadow-sm mb-4">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="fw-bold mb-0">Chapter/Topic/Subtopic Progress Stats</h5>
          <small class="text-muted">Progress across tests for topics that appear in multiple tests.</small>
        </div>
        <div id="ctsProgressSummaryTable">
          ${renderChapterTopicSubtopicProgressSummaryTable(ctsSummary)}
        </div>
      </div>
    </div>

    <div class="card shadow-sm">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="fw-bold mb-0">All Tests</h5>
          <button id="exportProgressCSV" class="btn btn-sm no-print" style="background:#16a085;color:white;border:none">
            <i class="bi bi-download"></i> Export Excel
          </button>
        </div>
        ${buildStudentProgressPromptCardsHtml(student, rows, subjectSummary, ctsSummary)}
        <div class="table-responsive">
          <table id="testsTable" class="table table-striped align-middle">
            <thead>
              <tr>
                <th>Date</th>
                <th>Test</th>
                <th>Total Score</th>
                <th>Correct</th>
                ${subjectColumnHeaders.map((subjectName) => `<th>${escapeHtml(subjectName)}</th>`).join("")}
                <th>Report</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `);

  initSubjectProgressChart(studentId, rows, subjectSummary);
  initResultsTable();
  initCTSProgressTable(ctsSummary);
  initProgressCSVExport(studentId, rows, student.name);
  initReportPromptCopyButtons();
}

function initCTSProgressTable(ctsSummary) {
  const container = document.getElementById("ctsProgressSummaryTable");
  const table = document.getElementById("ctsProgressTable");
  const toggle = document.getElementById("ctsHideNoErrorsToggle");

  if (!table || !container) return;

  if (ctsStatsDataTable) {
    ctsStatsDataTable.destroy();
    ctsStatsDataTable = null;
  }

  if (window.simpleDatatables?.DataTable) {
    // eslint-disable-next-line no-new
    ctsStatsDataTable = new window.simpleDatatables.DataTable(table, {
      searchable: true,
      fixedHeight: true,
      perPage: 10,
      columns: [
        { select: 0, sort: "asc" }, // Subject
        { select: 1, sort: "asc" }, // Chapter
        { select: 2, sort: "asc" }, // Topic
        { select: 3, sort: "asc" }, // Subtopic
        { select: 4, type: "number", sort: "desc" }, // Tests
        { select: 5, type: "number", sort: "desc" }, // Correct
        { select: 6, type: "number", sort: "desc" }, // Wrong
        { select: 7, type: "number", sort: "desc" }, // Skipped
        { select: 8, type: "number", sort: "desc" }, // Questions
        { select: 9, type: "number", sort: "desc" }, // Average
        { select: 10, type: "number", sort: "desc" }, // Best
        { select: 11, type: "number", sort: "desc" }, // Latest
        { select: 12, type: "number", sort: "desc" }, // Trend
      ],
    });
  }

  if (toggle) {
    const rebuildTable = () => {
      const hideNoErrors = toggle.checked;
      if (ctsStatsDataTable) {
        ctsStatsDataTable.destroy();
        ctsStatsDataTable = null;
      }
      container.innerHTML = renderChapterTopicSubtopicProgressSummaryTable(ctsSummary, hideNoErrors);
      initCTSProgressTable(ctsSummary);
    };

    toggle.addEventListener("change", rebuildTable);
  }
}

function initSubjectProgressChart(studentId, rows, subjectSummary) {
  const canvas = document.getElementById("subjectProgressChart");
  const chartTypeSelect = document.getElementById("subjectProgressChartType");
  if (!canvas || !chartTypeSelect || typeof Chart === "undefined") return;

  const chartRows = [...rows].sort((a, b) => {
    const at = a.dateObj?.getTime?.();
    const bt = b.dateObj?.getTime?.();
    const aValid = typeof at === "number" && !Number.isNaN(at);
    const bValid = typeof bt === "number" && !Number.isNaN(bt);
    if (aValid && bValid) return at - bt;
    if (aValid) return -1;
    if (bValid) return 1;
    return String(a.testName).localeCompare(String(b.testName));
  });
  const dateLabels = chartRows.map((row) => formatDate(row.dateObj, row.testDateRaw));
  let chart = null;

  const palette = [
    "#1f6feb",
    "#16a085",
    "#dc2626",
    "#f59e0b",
    "#7c3aed",
    "#0f766e",
    "#db2777",
    "#2563eb",
  ];

  const buildTotalDataset = () => ({
    label: "Total",
    data: chartRows.map((row) => Number(row.percent) || 0),
    borderColor: "#111827",
    backgroundColor: "rgba(17, 24, 39, 0.2)",
    pointBackgroundColor: "#111827",
    tension: 0.25,
    spanGaps: true,
    fill: false,
    borderWidth: 3,
  });

  const buildLineDatasets = () => [buildTotalDataset(), ...subjectSummary.map((subject, index) => {
    const percentByTestId = new Map(subject.tests.map((test) => [test.testId, Number(test.percent) || 0]));
    const color = palette[index % palette.length];
    return {
      label: subject.subject,
      data: chartRows.map((row) => (percentByTestId.has(row.testId) ? percentByTestId.get(row.testId) : null)),
      borderColor: color,
      backgroundColor: `${color}33`,
      pointBackgroundColor: color,
      tension: 0.25,
      spanGaps: true,
      fill: false,
    };
  })];

  const buildBarDatasets = () => {
    const totalDataset = {
      label: "Total",
      data: chartRows.map((row) => Number(row.percent) || 0),
      borderColor: "#111827",
      backgroundColor: "rgba(17, 24, 39, 0.75)",
      borderWidth: 1,
    };
    const subjectDatasets = subjectSummary.map((subject, index) => {
      const color = palette[index % palette.length];
      const percentByTestId = new Map(subject.tests.map((test) => [test.testId, Number(test.percent) || 0]));
      return {
        label: subject.subject,
        data: chartRows.map((row) => (percentByTestId.has(row.testId) ? percentByTestId.get(row.testId) : null)),
        borderColor: color,
        backgroundColor: `${color}bb`,
        borderWidth: 1,
      };
    });
    return [totalDataset, ...subjectDatasets];
  };

  const buildTooltipTitle = (items) => {
    const row = chartRows[items?.[0]?.dataIndex];
    return `${formatDate(row?.dateObj, row?.testDateRaw)}${row?.testName ? ` | ${row.testName}` : ""}`;
  };

  const buildTooltipLabel = (item) => {
    const row = chartRows[item.dataIndex];
    if (!row) return `${item.dataset.label}: ${item.formattedValue || "0"}%`;
    if (item.dataset.label === "Total") {
      const correctText =
        typeof row.correct === "number" && typeof row.total === "number"
          ? `${row.correct}/${row.total}`
          : "—";
      return `Total: ${item.formattedValue || "0"}% (${correctText})`;
    }
    const subjectStat = (row.subjectStats || []).find((entry) => entry.subject === item.dataset.label);
    return subjectStat
      ? `${item.dataset.label}: ${item.formattedValue || "0"}% (${formatScoreDisplay(subjectStat)})`
      : `${item.dataset.label}: ${item.formattedValue || "0"}%`;
  };

  const renderChart = () => {
    if (chart) chart.destroy();
    const type = chartTypeSelect.value || "line";
    const isBar = type === "bar";
    return {
      type,
      labels: dateLabels,
      datasets: isBar ? buildBarDatasets() : buildLineDatasets(),
    };
  };

  const drawChart = () => {
    if (chart) chart.destroy();
    const config = renderChart();
    chart = new Chart(canvas.getContext("2d"), {
      type: config.type,
      data: {
        labels: config.labels,
        datasets: config.datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: "index" },
        plugins: {
          legend: { position: "bottom" },
          tooltip: {
            callbacks: {
              title: buildTooltipTitle,
              label: buildTooltipLabel,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: { callback: (value) => `${value}%` },
          },
          x: {
            ticks: { maxRotation: 0, minRotation: 0 },
          },
        },
        onClick: (evt, elements) => {
          if (!elements?.length) return;
          const row = chartRows[elements[0].index];
          if (!row?.testId) return;
          const href = `report.html?testId=${encodeURIComponent(row.testId)}&studentId=${encodeURIComponent(studentId)}`;
          window.open(href, "_blank");
        },
      },
    });
  };

  chartTypeSelect.addEventListener("change", drawChart);
  drawChart();
  window.__studentSubjectProgressChart = chart;
}

function initStudentProgressChart(studentId, rows) {
  const canvas = document.getElementById("progressChart");
  if (!canvas || typeof Chart === "undefined") return;

  const labels = rows.map((r) => formatDate(r.dateObj, r.testDateRaw));
  const data = rows.map((r) => Number(r.percent) || 0);

  const ctx = canvas.getContext("2d");
  const chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Score (%)",
          data,
          borderColor: "#2c3e50",
          backgroundColor: "rgba(44, 62, 80, 0.15)",
          pointBackgroundColor: "#16a085",
          tension: 0.25,
          fill: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          intersect: false,
          mode: "index",
          callbacks: {
            title: (items) => {
              const row = rows[items?.[0]?.dataIndex];
              return row?.testName || "Test";
            },
            label: (item) => {
              const row = rows[item.dataIndex];
              const dateLabel = formatDate(row?.dateObj, row?.testDateRaw);
              return ` ${dateLabel}: ${item.formattedValue}%`;
            },
          },
        },
      },
      scales: {
        y: { beginAtZero: true, max: 100, ticks: { callback: (v) => `${v}%` } },
        x: { ticks: { maxRotation: 0, minRotation: 0 } },
      },
      onClick: (evt, elements) => {
        if (!elements || elements.length === 0) return;
        const index = elements[0].index;
        const row = rows[index];
        if (!row?.testId) return;
        const href = `report.html?testId=${encodeURIComponent(row.testId)}&studentId=${encodeURIComponent(studentId)}`;
        window.open(href, "_blank");
      },
    },
  });

  // Avoid linter unused warnings in some bundlers
  window.__studentProgressChart = chart;
}

function initResultsTable() {
  const table = document.getElementById("testsTable");
  if (!table) return;
  if (window.simpleDatatables?.DataTable) {
    // eslint-disable-next-line no-new
    new window.simpleDatatables.DataTable(table, {
      searchable: true,
      fixedHeight: true,
      perPage: 10,
      columns: [
        {
          select: 0,
          type: "date",
          sort: "desc",
          format: "x",
        },
      ],
    });
  }
}

async function initProgressCSVExport(studentId, rows, studentName) {
  const btn = document.getElementById("exportProgressCSV");
  if (!btn) return;

  // Get linked student IDs for fetching results
  const linkedStudentIds = getLinkedStudentIds(studentId);

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Loading...';

    try {
      const csvRows = [["Date", "Subject", "Topic", "Num_Correct", "Num_Wrong"]];

      for (const row of rows) {
        const testId = row.testId;
        if (!testId) continue;

        const testSnap = await firestore.collection("tests").doc(testId).get();
        if (!testSnap.exists) continue;

        // Try fetching result with each linked student ID
        let resultSnap = null;
        for (const linkedId of linkedStudentIds) {
          const snap = await firestore.collection("results").doc(`${testId}_${linkedId}`).get();
          if (snap.exists) {
            resultSnap = snap;
            break;
          }
        }

        if (!resultSnap || !resultSnap.exists) continue;

        const test = testSnap.data();
        const result = resultSnap.data();
        const testDate = formatDate(row.dateObj, row.testDateRaw);

        const questionPaper = test.questionPaperID
          ? await fetchQuestionPaper(test.questionPaperID)
          : null;

        let questions = questionPaper?.questions || test.questions || [];

        if (!questions || questions.length === 0) {
          questions = [];
          for (let key in result) {
            if (key.includes('_Q') || key.startsWith('Q')) {
              let section = '';
              let questionNumber;
              if (key.includes('_Q')) {
                const match = key.match(/(.+)_Q(\d+)/);
                if (match) [, section, questionNumber] = match;
              } else if (key.startsWith('Q')) {
                const match = key.match(/Q(\d+)/);
                if (match) [, questionNumber] = match;
              }
              if (questionNumber) {
                const qNum = parseInt(questionNumber, 10);
                const isCorrect = result[key] === "R";
                questions[qNum - 1] = {
                  questionNumber: qNum,
                  section,
                  isCorrect,
                };
              }
            }
          }
          questions = questions.filter(q => q !== undefined);
        }

        const topicStats = new Map();
        questions.forEach((question, index) => {
          const questionNumber = index + 1;
          const userKey = `Q${questionNumber}`;
          const userAnswer = result[userKey];
          const subject = normalizeFilterValue(question.Subject || question.section);
          const topic = normalizeFilterValue(question.Topic);

          if (!subject || !topic) return;

          const key = `${subject}|${topic}`;
          if (!topicStats.has(key)) {
            topicStats.set(key, { subject, topic, correct: 0, wrong: 0 });
          }

          const isCorrect = question.isCorrect || userAnswer === "R";
          const entry = topicStats.get(key);
          if (isCorrect) entry.correct += 1;
          else entry.wrong += 1;
        });

        topicStats.forEach(stat => {
          csvRows.push([testDate, stat.subject, stat.topic, stat.correct, stat.wrong]);
        });
      }

      downloadCSV(`Progress_Report.csv`, csvRows);
    } catch (err) {
      console.error("Export CSV error:", err);
      alert("Failed to export CSV. Please try again.");
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-download"></i> Export Excel';
    }
  });
}

loadReportFromQueryParams();
