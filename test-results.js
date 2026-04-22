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

let currentTestId = null;
let availableTests = [];
let currentTestData = null;
let currentResultsData = [];
let currentStudentsData = [];

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
function getSectionIdFromQuery() {
  return new URLSearchParams(window.location.search).get("sectionId");
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
    
    const [resultsSnap, students] = await Promise.all([
      firestore.collection("results").where("testId", "==", testId).get(),
      fetchStudentsBySection(test.sectionId),
    ]);
    
    const results = resultsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    currentTestData = test;
    currentResultsData = results;
    currentStudentsData = students;
    renderStudentResults(test, results, students, sortSelectEl.value);
  } catch (error) {
    console.error("Failed to load test results:", error);
    showError("Unable to load test results right now.");
  }
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
          renderStudentResults(currentTestData, currentResultsData, currentStudentsData, e.target.value);
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
