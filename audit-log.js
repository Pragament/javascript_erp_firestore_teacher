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

const subtitleEl = document.getElementById("audit-subtitle");
const contentEl = document.getElementById("audit-content");
const searchEl = document.getElementById("audit-search");
const actionFilterEl = document.getElementById("audit-action-filter");
const sectionFilterEl = document.getElementById("audit-section-filter");
const testFilterEl = document.getElementById("audit-test-filter");
const pageSizeEl = document.getElementById("audit-page-size");
const refreshBtn = document.getElementById("audit-refresh");

let auditLogs = [];
let allowedSections = [];
let auditSort = { key: "createdAt", direction: "desc" };
let auditPage = 1;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeComparable(value) {
  return normalizeText(value).toLowerCase();
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

async function fetchTeacherSections(email) {
  const snapshot = await firestore
    .collection("teacherAssignments")
    .where("teacherEmail", "==", email)
    .get();

  return normalizeAssignedSections(snapshot);
}

function getDashboardSignInUrl() {
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  return `index.html?redirect=${encodeURIComponent(currentPath)}`;
}

function showSignInPrompt() {
  subtitleEl.textContent = "Please sign in from the teacher dashboard first.";
  contentEl.innerHTML = `
    <div class="alert alert-warning d-flex flex-column flex-md-row justify-content-between align-items-md-center gap-3">
      <div>Please sign in from the teacher dashboard first.</div>
      <a class="btn btn-sm" style="background:#16a085;color:white;border:none;" href="${escapeHtml(getDashboardSignInUrl())}">
        <i class="bi bi-google me-1"></i>Sign in with Google
      </a>
    </div>
  `;
}

function showError(message) {
  subtitleEl.textContent = message;
  contentEl.innerHTML = `<div class="alert alert-danger">${escapeHtml(message)}</div>`;
}

function getTimestampMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.toDate === "function") return value.toDate().getTime();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTimestamp(value) {
  const millis = getTimestampMillis(value);
  if (!millis) return "-";
  return new Date(millis).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getActionLabel(actionType) {
  if (actionType === "answer_key_edit") return "Answer Key";
  if (actionType === "student_answer_edit") return "Student Answer";
  if (actionType === "test_edit") return "Test";
  if (actionType === "student_bubbles_import") return "Bubbles Import";
  return actionType || "Edit";
}

function getChangeSummary(log) {
  if (log.actionType === "answer_key_edit") {
    const before = log.before?.correctLetters || "-";
    const after = log.after?.correctLetters || "-";
    return `${before} -> ${after}`;
  }
  if (log.actionType === "student_answer_edit") {
    const before = log.before?.status || "-";
    const after = log.after?.status || "-";
    return `${before} -> ${after}`;
  }
  if (log.actionType === "test_edit") {
    return (log.changedFields || []).join(", ") || "Test updated";
  }
  if (log.actionType === "student_bubbles_import") {
    return `${log.importedRows || 0} rows, ${log.questionCount || 0} questions`;
  }
  return "-";
}

function getDetailText(log) {
  if (log.actionType === "answer_key_edit") {
    const before = (log.before?.labels || []).join("; ") || log.before?.correctLetters || "-";
    const after = (log.after?.labels || []).join("; ") || log.after?.correctLetters || "-";
    return `Correct answer changed from ${before} to ${after}. Affected results: ${log.affectedResultCount || 0}.`;
  }
  if (log.actionType === "student_answer_edit") {
    return `Student answer for ${log.statusKey || "question"} changed from ${log.before?.status || "-"} to ${log.after?.status || "-"}. Correct: ${log.correctLetters || "-"}.`;
  }
  if (log.actionType === "test_edit") {
    return (log.changedFields || []).map((field) => {
      const before = log.before?.[field] || "-";
      const after = log.after?.[field] || "-";
      return `${field}: ${before} -> ${after}`;
    }).join("; ");
  }
  if (log.actionType === "student_bubbles_import") {
    const unmatched = (log.unmatchedRolls || []).length ? ` Unmatched rolls: ${log.unmatchedRolls.join(", ")}.` : "";
    return `Imported ${log.importedRows || 0} student row(s) from ${log.fileName || "CSV"} for ${log.questionCount || 0} question(s).${unmatched}`;
  }
  return "";
}

function getLogHaystack(log) {
  return [
    log.actionType,
    log.teacherEmail,
    log.testName,
    log.testId,
    log.sectionId,
    log.subject,
    log.chapter,
    log.topic,
    log.studentName,
    log.studentId,
    log.roll,
    log.statusKey,
    log.questionText,
    getChangeSummary(log),
    getDetailText(log),
  ].map(normalizeComparable).join(" ");
}

function getFilteredLogs() {
  const search = normalizeComparable(searchEl.value);
  const action = actionFilterEl.value;
  const section = sectionFilterEl.value;
  const test = testFilterEl.value;

  return auditLogs.filter((log) => {
    if (action && log.actionType !== action) return false;
    if (section && log.sectionId !== section) return false;
    if (test && log.testId !== test) return false;
    if (search && !getLogHaystack(log).includes(search)) return false;
    return true;
  });
}

function getSortValue(log, key) {
  switch (key) {
    case "createdAt":
      return getTimestampMillis(log.createdAt);
    case "action":
      return getActionLabel(log.actionType);
    case "teacher":
      return log.teacherEmail || "";
    case "test":
      return log.testName || log.testId || "";
    case "section":
      return log.sectionId || "";
    case "student":
      return log.studentName || log.studentId || "";
    case "question":
      return Number(log.questionNumber) || 0;
    case "subject":
      return log.subject || "";
    default:
      return getTimestampMillis(log.createdAt);
  }
}

function sortLogs(logs) {
  const direction = auditSort.direction === "asc" ? 1 : -1;
  return [...logs].sort((a, b) => {
    const valueA = getSortValue(a, auditSort.key);
    const valueB = getSortValue(b, auditSort.key);
    if (typeof valueA === "number" && typeof valueB === "number") {
      if (valueA !== valueB) return (valueA - valueB) * direction;
    } else {
      const compare = String(valueA || "").localeCompare(String(valueB || ""), undefined, { numeric: true, sensitivity: "base" });
      if (compare !== 0) return compare * direction;
    }
    return getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt);
  });
}

