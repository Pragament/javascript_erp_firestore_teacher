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

function renderStudentResults(test, results, students) {
  subtitleEl.textContent = `${test.testName || "Test"} | ${results.length} student result${results.length === 1 ? "" : "s"}`;

  if (results.length === 0) {
    setContentHtml('<div class="alert alert-warning">No student results found for this test yet.</div>');
    return;
  }

  const studentById = new Map(students.map((student) => [student.studentId, student]));

  const cardsHtml = results
    .sort((a, b) => {
      const nameA = studentById.get(a.studentId)?.name || a.name || a.studentId || "";
      const nameB = studentById.get(b.studentId)?.name || b.name || b.studentId || "";
      return nameA.localeCompare(nameB);
    })
    .map((result) => {
      const student = studentById.get(result.studentId);
      const studentName = student?.name || result.name || "Unknown";
      const studentPhone = student?.phone || "";
      const score = calculateScore(result);
      const reportUrl = `report.html?testId=${encodeURIComponent(test.id)}&studentId=${encodeURIComponent(result.studentId)}`;
      const progressUrl = `report.html?studentId=${encodeURIComponent(result.studentId)}`;

      return `
        <div class="student-card">
          <div>
            <h6 class="mb-1">${escapeHtml(studentName)}</h6>
            <small class="text-muted">${escapeHtml(result.studentId || "N/A")}</small>
          </div>
          <div class="d-flex align-items-center gap-2 flex-wrap justify-content-end">
            <span class="result-badge ${score >= 70 ? "correct" : "wrong"}">${score}%</span>
            <a href="${reportUrl}" target="_blank" class="btn btn-sm" style="background:#2c3e50;color:white;border:none">
              <i class="bi bi-file-text"></i> View Report
            </a>
            <a href="${progressUrl}" target="_blank" class="btn btn-sm" style="background:#16a085;color:white;border:none">
              <i class="bi bi-graph-up"></i> Progress
            </a>
            ${studentPhone ? `
              <a href="https://wa.me/${studentPhone.replace(/\D/g, "")}?text=Hi%20${encodeURIComponent(studentName)},%20your%20test%20report:%20${window.location.origin}/javascript_erp_firestore_teacher/${reportUrl}"
                 target="_blank"
                 class="btn btn-sm"
                 style="background:#25D366;color:white;border:none">
                <i class="bi bi-whatsapp"></i> Share
              </a>
            ` : ""}
          </div>
        </div>
      `;
    })
    .join("");

  setContentHtml(cardsHtml);
}

async function initializePage() {
  const testId = getTestIdFromQuery();
  if (!testId) {
    showError("Missing testId in URL.");
    return;
  }

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      showError("Please sign in from the teacher dashboard first.");
      return;
    }

    try {
      const [testSnap, teacherSections] = await Promise.all([
        firestore.collection("tests").doc(testId).get(),
        fetchTeacherSections(user.email),
      ]);

      if (!testSnap.exists) {
        showError("Test not found.");
        return;
      }

      if (teacherSections.length === 0) {
        showError("No sections are assigned to this teacher.");
        return;
      }

      const test = { id: testSnap.id, ...testSnap.data() };
      const allowedSectionIds = new Set(teacherSections.map((section) => section.id));
      if (!allowedSectionIds.has(test.sectionId)) {
        showError("You do not have access to this test.");
        return;
      }

      const [resultsSnap, students] = await Promise.all([
        firestore.collection("results").where("testId", "==", testId).get(),
        fetchStudentsBySection(test.sectionId),
      ]);

      const results = resultsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderStudentResults(test, results, students);
    } catch (error) {
      console.error("Failed to load test results:", error);
      showError("Unable to load test results right now.");
    }
  });
}

initializePage();
