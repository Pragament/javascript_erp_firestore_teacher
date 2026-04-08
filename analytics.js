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
const analyticsContentEl = document.getElementById("analytics-content");
const state = {
  currentUser: null,
  availableSections: [],
  currentSectionId: null,
  currentSectionName: "",
  records: [],
  filters: {
    classValue: "",
    subject: "",
    topic: "",
    subtopic: "",
  },
  chart: null,
  topicTable: null,
  subtopicTable: null,
  studentTable: null,
  progressTable: null,
};

function setAnalyticsHtml(html) {
  analyticsContentEl.innerHTML = html;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showAnalyticsError(message) {
  setAnalyticsHtml(`<div class="alert alert-danger">${escapeHtml(message)}</div>`);
}

function showAnalyticsLoading(message) {
  setAnalyticsHtml(`
    <div class="text-center py-5">
      <div class="spinner-border" style="color:#2c3e50"></div>
      <p class="mt-2">${escapeHtml(message || "Loading analytics...")}</p>
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

  return Array.from(sectionsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();

  if (typeof value === "string") {
    const trimmed = value.trim();
    let match = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

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

function normalizeText(value, fallback = "Unspecified") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function getQuestionNumber(question, index) {
  const parsed = String(question.subjectname_questionnumber || "").match(/_(\d+)$/);
  if (parsed) return Number(parsed[1]);
  if (Number.isFinite(Number(question.questionNumber))) return Number(question.questionNumber);
  return index + 1;
}

function findResultStatus(result, subject, questionNumber) {
  const exactKey = `${subject}_Q${questionNumber}`;
  if (Object.prototype.hasOwnProperty.call(result, exactKey)) {
    return result[exactKey];
  }

  const suffix = `_Q${questionNumber}`;
  const candidates = Object.keys(result).filter((key) => key.endsWith(suffix));
  if (candidates.length === 1) return result[candidates[0]];

  const sameSubject = candidates.find((key) => key.startsWith(`${subject}_Q`));
  return sameSubject ? result[sameSubject] : null;
}

async function fetchQuestionPapersByIds(questionPaperIds) {
  const uniqueIds = [...new Set(questionPaperIds.filter(Boolean))];
  const papers = new Map();
  if (uniqueIds.length === 0) return papers;

  try {
    for (let i = 0; i < uniqueIds.length; i += 10) {
      const chunk = uniqueIds.slice(i, i + 10);
      const snap = await firestore
        .collection("questionpapers")
        .where("questionPaperID", "in", chunk)
        .get();
      snap.forEach((doc) => {
        const data = doc.data();
        papers.set(data.questionPaperID || doc.id, { id: doc.id, ...data });
      });
    }
  } catch (err) {
    console.warn("Question paper batch fetch failed, using direct lookups:", err);
  }

  const missingIds = uniqueIds.filter((id) => !papers.has(id));
  if (missingIds.length === 0) return papers;

  const directSnaps = await Promise.all(
    missingIds.map((id) => firestore.collection("questionpapers").doc(id).get())
  );

  directSnaps.forEach((snap, index) => {
    if (!snap.exists) return;
    const data = snap.data();
    papers.set(data.questionPaperID || missingIds[index], { id: snap.id, ...data });
  });

  return papers;
}

async function fetchResultsByTestIds(testIds) {
  const entries = await Promise.all(
    testIds.map(async (testId) => {
      const snap = await firestore.collection("results").where("testId", "==", testId).get();
      return [testId, snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))];
    })
  );

  return new Map(entries);
}

async function fetchStudentsForSection(sectionId) {
  const snap = await firestore.collection("students").where("sectionId", "==", sectionId).get();
  const byStudentId = new Map();
  snap.forEach((doc) => {
    const data = doc.data();
    byStudentId.set(data.studentId || doc.id, { id: doc.id, ...data });
  });
  return byStudentId;
}

function buildRecords(tests, questionPapers, resultsByTest, studentsById) {
  const records = [];

  tests.forEach((test) => {
    const questionPaper = questionPapers.get(test.questionPaperID) || null;
    const questions = questionPaper?.questions || test.questions || [];
    const testDate = parseDate(test.testDate);
    const resultRows = resultsByTest.get(test.id) || [];

    questions.forEach((question, index) => {
      const subject = normalizeText(question.Subject || question.section, "Unknown Subject");
      const topic = normalizeText(question.Topic, "Unspecified Topic");
      const subtopic = normalizeText(question.Subtopic, "Unspecified Subtopic");
      const questionNumber = getQuestionNumber(question, index);

      resultRows.forEach((result) => {
        const status = findResultStatus(result, subject, questionNumber);
        if (!status) return;

        const student = studentsById.get(result.studentId) || {};
        const isCorrect = status === "R";

        records.push({
          testId: test.id,
          testName: test.testName || test.id || "Test",
          testDateRaw: test.testDate || "",
          testDate,
          dateLabel: formatDate(testDate, test.testDate || ""),
          sectionId: test.sectionId || "",
          classValue: normalizeText(test.class, "Unspecified Class"),
          studentId: result.studentId || "",
          studentName: student.name || result.name || result.studentId || "Unknown Student",
          subject,
          topic,
          subtopic,
          questionNumber,
          isCorrect,
        });
      });
    });
  });

  return records;
}

function getQuerySectionId() {
  return new URLSearchParams(window.location.search).get("sectionId");
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function getFilteredRecords() {
  return state.records.filter((record) => {
    if (state.filters.classValue && record.classValue !== state.filters.classValue) return false;
    if (state.filters.subject && record.subject !== state.filters.subject) return false;
    if (state.filters.topic && record.topic !== state.filters.topic) return false;
    if (state.filters.subtopic && record.subtopic !== state.filters.subtopic) return false;
    return true;
  });
}

function getFilterBaseRecords(level) {
  return state.records.filter((record) => {
    if (state.filters.classValue && record.classValue !== state.filters.classValue) return false;
    if (level !== "subject" && state.filters.subject && record.subject !== state.filters.subject) return false;
    if (level !== "topic" && level !== "subject" && state.filters.topic && record.topic !== state.filters.topic) return false;
    return true;
  });
}

function optionMarkup(values, emptyLabel, selectedValue) {
  return [
    `<option value="">${escapeHtml(emptyLabel)}</option>`,
    ...values.map((value) => {
      const selected = value === selectedValue ? " selected" : "";
      return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(value)}</option>`;
    }),
  ].join("");
}