function getSortIndicator(key) {
  if (auditSort.key !== key) return "";
  return ` <span class="subject-sort-indicator">${auditSort.direction === "asc" ? "^" : "v"}</span>`;
}

function getSortHeader(key, label) {
  return `<button type="button" class="table-sort-header audit-sort-header" data-sort-key="${escapeHtml(key)}">${escapeHtml(label)}${getSortIndicator(key)}</button>`;
}

function populateFilter(select, values, currentValue, firstLabel) {
  const uniqueValues = [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
  select.innerHTML = [
    `<option value="">${escapeHtml(firstLabel)}</option>`,
    ...uniqueValues.map((value) => `<option value="${escapeHtml(value)}"${value === currentValue ? " selected" : ""}>${escapeHtml(value)}</option>`),
  ].join("");
}

function populateFilters() {
  const currentAction = actionFilterEl.value;
  const currentSection = sectionFilterEl.value;
  const currentTest = testFilterEl.value;
  populateFilter(actionFilterEl, auditLogs.map((log) => log.actionType), currentAction, "All actions");
  populateFilter(sectionFilterEl, allowedSections.map((section) => section.id), currentSection, "All sections");
  populateFilter(testFilterEl, auditLogs.map((log) => log.testId), currentTest, "All tests");
}

function renderAuditTable() {
  const filtered = sortLogs(getFilteredLogs());
  const pageSize = Number(pageSizeEl.value) || 25;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  auditPage = Math.max(1, Math.min(auditPage, totalPages));
  const start = (auditPage - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);

  subtitleEl.textContent = `${filtered.length} matching audit record${filtered.length === 1 ? "" : "s"} | ${auditLogs.length} loaded`;

  if (auditLogs.length === 0) {
    contentEl.innerHTML = '<div class="alert alert-warning">No audit history found for your assigned sections yet.</div>';
    return;
  }

  const rowsHtml = pageRows.map((log) => `
    <tr>
      <td>${escapeHtml(formatTimestamp(log.createdAt))}</td>
      <td><span class="badge bg-light text-dark border">${escapeHtml(getActionLabel(log.actionType))}</span></td>
      <td>${escapeHtml(log.teacherEmail || "-")}</td>
      <td>${escapeHtml(log.sectionId || "-")}</td>
      <td>${escapeHtml(log.testName || log.testId || "-")}</td>
      <td>${escapeHtml(log.studentName || log.studentId || "-")}</td>
      <td>${escapeHtml(log.subject || "-")}</td>
      <td>${escapeHtml(log.questionNumber || "-")}</td>
      <td>${escapeHtml(getChangeSummary(log))}</td>
      <td class="audit-detail-cell">${escapeHtml(getDetailText(log))}</td>
    </tr>
  `).join("");

  contentEl.innerHTML = `
    <div class="student-results-table-wrap audit-log-wrap">
      <div class="student-results-table-scroll">
        <table class="student-results-table audit-log-table">
          <thead>
            <tr>
              <th>${getSortHeader("createdAt", "When")}</th>
              <th>${getSortHeader("action", "Action")}</th>
              <th>${getSortHeader("teacher", "Teacher")}</th>
              <th>${getSortHeader("section", "Section")}</th>
              <th>${getSortHeader("test", "Test")}</th>
              <th>${getSortHeader("student", "Student")}</th>
              <th>${getSortHeader("subject", "Subject")}</th>
              <th>${getSortHeader("question", "Q")}</th>
              <th>Change</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>${rowsHtml || '<tr><td colspan="10" class="text-muted py-4">No matching records.</td></tr>'}</tbody>
        </table>
      </div>
    </div>
    <div class="audit-pagination d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2 mt-3">
      <div class="small text-muted">Page ${auditPage} of ${totalPages} | Showing ${pageRows.length} of ${filtered.length}</div>
      <div class="btn-group btn-group-sm">
        <button type="button" class="btn btn-outline-secondary audit-page-btn" data-page="prev" ${auditPage <= 1 ? "disabled" : ""}>
          <i class="bi bi-chevron-left"></i> Previous
        </button>
        <button type="button" class="btn btn-outline-secondary audit-page-btn" data-page="next" ${auditPage >= totalPages ? "disabled" : ""}>
          Next <i class="bi bi-chevron-right"></i>
        </button>
      </div>
    </div>
  `;

  contentEl.querySelectorAll(".audit-sort-header").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.sortKey || "createdAt";
      auditSort = {
        key,
        direction: auditSort.key === key && auditSort.direction === "asc" ? "desc" : "asc",
      };
      renderAuditTable();
    });
  });

  contentEl.querySelectorAll(".audit-page-btn").forEach((button) => {
    button.addEventListener("click", () => {
      auditPage += button.dataset.page === "next" ? 1 : -1;
      renderAuditTable();
    });
  });
}

