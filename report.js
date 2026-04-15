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
  if (!testSnap.exists || !resultSnap.exists || !studentSnap.exists) {
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

  const [student, resultsSnap] = await Promise.all([
    getStudentByStudentId(studentId),
    firestore.collection("results").where("studentId", "==", studentId).get(),
  ]);
  console.log("Fetched student and results:", { student, resultsSnap });

  // Build student object from results if not found in students collection
  let studentData = student;
  if (!studentData && !resultsSnap.empty) {
    const firstResult = resultsSnap.docs[0].data();
    studentData = {
      id: studentId,
      name: firstResult.name || "Unknown",
      studentId: firstResult.studentId || studentId,
      phone: firstResult.phone || "",
    };
  }

  if (!studentData) {
    showReportWarning("Student not found");
    return;
  }

  if (resultsSnap.empty) {
    setReportHtml(`
      <div class="card shadow-sm mb-4">
        <div class="card-body">
          <h5 class="fw-bold mb-3">Student Information</h5>
          <p><strong>Name:</strong> ${escapeHtml(studentData.name || "N/A")}</p>
          <p><strong>Student ID:</strong> ${escapeHtml(studentData.studentId || studentId)}</p>
${studentData.phone ? `<p><strong>Phone:</strong> ${escapeHtml(studentData.phone)}</p>` : ''}
        </div>
      </div>
      <div class="alert alert-warning">No test results found for this student.</div>
    `);
    return;
  }

  const results = resultsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  console.log("Mapped results data:", results);
  const testIds = results.map((r) => r.testId).filter(Boolean);
  const testsById = await fetchTestsByIds(testIds);

  const rows = [];
  for (const result of results) {
    const testId = result.testId;
    const test = testsById.get(testId) || {};

    const scoreDetails = typeof calculateScoreDetails === "function"
      ? calculateScoreDetails(result)
      : { percent: calculateScore(result), correct: null, total: null };

    const dateObj = parseDate(test.testDate);
    rows.push({
      testId,
      testName: test.testName || result.testName || testId || "Test",
      testDateRaw: test.testDate || "",
      dateObj,
      percent: scoreDetails.percent,
      correct: scoreDetails.correct,
      total: scoreDetails.total,
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

  renderStudentProgress(studentData, studentId, rows);
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

function buildCurrentTestSummaryData() {
  const summaryMap = new Map();

  currentTestQuestionsData.forEach((q) => {
    const key = `${q.subject}|${q.topic}`;
    if (!summaryMap.has(key)) {
      summaryMap.set(key, {
        subject: q.subject || "General",
        topic: q.topic || "General",
        correct: 0,
        wrong: 0,
        total: 0,
        subtopics: new Set(),
      });
    }

    const entry = summaryMap.get(key);
    entry.total += 1;
    if (q.isCorrect) entry.correct += 1;
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

function buildSingleTestAIContext({ test, student, correct, total, scorePercent }) {
  const summaryRows = buildCurrentTestSummaryData();
  console.log("Built summary rows for AI context:", summaryRows);
  const weakTopics = summaryRows.filter((row) => row.wrong > 0);

  const summaryText = summaryRows.length
    ? summaryRows
      .map((row) => {
        const subtopicText = row.subtopics.length ? `; subtopics: ${row.subtopics.join(", ")}` : "";
        //return `${row.subject} > ${row.topic}: correct ${row.correct}, wrong ${row.wrong}, accuracy ${row.accuracy}%${subtopicText}`;
        return `${row.subject} > ${row.topic}: correct ${row.correct}, wrong ${row.wrong}`;
      })
      .join("\n")
    : "No summary rows available.";

  const weakTopicsText = weakTopics.length
    ? weakTopics
      .map((row, index) => `${index + 1}. ${row.subject} > ${row.topic} - wrong ${row.wrong}/${row.total}, accuracy ${row.accuracy}%`)
      .join("\n")
    : "No weak topics detected. The student got every tracked topic correct.";

  const detailText = currentTestQuestionsData.length
    ? currentTestQuestionsData
      .map((q) => `Q${q.questionNumber} | Subject: ${q.subject || "General"} | Topic: ${q.topic || "General"} | Subtopic: ${q.subtopic || "General"} | Result: ${q.isCorrect ? "Correct" : "Wrong"} | Question: ${q.questionText || "N/A"}`)
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
    this.messages = [];
    this.isLoading = false;
    this.isReady = false;
    this.modelCacheStatus = {};
    this.currentQuizQuestions = [];
    this.activeQuizQuestion = null;
    this.activeQuizIndex = null;

    this.container = document.getElementById("aiChatContainer");
    this.fab = document.getElementById("aiChatFab");
    this.header = document.getElementById("aiChatHeader");
    this.toggleBtn = document.getElementById("aiChatToggle");
    this.clearBtn = document.getElementById("aiChatClear");
    this.messagesEl = document.getElementById("aiChatMessages");
    this.inputEl = document.getElementById("aiChatInput");
    this.sendBtn = document.getElementById("aiChatSend");
    this.statusText = document.getElementById("aiStatusText");
    this.statusIndicator = document.getElementById("aiStatusIndicator");
    this.modelSelect = document.getElementById("aiModelSelect");
    this.loadBtn = document.getElementById("aiLoadModel");
    this.deleteBtn = document.getElementById("aiDeleteModel");
    this.progressContainer = document.getElementById("aiProgressContainer");
    this.progressFill = document.getElementById("aiProgressFill");
    this.progressText = document.getElementById("aiProgressText");
    this.quickActions = document.getElementById("aiQuickActions");
    this.quizContainer = document.getElementById("aiChatQuiz");
    this.quizHeader = document.getElementById("aiQuizHeader");
    this.quizGenerateBtn = document.getElementById("aiQuizGenerate");
    this.quizQuestions = document.getElementById("aiQuizQuestions");
    this.helpContainer = document.getElementById("aiChatHelp");
    this.helpHeader = document.getElementById("aiHelpHeader");
    this.chatInputArea = document.getElementById("aiChatInputArea");

    this.bindEvents();
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
    if (this.loadBtn) this.loadBtn.addEventListener("click", () => this.loadModel());
    if (this.deleteBtn) this.deleteBtn.addEventListener("click", () => this.deleteModel());
    if (this.modelSelect) this.modelSelect.addEventListener("change", () => this.updateDeleteButtonVisibility());
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
  }

  getCurrentReportContext() {
    return currentSingleTestAIContext;
  }

  refreshContextState() {
    const context = this.getCurrentReportContext();
    if (!context) {
      this.updateStatus("error", "Open a single test report to use AI study help");
      this.disableInteractions();
      this.messagesEl.innerHTML = `
        <div class="ai-chat-message ai">
          <div class="message-bubble markdown-content">This AI panel is ready for single test reports. Open a report with both \`testId\` and \`studentId\`, then load a model.</div>
          <span class="message-time">Just now</span>
        </div>
      `;
      return;
    }

    if (!this.isReady) {
      this.updateStatus("ready", `Report ready: ${context.studentName} scored ${context.scorePercent}%`);
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
    document.querySelectorAll(".ai-sample-btn").forEach((btn) => { btn.disabled = true; });
  }

  enableInteractions() {
    if (this.inputEl) this.inputEl.disabled = false;
    if (this.sendBtn) this.sendBtn.disabled = false;
    if (this.quizGenerateBtn) this.quizGenerateBtn.disabled = false;
    if (this.quickActions) this.quickActions.style.display = "flex";
    if (this.chatInputArea) this.chatInputArea.style.display = "block";
    document.querySelectorAll(".ai-sample-btn").forEach((btn) => { btn.disabled = false; });
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

  async loadModel() {
    const context = this.getCurrentReportContext();
    if (!context) {
      this.addMessage("ai", "Open a single test report first so I can use its summary and detailed results.");
      return;
    }

    if (!navigator.gpu) {
      this.showError("WebGPU is not supported in this browser. Please use a recent Chrome or Edge build.");
      this.updateStatus("error", "WebGPU not supported");
      return;
    }

    if (typeof window.CreateMLCEngine === "undefined") {
      this.showError("WebLLM library is not available. Please check your internet connection and refresh.");
      this.updateStatus("error", "WebLLM unavailable");
      return;
    }

    const modelId = this.modelSelect.value;
    this.loadBtn.disabled = true;
    this.modelSelect.disabled = true;
    this.progressContainer.classList.add("active");
    this.progressFill.style.width = "0%";
    this.progressText.textContent = "0%";
    this.addMessage("ai", `Loading ${modelId}. First-time setup can take a few minutes.`);

    try {
      this.engine = await window.CreateMLCEngine(modelId, {
        initProgressCallback: (progress) => {
          const percent = Math.round((progress.progress || 0) * 100);
          this.progressFill.style.width = `${percent}%`;
          this.progressText.textContent = `${percent}%`;
          this.updateStatus("loading", `Loading model... ${percent}%`);
        },
      });

      this.isReady = true;
      this.messages = [{
        role: "system",
        content: this.buildSystemPrompt(context),
      }];
      this.progressContainer.classList.remove("active");
      this.enableInteractions();
      this.updateStatus("ready", `AI ready for ${context.studentName}'s ${context.testName}`);
      this.addMessage("ai", "Model loaded. You can ask for weak-topic notes, markdown study material, or practice quizzes based on this report.");
      this.checkModelCacheStatus();
    } catch (error) {
      console.error("Failed to load model:", error);
      this.progressContainer.classList.remove("active");
      this.updateStatus("error", "Failed to load model");
      this.addMessage("ai", `Error loading model: ${error.message || "Unknown error"}`);
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
        option.textContent = option.textContent.replace(/^[✓↓]\s*/, "");
      });

      for (const option of this.modelSelect.options) {
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
    const downloaded = this.modelCacheStatus[this.modelSelect.value];
    this.deleteBtn.style.display = downloaded ? "inline-flex" : "none";
  }

  async deleteModel() {
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
          ? "This report is ready. Load a model to start asking about weak topics and revision material."
          : "Open a single test report first, then load a model to start."}</div>
        <span class="message-time">Just now</span>
      </div>
    `;
  }

  handleQuickAction(action) {
    if (!this.isReady) {
      this.addMessage("ai", "Load a model first so I can work with this report.");
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
    if (!this.isReady) {
      this.addMessage("ai", "Load a model first so I can use the current report.");
      return;
    }
    if (!prompt) return;
    this.addMessage("user", prompt);
    this.generateResponse(`${prompt}\n\nUse this report context:\n${this.getCurrentReportContext().contextText.substring(0, 12000)}`);
  }

  async sendMessage() {
    if (!this.isReady || this.isLoading) {
      if (!this.isReady) this.addMessage("ai", "Load a model first so I can answer using this report.");
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
      const reply = await this.engine.chat.completions.create({
        messages: this.messages,
        temperature: 0.7,
        max_tokens: 1200,
      });
      const responseText = reply.choices[0].message.content;
      this.messages.push({ role: "assistant", content: responseText });
      if (this.messages.length > 12) {
        this.messages = [this.messages[0], ...this.messages.slice(-11)];
      }
      this.hideTyping();
      this.addMessage("ai", responseText);
    } catch (error) {
      console.error("AI response error:", error);
      this.hideTyping();
      this.addMessage("ai", "Sorry, I hit an error while generating the response. Please try again.");
    } finally {
      this.isLoading = false;
      this.sendBtn.disabled = false;
    }
  }

  async generateQuizQuestions() {
    const context = this.getCurrentReportContext();
    if (!this.isReady) {
      this.addMessage("ai", "Load a model first so I can generate quiz questions.");
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

      const reply = await this.engine.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 1000,
      });

      const response = reply.choices[0].message.content || "";
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
        answer: context.weakTopics[0] ? `${context.weakTopics[0].subject} > ${context.weakTopics[0].topic}` : "No weak topic identified.",
      }];
      this.renderQuizQuestions();
    } catch (error) {
      console.error("Quiz generation error:", error);
      this.addMessage("ai", "Sorry, I couldn't generate quiz questions right now. Please try again.");
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
      const reply = await this.engine.chat.completions.create({
        messages,
        temperature: 0.7,
        max_tokens: 700,
      });
      this.addMessage("ai", reply.choices[0].message.content.trim());
    } catch (error) {
      console.error("Quiz evaluation error:", error);
      this.addMessage("ai", "I couldn't evaluate that answer right now. Please try again.");
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
    let userKey = `Q${questionNumber}`;
    // subjectname_questionnumber "Mathematics_1" without _Q prefix for questionnumber
    // replace underscore with underscore followed by Q to separate subject and question number
    if (question.subjectname_questionnumber){
      question.subjectname_questionnumber = question.subjectname_questionnumber.replace("_", "_Q");
      userKey = question.subjectname_questionnumber;
    }
    let userAnswer = result[userKey];
    if (userAnswer == null && result[`Generic_Q${questionNumber}`] != null) {
      userAnswer = result[`Generic_Q${questionNumber}`];
    }
    const subject = normalizeFilterValue(question.Subject || question.section);
    const topic = normalizeFilterValue(question.Topic);
    const subtopic = normalizeFilterValue(question.Subtopic);

    total += 1;
    const isCorrect = question.isCorrect || userAnswer === "R";
    if (isCorrect) correct += 1;

    currentTestQuestionsData.push({
      questionNumber,
      subject,
      topic,
      subtopic,
      questionText: question.Question?.trim() || "",
      isCorrect,
    });

    const options = [1, 2, 3, 4].map((optionIndex) =>
      extractOptionText(question[`Option ${optionIndex}`])
    );

    const correctOption = getCorrectOptionNumber(question);

    questionsHtml += `
      <div class="question-item"
           data-is-correct="${isCorrect ? "true" : "false"}"
           data-subject="${escapeHtml(subject)}"
           data-topic="${escapeHtml(topic)}"
           data-subtopic="${escapeHtml(subtopic)}">
        <div class="d-flex justify-content-between mb-3">
          <h6 class="fw-bold">Question ${questionNumber}</h6>
          <span class="badge ${isCorrect ? "bg-success" : "bg-danger"}">
            ${isCorrect ? "Correct" : "Wrong"}
          </span>
        </div>
        ${(subject || topic || subtopic) ? `
          <div class="d-flex flex-wrap gap-2 mb-3">
            ${subject ? `<span class="badge bg-light text-dark border">Subject: ${escapeHtml(subject)}</span>` : ""}
            ${topic ? `<span class="badge bg-light text-dark border">Topic: ${escapeHtml(topic)}</span>` : ""}
            ${subtopic ? `<span class="badge bg-light text-dark border">Subtopic: ${escapeHtml(subtopic)}</span>` : ""}
          </div>
        ` : ""}
        ${question.Question?.trim()
        ? `<p class="mb-3">${escapeHtml(question.Question)}</p>`
        : ""}
    `;

    const isSkipped = !userAnswer || userAnswer === "" || userAnswer === "S";

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
        <div class="option-box ${className}">
          <strong>${optionLetter}.</strong>
          ${escapeHtml(opt)}
          ${indicator}
        </div>
      `;
    });

    questionsHtml += "</div>";
  });

  const scorePercent = total > 0 ? Math.round((correct / total) * 100) : 0;
  const scoreBadgeClass = scorePercent >= 70 ? "bg-success" : "bg-danger";
  const subjectOptions = buildFilterOptions(questions, "Subject");
  const topicOptions = buildFilterOptions(questions, "Topic");
  const subtopicOptions = buildFilterOptions(questions, "Subtopic");
  currentSingleTestAIContext = buildSingleTestAIContext({
    test,
    student,
    correct,
    total,
    scorePercent,
  });

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
            <p>
              <strong>Score:</strong>
              <span class="badge ${scoreBadgeClass} fs-6">
                ${correct}/${total} (${scorePercent}%)
              </span>
            </p>
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
    <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-2 mb-3">
      <h5 class="fw-bold mb-0">Detailed Results</h5>
      <div class="d-flex gap-2 no-print">
        <button id="exportCSVDetail" class="btn btn-sm" style="background:#16a085;color:white;border:none">
          <i class="bi bi-download"></i> Export Detail CSV
        </button>
        <button id="exportCSVSummary" class="btn btn-sm" style="background:#2c3e50;color:white;border:none">
          <i class="bi bi-download"></i> Export Summary CSV
        </button>
        <div class="form-check form-switch ms-2 d-flex align-items-center">
          <input class="form-check-input" type="checkbox" id="wrongOnlyToggle">
          <label class="form-check-label ms-2" for="wrongOnlyToggle">Show only wrong</label>
        </div>
      </div>
    </div>
    <div class="row g-2 mb-3 no-print">
      <div class="col-md-4">
        <label class="form-label small text-muted mb-1" for="subjectFilter">Subject</label>
        <select class="form-select" id="subjectFilter">
          <option value="">All subjects</option>
          ${subjectOptions}
        </select>
      </div>
      <div class="col-md-4">
        <label class="form-label small text-muted mb-1" for="topicFilter">Topic</label>
        <select class="form-select" id="topicFilter">
          <option value="">All topics</option>
          ${topicOptions}
        </select>
      </div>
      <div class="col-md-4">
        <label class="form-label small text-muted mb-1" for="subtopicFilter">Subtopic</label>
        <select class="form-select" id="subtopicFilter">
          <option value="">All subtopics</option>
          ${subtopicOptions}
        </select>
      </div>
    </div>
    <div id="question-filter-status" class="text-muted small mb-3"></div>
    ${questionsHtml}
  `);

  initWrongQuestionFilter();
  initSingleTestCSVExport(test.testName, student.name);
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

function initWrongQuestionFilter() {
  const toggle = document.getElementById("wrongOnlyToggle");
  const subjectFilter = document.getElementById("subjectFilter");
  const topicFilter = document.getElementById("topicFilter");
  const subtopicFilter = document.getElementById("subtopicFilter");
  const status = document.getElementById("question-filter-status");
  const questionItems = Array.from(document.querySelectorAll(".question-item"));
  if (!toggle || !status || !subjectFilter || !topicFilter || !subtopicFilter || questionItems.length === 0) return;

  const updateFilter = () => {
    const wrongOnly = toggle.checked;
    const subject = subjectFilter.value;
    const topic = topicFilter.value;
    const subtopic = subtopicFilter.value;
    let visibleCount = 0;

    questionItems.forEach((item) => {
      const isCorrect = item.dataset.isCorrect === "true";
      const matchesWrong = !wrongOnly || !isCorrect;
      const matchesSubject = !subject || item.dataset.subject === subject;
      const matchesTopic = !topic || item.dataset.topic === topic;
      const matchesSubtopic = !subtopic || item.dataset.subtopic === subtopic;
      const shouldShow = matchesWrong && matchesSubject && matchesTopic && matchesSubtopic;
      item.classList.toggle("d-none", !shouldShow);
      if (shouldShow) visibleCount += 1;
    });

    const activeFilters = [];
    if (wrongOnly) activeFilters.push("wrong only");
    if (subject) activeFilters.push(`Subject: ${subject}`);
    if (topic) activeFilters.push(`Topic: ${topic}`);
    if (subtopic) activeFilters.push(`Subtopic: ${subtopic}`);

    status.textContent = activeFilters.length > 0
      ? `Showing ${visibleCount} question${visibleCount === 1 ? "" : "s"} for ${activeFilters.join(", ")}`
      : `Showing all ${questionItems.length} questions`;
  };

  toggle.addEventListener("change", updateFilter);
  subjectFilter.addEventListener("change", updateFilter);
  topicFilter.addEventListener("change", updateFilter);
  subtopicFilter.addEventListener("change", updateFilter);
  updateFilter();
}

function initSingleTestCSVExport(testName, studentName) {
  const detailBtn = document.getElementById("exportCSVDetail");
  const summaryBtn = document.getElementById("exportCSVSummary");
  if (!detailBtn || !summaryBtn || !currentTestQuestionsData.length) return;

  const safeTestName = (testName || "Test").replace(/[^a-zA-Z0-9]/g, "_");
  const safeStudentName = (studentName || "Student").replace(/[^a-zA-Z0-9]/g, "_");

  detailBtn.addEventListener("click", () => {
    const rows = [
      ["Subject", "Topic", "Subtopic", "Question", "Correct/Wrong"],
      ...currentTestQuestionsData.map(q => [
        q.subject,
        q.topic,
        q.subtopic,
        q.questionText,
        q.isCorrect ? "Correct" : "Wrong"
      ])
    ];
    downloadCSV(`${safeTestName}_${safeStudentName}_Detail.csv`, rows);
  });

  summaryBtn.addEventListener("click", () => {
    const rows = [
      ["Subject", "Topic", "Num_Correct", "Num_Wrong"],
      ...buildCurrentTestSummaryData().map((s) => [s.subject, s.topic, s.correct, s.wrong]),
    ];
    downloadCSV(`${safeTestName}_${safeStudentName}_Summary.csv`, rows);
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

function renderStudentProgress(student, studentId, rows) {
  currentSingleTestAIContext = null;
  if (reportAIChatPanel) {
    reportAIChatPanel.refreshContextState();
  }
  const taken = rows.length;
  const avg = taken > 0 ? Math.round(rows.reduce((sum, r) => sum + (Number(r.percent) || 0), 0) / taken) : 0;
  const best = taken > 0 ? Math.max(...rows.map((r) => Number(r.percent) || 0)) : 0;
  const latest = taken > 0 ? (Number(rows[taken - 1].percent) || 0) : 0;
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

  const tableRowsHtml = rows
    .map((r) => {
      const displayDate = formatDate(r.dateObj, r.testDateRaw);
      const reportHref = `report.html?testId=${encodeURIComponent(r.testId)}&studentId=${encodeURIComponent(studentId)}`;
      const badgeClass = (Number(r.percent) || 0) >= 70 ? "bg-success" : "bg-danger";
      const correctText =
        typeof r.correct === "number" && typeof r.total === "number"
          ? `${r.correct}/${r.total}`
          : "—";

      return `
        <tr>
          <td>${escapeHtml(displayDate)}</td>
          <td>${escapeHtml(r.testName || "Test")}</td>
          <td><span class="badge ${badgeClass}">${escapeHtml(r.percent)}%</span></td>
          <td>${escapeHtml(correctText)}</td>
          <td>
            <a class="btn btn-sm" style="background:#2c3e50;color:white;border:none" href="${reportHref}" target="_blank">
              View
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

    <div class="card shadow-sm mb-4">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="fw-bold mb-0">Score Progress</h5>
          <small class="text-muted">Click a point to open that test report</small>
        </div>
        <div style="height:320px">
          <canvas id="progressChart"></canvas>
        </div>
      </div>
    </div>

    <div class="card shadow-sm">
      <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h5 class="fw-bold mb-0">All Tests</h5>
          <button id="exportProgressCSV" class="btn btn-sm no-print" style="background:#16a085;color:white;border:none">
            <i class="bi bi-download"></i> Export CSV
          </button>
        </div>
        <div class="table-responsive">
          <table id="testsTable" class="table table-striped align-middle">
            <thead>
              <tr>
                <th>Date</th>
                <th>Test</th>
                <th>Score</th>
                <th>Correct</th>
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

  initStudentProgressChart(studentId, rows);
  initResultsTable();
  initProgressCSVExport(studentId, rows, student.name);
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
    });
  }
}

async function initProgressCSVExport(studentId, rows, studentName) {
  const btn = document.getElementById("exportProgressCSV");
  if (!btn) return;

  const safeStudentName = (studentName || "Student").replace(/[^a-zA-Z0-9]/g, "_");

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Loading...';

    try {
      const csvRows = [["Date", "Subject", "Topic", "Num_Correct", "Num_Wrong"]];

      for (const row of rows) {
        const testId = row.testId;
        if (!testId) continue;

        const [testSnap, resultSnap] = await Promise.all([
          firestore.collection("tests").doc(testId).get(),
          firestore.collection("results").doc(`${testId}_${studentId}`).get()
        ]);

        if (!testSnap.exists || !resultSnap.exists) continue;

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

      downloadCSV(`${safeStudentName}_Progress.csv`, csvRows);
    } catch (err) {
      console.error("Export CSV error:", err);
      alert("Failed to export CSV. Please try again.");
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="bi bi-download"></i> Export CSV';
    }
  });
}

loadReportFromQueryParams();