function getTestResultsPageUrl(testId) {
  return `test-results.html?testId=${encodeURIComponent(testId)}`;
}

function getStudentProgressUrl(studentId) {
  return `report.html?studentId=${encodeURIComponent(studentId)}`;
}

function summarizeRecords(records) {
  const tests = new Set(records.map((record) => record.testId));
  const students = new Set(records.map((record) => record.studentId));
  const attempts = records.length;
  const wrong = records.filter((record) => !record.isCorrect).length;
  const accuracy = attempts > 0 ? Math.round(((attempts - wrong) / attempts) * 100) : 0;

  return { tests: tests.size, students: students.size, attempts, wrong, accuracy };
}

function aggregateBy(records, keyBuilder) {
  const map = new Map();

  records.forEach((record) => {
    const key = keyBuilder(record);
    if (!map.has(key)) {
      map.set(key, {
        key,
        subject: record.subject,
        topic: record.topic,
        subtopic: record.subtopic,
        tests: new Set(),
        students: new Set(),
        attempts: 0,
        wrong: 0,
      });
    }

    const entry = map.get(key);
    entry.tests.add(record.testId);
    entry.students.add(record.studentId);
    entry.attempts += 1;
    if (!record.isCorrect) entry.wrong += 1;
  });

  return Array.from(map.values()).map((entry) => ({
    ...entry,
    testCount: entry.tests.size,
    studentCount: entry.students.size,
    accuracy: entry.attempts > 0 ? Math.round(((entry.attempts - entry.wrong) / entry.attempts) * 100) : 0,
  })).sort((a, b) => {
    if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
    if (a.wrong !== b.wrong) return b.wrong - a.wrong;
    return a.topic.localeCompare(b.topic);
  });
}

function buildProgressRows(records) {
  const map = new Map();

  records.forEach((record) => {
    if (!map.has(record.testId)) {
      map.set(record.testId, {
        testId: record.testId,
        testName: record.testName,
        testDate: record.testDate,
        dateLabel: record.dateLabel,
        students: new Set(),
        attempts: 0,
        wrong: 0,
      });
    }

    const entry = map.get(record.testId);
    entry.students.add(record.studentId);
    entry.attempts += 1;
    if (!record.isCorrect) entry.wrong += 1;
  });

  return Array.from(map.values())
    .map((entry) => ({
      ...entry,
      studentCount: entry.students.size,
      accuracy: entry.attempts > 0 ? Math.round(((entry.attempts - entry.wrong) / entry.attempts) * 100) : 0,
    }))
    .sort((a, b) => {
      const at = a.testDate?.getTime?.();
      const bt = b.testDate?.getTime?.();
      const aValid = typeof at === "number" && !Number.isNaN(at);
      const bValid = typeof bt === "number" && !Number.isNaN(bt);
      if (aValid && bValid) return at - bt;
      if (aValid) return -1;
      if (bValid) return 1;
      return a.testName.localeCompare(b.testName);
    });
}

