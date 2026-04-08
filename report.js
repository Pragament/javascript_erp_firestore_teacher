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

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
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
    const studentSnap = await firestore
        .collection("students")
        .where("studentId", "==", studentId)
        .limit(1)
        .get();

    if (studentSnap.empty) return null;
    const doc = studentSnap.docs[0];
    return { id: doc.id, ...doc.data() };
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
      .map((question) => normalizeFilterValue(question[fieldName]))
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
        firestore
            .collection("results")
            .where("testId", "==", testId)
            .where("studentId", "==", studentId)
            .limit(1)
            .get(),
        firestore.collection("students").where("studentId", "==", studentId).limit(1).get(),
    ]);

    if (!testSnap.exists || resultSnap.empty || studentSnap.empty) {
        showReportWarning("Data not found");
        return;
    }

    const test = testSnap.data();
    const result = resultSnap.docs[0].data();
    const studentDoc = studentSnap.docs[0];
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

    if (!student) {
        showReportWarning("Student not found");
        return;
    }

    if (resultsSnap.empty) {
        setReportHtml(`
      <div class="card shadow-sm mb-4">
        <div class="card-body">
          <h5 class="fw-bold mb-3">Student Information</h5>
          <p><strong>Name:</strong> ${escapeHtml(student.name || "N/A")}</p>
          <p><strong>Student ID:</strong> ${escapeHtml(student.studentId || studentId)}</p>
          <p><strong>Phone:</strong> ${escapeHtml(student.phone || "N/A")}</p>
        </div>
      </div>
      <div class="alert alert-warning">No test results found for this student.</div>
    `);
        return;
    }

    const results = resultsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
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

    renderStudentProgress(student, studentId, rows);
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

function renderSingleTestReport(test, result, student, studentId, testId, questionPaper) {
    console.log("Rendering report with test, result, student, questionPaper:", {
        test,
        result,
        student,
        questionPaper,
    });

    // remove section prefix from question keys to group them by question number
    for (let key in result) {
        if (key.includes('_Q')) {
            const newKey = key.replace(/^.+?_Q/, 'Q');
            result[newKey] = result[key];
            delete result[key];
        }
    }
    let questions = questionPaper?.questions || test.questions || [];
    let correct = 0;
    let total = 0;
    let questionsHtml = "";

    if (!questions || questions.length === 0) {
        questions = [];

        for (let key in result) {
            if (key.includes('_Q')) {
                const match = key.match(/(.+)_Q(\d+)/);
                if (match) {
                    const [, section, qNum] = match;
                    const questionNumber = parseInt(qNum, 10);
                    const isCorrect = result[key] === "R";

                    questions[questionNumber - 1] = {
                        questionNumber: questionNumber,
                        section: section,
                        isCorrect: isCorrect,
                        //Question: `${section} Question ${questionNumber}`,
                    };
                }
            }
        }

        // Remove undefined entries and sort
        questions = questions.filter(q => q !== undefined);
    }
    questions.forEach((question, index) => {
        const questionNumber = index + 1;
        const userKey = `Q${questionNumber}`;
        const userAnswer = result[userKey];
        const subject = normalizeFilterValue(question.Subject || question.section);
        const topic = normalizeFilterValue(question.Topic);
        const subtopic = normalizeFilterValue(question.Subtopic);

        total += 1;
        const isCorrect = question.isCorrect || userAnswer === "R";
        if (isCorrect) correct += 1;

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
                ? `<p class="mb-3">${question.Question}</p>`
                : ""}
    `;

        options.forEach((opt, optionIndex) => {
            if (!opt) return;

            const optionNumber = optionIndex + 1;
            const isCorrectOption = optionNumber === correctOption;
            const isUserAnswer = userAnswer === String(optionNumber);

            let className = "option-neutral";
            if (isCorrectOption) className = "option-correct";
            else if (isUserAnswer) className = "option-wrong";

            questionsHtml += `
        <div class="option-box ${className}">
          <strong>${String.fromCharCode(65 + optionIndex)}.</strong>
          ${opt}
          ${isCorrectOption ? " ✓" : ""}
          ${isUserAnswer && !isCorrectOption ? " ✗" : ""}
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

    setReportHtml(`
    <div class="card shadow-sm mb-4">
      <div class="card-body">
        <div class="row">
          <div class="col-md-6">
            <h5 class="fw-bold mb-3">Student Information</h5>
            <p><strong>Name:</strong> ${escapeHtml(student.name || "N/A")}</p>
            <p><strong>Student ID:</strong> ${escapeHtml(student.studentId || studentId || result.studentId || "N/A")}</p>
            <p><strong>Phone:</strong> ${escapeHtml(student.phone || "N/A")}</p>
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
            <p class="mt-2 mb-0">
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
      <div class="form-check form-switch no-print">
        <input class="form-check-input" type="checkbox" id="wrongOnlyToggle">
        <label class="form-check-label" for="wrongOnlyToggle">Show only wrong questions</label>
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

function renderStudentProgress(student, studentId, rows) {
    const taken = rows.length;
    const avg = taken > 0 ? Math.round(rows.reduce((sum, r) => sum + (Number(r.percent) || 0), 0) / taken) : 0;
    const best = taken > 0 ? Math.max(...rows.map((r) => Number(r.percent) || 0)) : 0;
    const latest = taken > 0 ? (Number(rows[taken - 1].percent) || 0) : 0;

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
            <p><strong>Phone:</strong> ${escapeHtml(student.phone || "N/A")}</p>
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
        <h5 class="fw-bold mb-3">All Tests</h5>
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

loadReportFromQueryParams();