async function fetchAuditLogsForSections(sectionIds) {
  const logs = [];
  const chunkSize = 10;
  for (let index = 0; index < sectionIds.length; index += chunkSize) {
    const chunk = sectionIds.slice(index, index + chunkSize);
    const query = chunk.length === 1
      ? firestore.collection("resultEditAuditLogs").where("sectionId", "==", chunk[0])
      : firestore.collection("resultEditAuditLogs").where("sectionId", "in", chunk);
    const snapshot = await query.get();
    snapshot.docs.forEach((doc) => logs.push({ id: doc.id, ...doc.data() }));
  }
  return logs.sort((a, b) => getTimestampMillis(b.createdAt) - getTimestampMillis(a.createdAt));
}

async function loadAuditLogs() {
  contentEl.innerHTML = `
    <div class="text-center py-5">
      <div class="spinner-border" style="color:#2c3e50"></div>
      <p class="mt-2">Loading audit history...</p>
    </div>
  `;

  const user = auth.currentUser;
  if (!user) {
    showSignInPrompt();
    return;
  }

  try {
    allowedSections = await fetchTeacherSections(user.email);
    if (allowedSections.length === 0) {
      showError("No sections are assigned to this teacher.");
      return;
    }

    const requestedSectionId = new URLSearchParams(window.location.search).get("sectionId");
    const allowedSectionIds = new Set(allowedSections.map((section) => section.id));
    auditLogs = await fetchAuditLogsForSections(allowedSections.map((section) => section.id));
    if (requestedSectionId && allowedSectionIds.has(requestedSectionId)) {
      sectionFilterEl.value = requestedSectionId;
    }
    populateFilters();
    if (requestedSectionId && allowedSectionIds.has(requestedSectionId)) {
      sectionFilterEl.value = requestedSectionId;
    }
    auditPage = 1;
    renderAuditTable();
  } catch (error) {
    console.error("Failed to load audit history:", error);
    showError("Unable to load audit history right now.");
  }
}

[searchEl, actionFilterEl, sectionFilterEl, testFilterEl, pageSizeEl].forEach((element) => {
  element.addEventListener("input", () => {
    auditPage = 1;
    renderAuditTable();
  });
  element.addEventListener("change", () => {
    auditPage = 1;
    renderAuditTable();
  });
});

refreshBtn.addEventListener("click", loadAuditLogs);

auth.onAuthStateChanged((user) => {
  if (!user) {
    showSignInPrompt();
    return;
  }
  loadAuditLogs();
});