function buildStudentRows(records) {
  const perStudent = new Map();

  records.forEach((record) => {
    if (!perStudent.has(record.studentId)) {
      perStudent.set(record.studentId, {
        studentId: record.studentId,
        studentName: record.studentName,
        tests: new Map(),
        attempts: 0,
        wrong: 0,
      });
    }

    const entry = perStudent.get(record.studentId);
    entry.attempts += 1;
    if (!record.isCorrect) entry.wrong += 1;

    if (!entry.tests.has(record.testId)) {
      entry.tests.set(record.testId, {
        testName: record.testName,
        testDate: record.testDate,
        dateLabel: record.dateLabel,
        attempts: 0,
        wrong: 0,
      });
    }

    const testEntry = entry.tests.get(record.testId);
    testEntry.attempts += 1;
    if (!record.isCorrect) testEntry.wrong += 1;
  });

  return Array.from(perStudent.values()).map((entry) => {
    const sortedTests = Array.from(entry.tests.values()).sort((a, b) => {
      const at = a.testDate?.getTime?.();
      const bt = b.testDate?.getTime?.();
      const aValid = typeof at === "number" && !Number.isNaN(at);
      const bValid = typeof bt === "number" && !Number.isNaN(bt);
      if (aValid && bValid) return at - bt;
      if (aValid) return -1;
      if (bValid) return 1;
      return a.testName.localeCompare(b.testName);
    });

    const first = sortedTests[0];
    const last = sortedTests[sortedTests.length - 1];
    const firstAccuracy = first ? Math.round(((first.attempts - first.wrong) / first.attempts) * 100) : 0;
    const lastAccuracy = last ? Math.round(((last.attempts - last.wrong) / last.attempts) * 100) : 0;

    return {
      studentId: entry.studentId,
      studentName: entry.studentName,
      testCount: sortedTests.length,
      attempts: entry.attempts,
      wrong: entry.wrong,
      averageAccuracy: entry.attempts > 0 ? Math.round(((entry.attempts - entry.wrong) / entry.attempts) * 100) : 0,
      firstAccuracy,
      latestAccuracy: lastAccuracy,
      trend: lastAccuracy - firstAccuracy,
    };
  }).sort((a, b) => {
    if (a.averageAccuracy !== b.averageAccuracy) return a.averageAccuracy - b.averageAccuracy;
    return a.studentName.localeCompare(b.studentName);
  });
}

