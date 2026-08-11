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

let currentTestId = null;
let availableTests = [];
let currentTestData = null;
let currentResultsData = [];
let currentStudentsData = [];
let currentQuestionPaperData = null;

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

function showError(message) {
  subtitleEl.textContent = message;
  setContentHtml(`<div class="alert alert-danger">${escapeHtml(message)}</div>`);
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
      showError("Please sign in from the teacher dashboard first.");
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

function renderSubjectResults(test, results, students, questionPaper, subjectId) {
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

function renderStudentResults(test, results, students, sortOption = "name-asc") {
  subtitleEl.textContent = `${test.testName || "Test"} | ${results.length} student result${results.length === 1 ? "" : "s"}`;

  if (results.length === 0) {
    setContentHtml('<div class="alert alert-warning">No student results found for this test yet.</div>');
    return;
  }

  const studentById = new Map(students.map((student) => [student.studentId, student]));

  const sortedResults = [...results].sort((a, b) => {
    const studentA = studentById.get(a.studentId);
    const studentB = studentById.get(b.studentId);
    const nameA = studentA?.name || a.name || a.studentId || "";
    const nameB = studentB?.name || b.name || b.studentId || "";
    const scoreA = calculateScore(a);
    const scoreB = calculateScore(b);

    switch (sortOption) {
      case "name-asc":
        return nameA.localeCompare(nameB);
      case "name-desc":
        return nameB.localeCompare(nameA);
      case "score-asc":
        return scoreA - scoreB;
      case "score-desc":
        return scoreB - scoreA;
      default:
        return nameA.localeCompare(nameB);
    }
  });

  const cardsHtml = sortedResults
    .map((result) => {
      const student = studentById.get(result.studentId);
      const studentName = student?.name || result.name || "Unknown";
      const studentPhone = student?.phone || "";
      const score = calculateScore(result);
      const currentSectionId = test.sectionId || getSectionIdFromQuery() || "";
      const reportUrl = `report.html?studentId=${result.studentId}&testId=${test.id}&sectionId=${currentSectionId}`;

      const progressUrl = `report.html?studentId=${result.studentId}&sectionId=${currentSectionId}`;

      const reportLink = `${window.location.origin}/${progressUrl}`;

      // IMPORTANT: do NOT encode parts earlier
      const message = `Hi ${studentName}, your test report: ${reportLink}`;

      const whatsappBase = studentPhone
        ? `https://wa.me/${studentPhone.replace(/\D/g, "")}`
        : `https://wa.me/`;

      const whatsappUrl = `${whatsappBase}?text=${encodeURIComponent(message)}`;

      return `
        <div class="student-card">
          <div>
            <h6 class="mb-1">${escapeHtml(studentName)}</h6>
            <small class="text-muted">${escapeHtml(result.studentId || "N/A")}</small>
          </div>
          <div class="d-flex align-items-center gap-2 flex-wrap justify-content-end">
            <span class="result-badge ${score >= 70 ? "correct" : "wrong"}">${score}%</span>
            <a href="${reportUrl}" target="_blank" class="btn btn-sm" style="background:#2c3e50;color:white;border:none">
              <i class="bi bi-file-text"></i> View this test Report
            </a>
            <a href="${progressUrl}" target="_blank" class="btn btn-sm" style="background:#16a085;color:white;border:none">
              <i class="bi bi-graph-up"></i> Progress(all tests)
            </a>
            <a href="${whatsappUrl}"
              target="_blank"
              class="btn btn-sm"
              style="background:#25D366;color:white;border:none">
              <i class="bi bi-whatsapp"></i> WhatsApp all tests
            </a>
            ${navigator.share ? `<button type="button"
               class="btn btn-sm share-link-btn"
               data-url="${window.location.origin}/${reportUrl}"
               style="background:#6c757d;color:white;border:none">
              <i class="bi bi-share"></i> Share this test
            </button>` : `<button type="button"
               class="btn btn-sm copy-link-btn"
               data-url="${window.location.origin}/${reportUrl}"
               style="background:#6c757d;color:white;border:none">
              <i class="bi bi-link"></i> Copy this test Link
            </button>`}
          </div>
        </div>
      `;
    })
    .join("");

  setContentHtml(cardsHtml);

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
      showError("Please sign in from the teacher dashboard first.");
      return;
    }
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