function renderAnalyticsShell() {
  setAnalyticsHtml(`
    <div class="card shadow-sm mb-4">
      <div class="card-body">
        <div class="row g-3 align-items-end">
          <div class="col-lg-3 col-md-6">
            <label class="form-label small text-muted mb-1" for="analytics-section-filter">Section</label>
            <select id="analytics-section-filter" class="form-select"></select>
          </div>
          <div class="col-lg-3 col-md-6">
            <label class="form-label small text-muted mb-1" for="analytics-class-filter">Class</label>
            <select id="analytics-class-filter" class="form-select"></select>
          </div>
          <div class="col-lg-2 col-md-4">
            <label class="form-label small text-muted mb-1" for="analytics-subject-filter">Subject</label>
            <select id="analytics-subject-filter" class="form-select"></select>
          </div>
          <div class="col-lg-2 col-md-4">
            <label class="form-label small text-muted mb-1" for="analytics-topic-filter">Topic</label>
            <select id="analytics-topic-filter" class="form-select"></select>
          </div>
          <div class="col-lg-2 col-md-4">
            <label class="form-label small text-muted mb-1" for="analytics-subtopic-filter">Subtopic</label>
            <select id="analytics-subtopic-filter" class="form-select"></select>
          </div>
        </div>
      </div>
    </div>

    <div class="row g-4 mb-4">
      <div class="col-md-3"><div class="card shadow-sm analytics-stat-card"><div class="card-body"><div class="text-muted small">Tests Covered</div><div id="stat-tests" class="analytics-stat-value">0</div></div></div></div>
      <div class="col-md-3"><div class="card shadow-sm analytics-stat-card"><div class="card-body"><div class="text-muted small">Students Covered</div><div id="stat-students" class="analytics-stat-value">0</div></div></div></div>
      <div class="col-md-3"><div class="card shadow-sm analytics-stat-card"><div class="card-body"><div class="text-muted small">Question Attempts</div><div id="stat-attempts" class="analytics-stat-value">0</div></div></div></div>
      <div class="col-md-3"><div class="card shadow-sm analytics-stat-card"><div class="card-body"><div class="text-muted small">Accuracy</div><div id="stat-accuracy" class="analytics-stat-value">0%</div></div></div></div>
    </div>

    <div id="analytics-empty-state" class="alert alert-warning d-none mb-4"></div>

    <div class="row g-4">
      <div class="col-xl-6">
        <div class="card shadow-sm h-100">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <h5 class="fw-bold mb-0">Weak Topics</h5>
              <span class="text-muted small">Most wrong first</span>
            </div>
            <div class="table-responsive">
              <table id="weak-topics-table" class="table table-striped align-middle">
                <thead><tr><th>Subject</th><th>Topic</th><th>Tests</th><th>Students</th><th>Wrong</th><th>Accuracy</th></tr></thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <div class="col-xl-6">
        <div class="card shadow-sm h-100">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <h5 class="fw-bold mb-0">Weak Subtopics</h5>
              <span class="text-muted small">Across all matching tests</span>
            </div>
            <div class="table-responsive">
              <table id="weak-subtopics-table" class="table table-striped align-middle">
                <thead><tr><th>Subject</th><th>Topic</th><th>Subtopic</th><th>Wrong</th><th>Accuracy</th></tr></thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div class="col-12">
        <div class="card shadow-sm">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <div>
                <h5 class="fw-bold mb-1">Progress By Test Date</h5>
                <p id="progress-context" class="text-muted mb-0">Track how accuracy changes across matching tests.</p>
              </div>
            </div>
            <div style="height:340px">
              <canvas id="analytics-progress-chart"></canvas>
            </div>
          </div>
        </div>
      </div>

      <div class="col-xl-7">
        <div class="card shadow-sm">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <h5 class="fw-bold mb-0">Test To Test Progress</h5>
              <span class="text-muted small">Compare topic performance over time</span>
            </div>
            <div class="table-responsive">
              <table id="progress-table" class="table table-striped align-middle">
                <thead><tr><th>Date</th><th>Test</th><th>Students</th><th>Attempts</th><th>Wrong</th><th>Accuracy</th></tr></thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div class="col-xl-5">
        <div class="card shadow-sm">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <h5 class="fw-bold mb-0">Student Progress</h5>
              <span class="text-muted small">Who is improving in this area</span>
            </div>
            <div class="table-responsive">
              <table id="student-progress-table" class="table table-striped align-middle">
                <thead><tr><th>Student</th><th>Tests</th><th>Average</th><th>Latest</th><th>Trend</th></tr></thead>
                <tbody></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  `);
}

function destroyDataTable(instance) {
  if (instance && typeof instance.destroy === "function") {
    instance.destroy();
  }
}

function renderFilters() {
  const sectionSelect = document.getElementById("analytics-section-filter");
  const classSelect = document.getElementById("analytics-class-filter");
  const subjectSelect = document.getElementById("analytics-subject-filter");
  const topicSelect = document.getElementById("analytics-topic-filter");
  const subtopicSelect = document.getElementById("analytics-subtopic-filter");
  if (!sectionSelect || !classSelect || !subjectSelect || !topicSelect || !subtopicSelect) return;

  sectionSelect.innerHTML = state.availableSections
    .map((section) => `<option value="${escapeHtml(section.id)}"${section.id === state.currentSectionId ? " selected" : ""}>${escapeHtml(section.name)}</option>`)
    .join("");

  const classOptions = uniqueSorted(state.records.map((record) => record.classValue));
  const subjectOptions = uniqueSorted(getFilterBaseRecords("subject").map((record) => record.subject));
  const topicOptions = uniqueSorted(getFilterBaseRecords("topic").map((record) => record.topic));
  const subtopicOptions = uniqueSorted(getFilteredRecords().map((record) => record.subtopic));

  if (state.filters.subject && !subjectOptions.includes(state.filters.subject)) state.filters.subject = "";
  if (state.filters.topic && !topicOptions.includes(state.filters.topic)) state.filters.topic = "";
  if (state.filters.subtopic && !subtopicOptions.includes(state.filters.subtopic)) state.filters.subtopic = "";

  classSelect.innerHTML = optionMarkup(classOptions, "All classes", state.filters.classValue);
  subjectSelect.innerHTML = optionMarkup(subjectOptions, "All subjects", state.filters.subject);
  topicSelect.innerHTML = optionMarkup(topicOptions, "All topics", state.filters.topic);
  subtopicSelect.innerHTML = optionMarkup(subtopicOptions, "All subtopics", state.filters.subtopic);

  sectionSelect.onchange = async (event) => {
    const nextSectionId = event.target.value;
    if (!nextSectionId || nextSectionId === state.currentSectionId) return;
    state.currentSectionId = nextSectionId;
    state.filters = { classValue: "", subject: "", topic: "", subtopic: "" };
    const url = new URL(window.location.href);
    url.searchParams.set("sectionId", nextSectionId);
    window.history.replaceState({}, "", url);
    await loadSectionAnalytics();
  };

  classSelect.onchange = (event) => {
    state.filters.classValue = event.target.value;
    state.filters.subject = "";
    state.filters.topic = "";
    state.filters.subtopic = "";
    renderFilters();
    renderAnalyticsData();
  };

  subjectSelect.onchange = (event) => {
    state.filters.subject = event.target.value;
    state.filters.topic = "";
    state.filters.subtopic = "";
    renderFilters();
    renderAnalyticsData();
  };

  topicSelect.onchange = (event) => {
    state.filters.topic = event.target.value;
    state.filters.subtopic = "";
    renderFilters();
    renderAnalyticsData();
  };

  subtopicSelect.onchange = (event) => {
    state.filters.subtopic = event.target.value;
    renderAnalyticsData();
  };
}

function renderStats(summary) {
  document.getElementById("stat-tests").textContent = summary.tests;
  document.getElementById("stat-students").textContent = summary.students;
  document.getElementById("stat-attempts").textContent = summary.attempts;
  document.getElementById("stat-accuracy").textContent = `${summary.accuracy}%`;
}

function renderTable(tableId, rowsHtml, previousInstanceKey) {
  const table = document.getElementById(tableId);
  if (!table) return;
  destroyDataTable(state[previousInstanceKey]);
  table.querySelector("tbody").innerHTML = rowsHtml;
  if (window.simpleDatatables?.DataTable) {
    state[previousInstanceKey] = new window.simpleDatatables.DataTable(table, {
      searchable: true,
      fixedHeight: true,
      perPage: 8,
    });
  }
}

function renderProgressChart(progressRows) {
  const canvas = document.getElementById("analytics-progress-chart");
  const contextLabel = document.getElementById("progress-context");
  if (!canvas || typeof Chart === "undefined") return;

  if (state.chart) state.chart.destroy();

  const labelParts = [];
  if (state.filters.subject) labelParts.push(state.filters.subject);
  if (state.filters.topic) labelParts.push(state.filters.topic);
  if (state.filters.subtopic) labelParts.push(state.filters.subtopic);
  contextLabel.textContent = labelParts.length > 0
    ? `Trend for ${labelParts.join(" / ")} across test dates.`
    : "Track how accuracy changes across matching tests.";

  state.chart = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: progressRows.map((row) => row.dateLabel),
      datasets: [
        {
          label: "Accuracy (%)",
          data: progressRows.map((row) => row.accuracy),
          borderColor: "#16a085",
          backgroundColor: "rgba(22, 160, 133, 0.16)",
          fill: true,
          tension: 0.25,
          pointBackgroundColor: "#2c3e50",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => progressRows[items?.[0]?.dataIndex]?.testName || "Test",
            label: (item) => {
              const row = progressRows[item.dataIndex];
              return ` ${row.dateLabel}: ${item.formattedValue}% accuracy`;
            },
          },
        },
      },
      scales: {
        y: { beginAtZero: true, max: 100, ticks: { callback: (value) => `${value}%` } },
      },
    },
  });
}

function renderAnalyticsData() {
  const filteredRecords = getFilteredRecords();
  const summary = summarizeRecords(filteredRecords);
  const emptyState = document.getElementById("analytics-empty-state");
  renderStats(summary);

  if (emptyState) {
    emptyState.classList.toggle("d-none", filteredRecords.length > 0);
    emptyState.textContent = filteredRecords.length > 0
      ? ""
      : "No matching question-level data was found for the current filters. Try a different section, class, or subject.";
  }

  const topicRows = aggregateBy(filteredRecords, (record) => `${record.subject}|||${record.topic}`);
  const subtopicRows = aggregateBy(filteredRecords, (record) => `${record.subject}|||${record.topic}|||${record.subtopic}`);
  const progressRows = buildProgressRows(filteredRecords);
  const studentRows = buildStudentRows(filteredRecords);

  renderTable(
    "weak-topics-table",
    topicRows.map((row) => `
      <tr>
        <td>${escapeHtml(row.subject)}</td>
        <td>${escapeHtml(row.topic)}</td>
        <td>${row.testCount}</td>
        <td>${row.studentCount}</td>
        <td>${row.wrong}</td>
        <td><span class="badge ${row.accuracy >= 70 ? "bg-success" : "bg-danger"}">${row.accuracy}%</span></td>
      </tr>
    `).join(""),
    "topicTable"
  );

  renderTable(
    "weak-subtopics-table",
    subtopicRows.map((row) => `
      <tr>
        <td>${escapeHtml(row.subject)}</td>
        <td>${escapeHtml(row.topic)}</td>
        <td>${escapeHtml(row.subtopic)}</td>
        <td>${row.wrong}</td>
        <td><span class="badge ${row.accuracy >= 70 ? "bg-success" : "bg-danger"}">${row.accuracy}%</span></td>
      </tr>
    `).join(""),
    "subtopicTable"
  );

  renderTable(
    "progress-table",
    progressRows.map((row) => `
      <tr>
        <td>${escapeHtml(row.dateLabel)}</td>
        <td><a href="${getTestResultsPageUrl(row.testId)}" target="_blank">${escapeHtml(row.testName)}</a></td>
        <td>${row.studentCount}</td>
        <td>${row.attempts}</td>
        <td>${row.wrong}</td>
        <td><span class="badge ${row.accuracy >= 70 ? "bg-success" : "bg-danger"}">${row.accuracy}%</span></td>
      </tr>
    `).join(""),
    "progressTable"
  );

  renderTable(
    "student-progress-table",
    studentRows.map((row) => `
      <tr>
        <td><a href="${getStudentProgressUrl(row.studentId)}" target="_blank">${escapeHtml(row.studentName)}</a></td>
        <td>${row.testCount}</td>
        <td><span class="badge ${row.averageAccuracy >= 70 ? "bg-success" : "bg-danger"}">${row.averageAccuracy}%</span></td>
        <td>${row.latestAccuracy}%</td>
        <td class="${row.trend >= 0 ? "text-success" : "text-danger"}">${row.trend > 0 ? "+" : ""}${row.trend}%</td>
      </tr>
    `).join(""),
    "studentTable"
  );

  renderProgressChart(progressRows);
}

async function loadSectionAnalytics() {
  showAnalyticsLoading("Loading analytics...");

  renderAnalyticsShell();

  const testsSnap = await firestore.collection("tests").where("sectionId", "==", state.currentSectionId).get();
  if (testsSnap.empty) {
    state.records = [];
    renderFilters();
    showAnalyticsError("No tests found for this section.");
    return;
  }

  const tests = testsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const [studentsById, questionPapers, resultsByTest] = await Promise.all([
    fetchStudentsForSection(state.currentSectionId),
    fetchQuestionPapersByIds(tests.map((test) => test.questionPaperID)),
    fetchResultsByTestIds(tests.map((test) => test.id)),
  ]);

  state.records = buildRecords(tests, questionPapers, resultsByTest, studentsById);
  renderFilters();
  renderAnalyticsData();
}

async function initializeAnalytics() {
  showAnalyticsLoading("Checking teacher access...");

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      showAnalyticsError("Please sign in from the teacher dashboard first.");
      return;
    }

    try {
      state.currentUser = user;
      const assignmentsSnap = await firestore
        .collection("teacherAssignments")
        .where("teacherEmail", "==", user.email)
        .get();

      if (assignmentsSnap.empty) {
        showAnalyticsError("No sections are assigned to this teacher.");
        return;
      }

      state.availableSections = normalizeAssignedSections(assignmentsSnap);
      const querySectionId = getQuerySectionId();
      const defaultSection = state.availableSections.find((section) => section.id === querySectionId) || state.availableSections[0];
      state.currentSectionId = defaultSection.id;
      state.currentSectionName = defaultSection.name;

      await loadSectionAnalytics();
    } catch (error) {
      console.error("Analytics load failed:", error);
      showAnalyticsError("Unable to load analytics right now.");
    }
  });
}

initializeAnalytics();
