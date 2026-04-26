// Firebase Configuration
const firebaseConfigParts = [
    'edutrack-admin',
    'firebaseapp',
    'AIzaSyAFpwi3k7Qth9MiqqRGKstY0Zkj_vrcdFY',
    '193864081571',
    '1:193864081571:web:7501afde01291f81e61f16',
    'com',
    'storage',
    'app'
];

const firebaseConfig = {
    apiKey: firebaseConfigParts[2],
    authDomain: firebaseConfigParts[0] + '.' + firebaseConfigParts[1] + '.' + firebaseConfigParts[5],
    projectId: firebaseConfigParts[0],
    storageBucket: firebaseConfigParts[0] + '.' + firebaseConfigParts[1] + firebaseConfigParts[6] + '.' + firebaseConfigParts[7],
    messagingSenderId: firebaseConfigParts[3],
    appId: firebaseConfigParts[4]
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Firebase services
const firestore = firebase.firestore();
const auth = firebase.auth();

// Global variables
let currentUser = null;
let currentSectionId = null;
let currentSectionName = '';
let availableSections = [];
let teacherSchoolId = null;
let teacherName = null;
let timetableData = null;

// DOM elements
const elements = {
    authScreen: document.getElementById('auth-screen'),
    mainApp: document.getElementById('main-app'),
    googleSignin: document.getElementById('google-signin'),
    signoutBtn: document.getElementById('signout-btn'),
    userEmail: document.getElementById('user-email'),
    sectionName: document.getElementById('section-name'),
    analyticsLink: document.getElementById('analytics-link'),
    sectionSwitcher: document.getElementById('section-switcher'),
    sectionSelect: document.getElementById('section-select'),
    testsContainer: document.getElementById('tests-container'),
    refreshTests: document.getElementById('refresh-tests'),
    viewStudentsBtn: document.getElementById('view-students-btn'),
    studentsTableBody: document.getElementById('studentsTableBody'),
    timetableSection: document.getElementById('timetable-section'),
    timetableYearSelect: document.getElementById('timetable-year-select'),
    timetableContainer: document.getElementById('timetable-container'),
    refreshTimetable: document.getElementById('refresh-timetable')
};

let studentsDataTable = null;

// Day order for timetable display
const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Authentication state listener
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        elements.authScreen.classList.add('d-none');
        elements.mainApp.classList.remove('d-none');
        elements.userEmail.textContent = user.email;
        await initializeApp();
    } else {
        currentUser = null;
        elements.mainApp.classList.add('d-none');
        elements.authScreen.classList.remove('d-none');
    }
});

// Google Sign-In
elements.googleSignin.onclick = async () => {
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        await auth.signInWithPopup(provider);
    } catch (error) {
        alert('Sign in failed: ' + error.message);
    }
};

// Sign out
elements.signoutBtn.onclick = () => auth.signOut();

// Initialize app after authentication
async function initializeApp() {
    await loadAssignedSections();
    await initializeTimetable();
    if (currentSectionId) {
        await loadTests();
    }
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
                    name: sectionNames[index] || assignment.sectionName || sectionId
                });
            });
        }

        if (assignment.sectionId && !sectionsMap.has(assignment.sectionId)) {
            sectionsMap.set(assignment.sectionId, {
                id: assignment.sectionId,
                name: assignment.sectionName || assignment.sectionId
            });
        }
    });

    return Array.from(sectionsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function setCurrentSection(sectionId) {
    const section = availableSections.find((item) => item.id === sectionId) || availableSections[0] || null;
    currentSectionId = section ? section.id : null;
    currentSectionName = section ? section.name : '';
    elements.sectionName.textContent = currentSectionId ? `${currentSectionName} (ID: ${currentSectionId})` : 'No section assigned';
    if (elements.analyticsLink) {
        const query = currentSectionId ? `?sectionId=${encodeURIComponent(currentSectionId)}` : '';
        elements.analyticsLink.href = `analytics.html${query}`;
    }
    const psedBulkLink = document.getElementById('psed-bulk-link');
    if (psedBulkLink) {
        const query = currentSectionId ? `?sectionId=${encodeURIComponent(currentSectionId)}` : '';
        psedBulkLink.href = `psed-bulk-update.html${query}`;
    }
    if (elements.sectionSelect && section) {
        elements.sectionSelect.value = section.id;
    }
}

function renderSectionSwitcher() {
    if (!elements.sectionSwitcher || !elements.sectionSelect) return;

    if (availableSections.length <= 1) {
        elements.sectionSwitcher.classList.add('d-none');
        elements.sectionSelect.innerHTML = '';
        return;
    }

    elements.sectionSelect.innerHTML = availableSections.map((section) => `
        <option value="${section.id}">${section.name}</option>
    `).join('');
    elements.sectionSelect.value = currentSectionId;
    elements.sectionSwitcher.classList.remove('d-none');
}

function getTestResultsPageUrl(testId) {
    return `test-results.html?testId=${encodeURIComponent(testId)}&sectionId=${encodeURIComponent(currentSectionId)}`;
}

// Get teacher's assigned sections
async function loadAssignedSections() {
    try {
        const snapshot = await firestore.collection('teacherAssignments')
            .where('teacherEmail', '==', currentUser.email)
            .get();
        
        if (snapshot.empty) {
            availableSections = [];
            currentSectionId = null;
            currentSectionName = '';
            elements.sectionName.textContent = 'No section assigned';
            elements.testsContainer.innerHTML = '<div class="p-4 text-center text-muted">You are not assigned to any section yet. Contact your school admin.</div>';
            renderSectionSwitcher();
            return;
        }

        availableSections = normalizeAssignedSections(snapshot);
        setCurrentSection(currentSectionId || availableSections[0]?.id || null);
        renderSectionSwitcher();
    } catch (error) {
        console.error('Get section:', error);
        elements.sectionName.textContent = 'Error loading section';
        availableSections = [];
        currentSectionId = null;
        currentSectionName = '';
        renderSectionSwitcher();
    }
}

// Load tests for the assigned section
async function loadTests() {
    try {
        const snapshot = await firestore.collection('tests')
            .where('sectionId', '==', currentSectionId)
            .get();

        if (snapshot.empty) {
            elements.testsContainer.innerHTML = '<div class="p-4 text-center text-muted">No tests found for your section</div>';
            return;
        }

        // Sort tests by date descending (most recent first)
        const sortedDocs = snapshot.docs.slice().sort((a, b) => {
            const dateA = a.data().testDate?.toDate?.() || new Date(a.data().testDate || 0);
            const dateB = b.data().testDate?.toDate?.() || new Date(b.data().testDate || 0);
            return dateB - dateA;
        });

        let html = '<div class="p-3">';

        for (const doc of sortedDocs) {
            const test = doc.data();
            const resultCount = await getResultCount(doc.id);

            // Format test date
            const testDateObj = test.testDate?.toDate?.() || new Date(test.testDate || null);
            const dateStr = testDateObj && !isNaN(testDateObj) ? testDateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'No date';

            html += `
                <div class="test-card">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h5 class="fw-bold">${test.testName || 'Test'}</h5>
                        <span class="badge" style="background:#16a085;color:white">${resultCount} Results</span>
                    </div>
                    <p class="text-muted mb-1"><i class="bi bi-calendar me-1"></i>${dateStr}</p>
                    <p class="text-muted mb-3">${test.description || 'No description'}</p>
                    <a class="btn" style="background:#16a085;color:white;border:none"
                       href="${getTestResultsPageUrl(doc.id)}"
                       target="_blank">
                        <i class="bi bi-eye me-2"></i>View Student Results
                    </a>
                </div>
            `;
        }
        
        html += '</div>';
        elements.testsContainer.innerHTML = html;
    } catch (error) {
        console.error('Load tests:', error);
        elements.testsContainer.innerHTML = '<div class="p-4 text-center text-danger">Error loading tests</div>';
    }
}

// Get count of results for a test
async function getResultCount(testId) {
    try {
        const snapshot = await firestore.collection('results')
            .where('testId', '==', testId)
            .get();
        return snapshot.size;
    } catch (error) {
        return 0;
    }
}

// Refresh tests
elements.refreshTests.onclick = () => loadTests();
elements.sectionSelect.onchange = async (event) => {
    const nextSectionId = event.target.value;
    if (!nextSectionId || nextSectionId === currentSectionId) return;
    setCurrentSection(nextSectionId);
    elements.testsContainer.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-success"></div><p class="mt-2 text-muted">Loading tests...</p></div>';
    await loadTests();
};

// View all students button
elements.viewStudentsBtn.onclick = async () => {
    const modal = new bootstrap.Modal(document.getElementById('studentsModal'));
    modal.show();
    await loadAndRenderStudents();
};

// Load students from all assigned sections
async function loadAllStudents() {
    if (availableSections.length === 0) return [];
    const sectionIds = availableSections.map(s => s.id);
    const students = [];
    
    // Firestore 'in' query supports max 10 values
    const chunkSize = 10;
    for (let i = 0; i < sectionIds.length; i += chunkSize) {
        const chunk = sectionIds.slice(i, i + chunkSize);
        const snapshot = await firestore.collection('students')
            .where('sectionId', 'in', chunk)
            .get();
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            students.push({
                id: doc.id,
                name: data.name || 'Unknown',
                studentId: data.studentId || doc.id,
                sectionId: data.sectionId,
                sectionName: availableSections.find(s => s.id === data.sectionId)?.name || data.sectionId,
                phone: data.phone || ''
            });
        });
    }
    
    // Sort by name
    return students.sort((a, b) => a.name.localeCompare(b.name));
}

// Load and render students table
async function loadAndRenderStudents() {
    elements.studentsTableBody.innerHTML = '<tr><td colspan="5" class="text-center"><div class="spinner-border text-success"></div><p class="mt-2 text-muted">Loading students...</p></td></tr>';
    
    try {
        const students = await loadAllStudents();
        
        if (students.length === 0) {
            elements.studentsTableBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No students found</td></tr>';
            return;
        }
        
        const rowsHtml = students.map(student => {
            const progressUrl = `report.html?studentId=${encodeURIComponent(student.id)}`;
            return `
                <tr>
                    <td>${escapeHtml(student.name)}</td>
                    <td>${escapeHtml(student.studentId)}</td>
                    <td>${escapeHtml(student.sectionName)}</td>
                    <td>${escapeHtml(student.phone)}</td>
                    <td>
                        <a href="${progressUrl}" target="_blank" class="btn btn-sm" style="background:#2c3e50;color:white;border:none;">
                            <i class="bi bi-graph-up me-1"></i> Progress
                        </a>
                    </td>
                </tr>
            `;
        }).join('');
        
        elements.studentsTableBody.innerHTML = rowsHtml;
        
        // Initialize DataTable
        const table = document.getElementById('studentsTable');
        if (table && window.simpleDatatables?.DataTable) {
            if (studentsDataTable) {
                studentsDataTable.destroy();
            }
            studentsDataTable = new window.simpleDatatables.DataTable(table, {
                searchable: true,
                fixedHeight: false,
                perPage: 25,
                perPageSelect: [10, 25, 50, 100]
            });
        }
    } catch (error) {
        console.error('Load students:', error);
        elements.studentsTableBody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error loading students</td></tr>';
    }
}

// Escape HTML helper
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Extract teacher name from email (e.g., "john.doe@school.com" -> "John Doe")
function extractTeacherNameFromEmail(email) {
    console.log('[DEBUG] extractTeacherNameFromEmail() called with:', email);
    if (!email) {
        console.log('[DEBUG] No email provided, returning null');
        return null;
    }
    const localPart = email.split('@')[0];
    console.log('[DEBUG] Local part of email:', localPart);
    // Handle formats like "john.doe", "john_doe", "johndoe", "john.doe123"
    const nameParts = localPart.split(/[._]/).filter(part => isNaN(part) && part.length > 1);
    console.log('[DEBUG] Name parts extracted:', nameParts);
    if (nameParts.length === 0) {
        console.log('[DEBUG] No valid name parts, returning localPart:', localPart);
        return localPart;
    }
    const result = nameParts.map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
    console.log('[DEBUG] Final extracted name:', result);
    return result;
}

// Load teacher info from assignments (schoolId and teacherName)
async function loadTeacherInfo() {
    console.log('[DEBUG] loadTeacherInfo() called, currentUser.email:', currentUser?.email);
    try {
        const snapshot = await firestore.collection('teacherAssignments')
            .where('teacherEmail', '==', currentUser.email)
            .get();

        console.log('[DEBUG] teacherAssignments query returned', snapshot.size, 'documents');
        snapshot.docs.forEach((doc, i) => {
            console.log(`[DEBUG] Assignment ${i}:`, doc.id, doc.data());
        });

        if (snapshot.empty) {
            console.log('[DEBUG] No teacher assignments found');
            return false;
        }

        const assignment = snapshot.docs[0].data();
        console.log('[DEBUG] Using assignment:', assignment);
        teacherSchoolId = assignment.schoolId || null;
        teacherName = assignment.teacherName || extractTeacherNameFromEmail(currentUser.email);
        console.log('[DEBUG] teacherSchoolId:', teacherSchoolId, 'teacherName:', teacherName);

        // Show timetable section if we have school info
        console.log('[DEBUG] teacherSchoolId present?', !!teacherSchoolId, 'timetableSection exists?', !!elements.timetableSection);
        if (teacherSchoolId && elements.timetableSection) {
            elements.timetableSection.classList.remove('d-none');
            console.log('[DEBUG] Timetable section made visible');
        }

        return true;
    } catch (error) {
        console.error('Error loading teacher info:', error);
        return false;
    }
}

// Load teacher's timetable from Firestore
async function loadTeacherTimetable() {
    console.log('[DEBUG] loadTeacherTimetable() called');
    const academicYear = elements.timetableYearSelect?.value;
    console.log('[DEBUG] Selected academic year:', academicYear);
    if (!academicYear) {
        elements.timetableContainer.innerHTML = `
            <div class="text-center text-muted py-3">
                <i class="bi bi-info-circle me-2"></i>Select an academic year to view your timetable
            </div>
        `;
        return;
    }

    if (!teacherSchoolId) {
        console.log('[DEBUG] teacherSchoolId missing, calling loadTeacherInfo()');
        await loadTeacherInfo();
    }

    console.log('[DEBUG] After loadTeacherInfo, teacherSchoolId:', teacherSchoolId, 'teacherName:', teacherName);

    if (!teacherSchoolId) {
        elements.timetableContainer.innerHTML = `
            <div class="alert alert-warning">
                <i class="bi bi-exclamation-triangle me-2"></i>
                No school assigned. Please contact your administrator.
            </div>
        `;
        return;
    }

    if (!teacherName) {
        teacherName = extractTeacherNameFromEmail(currentUser.email);
    }

    elements.timetableContainer.innerHTML = `
        <div class="text-center py-3">
            <div class="spinner-border text-primary"></div>
            <p class="mt-2 text-muted">Loading timetable...</p>
        </div>
    `;

    try {
        const docPath = `timetables/${teacherSchoolId}/years/${academicYear}`;
        console.log('[DEBUG] Fetching Firestore document at path:', docPath);
        const doc = await firestore.collection('timetables')
            .doc(teacherSchoolId)
            .collection('years')
            .doc(academicYear)
            .get();
        console.log('[DEBUG] Firestore document exists?', doc.exists);

        if (!doc.exists) {
            console.log('[DEBUG] Timetable document does not exist for:', academicYear, 'schoolId:', teacherSchoolId);
            elements.timetableContainer.innerHTML = `
                <div class="alert alert-info">
                    <i class="bi bi-info-circle me-2"></i>
                    No timetable found for ${academicYear}.
                </div>
            `;
            return;
        }

        const data = doc.data();
        console.log('[DEBUG] Timetable data keys:', Object.keys(data || {}));
        console.log('[DEBUG] timetableData present?', !!data.timetableData);
        if (data.timetableData) {
            console.log('[DEBUG] Number of classes in timetable:', Object.keys(data.timetableData).length);
        }
        timetableData = data.timetableData || {};

        renderTeacherTimetable();
    } catch (error) {
        console.error('Error loading timetable:', error);
        elements.timetableContainer.innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-circle me-2"></i>
                Error loading timetable. Please try again.
            </div>
        `;
    }
}

// Render teacher's timetable
function renderTeacherTimetable() {
    console.log('[DEBUG] renderTeacherTimetable() called');
    console.log('[DEBUG] timetableData available?', !!timetableData, 'teacherName:', teacherName);
    if (!timetableData || !teacherName) {
        console.log('[DEBUG] Missing data - timetableData:', timetableData, 'teacherName:', teacherName);
        return;
    }

    // Extract teacher's schedule from all classes
    const teacherSchedule = {};
    let hasData = false;

    Object.values(timetableData).forEach((classData, classIndex) => {
        if (!classData || !classData.days) {
            console.log('[DEBUG] Class', classIndex, 'has no days data');
            return;
        }

        classData.days.forEach((day, dayIndex) => {
            if (!day || !day.periods) {
                console.log('[DEBUG] Day', dayIndex, 'in class', classData.className, 'has no periods');
                return;
            }

            const dayName = day.dayName;
            if (!teacherSchedule[dayName]) {
                teacherSchedule[dayName] = [];
            }

            day.periods.forEach(period => {
                const match = period.teacherName && period.teacherName.toLowerCase() === teacherName.toLowerCase();
                if (match) {
                    console.log('[DEBUG] Found matching period:', period, 'in class:', classData.className, 'day:', dayName);
                    teacherSchedule[dayName].push({
                        period: period.period,
                        time: period.time || `P${period.period}`,
                        subject: period.subject || '',
                        className: classData.className,
                        type: period.type || 'Regular'
                    });
                    hasData = true;
                }
            });
        });
    });

    console.log('[DEBUG] hasData:', hasData, 'teacherSchedule keys:', Object.keys(teacherSchedule));
    if (!hasData) {
        console.log('[DEBUG] No matching classes found for teacher:', teacherName);
        elements.timetableContainer.innerHTML = `
            <div class="alert alert-info">
                <i class="bi bi-info-circle me-2"></i>
                No classes found for <strong>${escapeHtml(teacherName)}</strong> in this timetable.
            </div>
        `;
        return;
    }

    // Build timetable HTML
    let html = `
        <div class="table-responsive">
            <table class="table table-bordered table-sm">
                <thead class="table-dark">
                    <tr>
                        <th style="min-width: 100px;">Day</th>
                        <th style="min-width: 80px;">Period</th>
                        <th style="min-width: 100px;">Time</th>
                        <th>Class</th>
                        <th>Subject</th>
                        <th>Type</th>
                    </tr>
                </thead>
                <tbody>
    `;

    // Sort days by standard order
    const sortedDays = Object.keys(teacherSchedule).sort((a, b) => {
        const indexA = dayOrder.indexOf(a);
        const indexB = dayOrder.indexOf(b);
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });

    sortedDays.forEach(day => {
        const periods = teacherSchedule[day];
        // Sort by period number
        periods.sort((a, b) => {
            const numA = parseInt(a.period) || 0;
            const numB = parseInt(b.period) || 0;
            return numA - numB;
        });

        // Use rowspan for day column
        periods.forEach((period, index) => {
            html += '<tr>';
            if (index === 0) {
                html += `<td rowspan="${periods.length}" class="fw-semibold" style="vertical-align: middle; background: #f8f9fa;">${escapeHtml(day)}</td>`;
            }
            html += `
                <td class="text-center">${escapeHtml(String(period.period))}</td>
                <td>${escapeHtml(period.time)}</td>
                <td>${escapeHtml(period.className)}</td>
                <td>${escapeHtml(period.subject)}</td>
                <td><span class="badge bg-${period.type === 'Break' ? 'secondary' : 'info'}">${escapeHtml(period.type)}</span></td>
            </tr>`;
        });
    });

    html += '</tbody></table></div>';
    html += `
        <div class="mt-2 text-muted small">
            <i class="bi bi-person-check me-2"></i>Showing schedule for: <strong>${escapeHtml(teacherName)}</strong>
        </div>
    `;

    elements.timetableContainer.innerHTML = html;
}

// Initialize timetable after app loads
async function initializeTimetable() {
    await loadTeacherInfo();
}

// Timetable event listeners
if (elements.timetableYearSelect) {
    elements.timetableYearSelect.addEventListener('change', loadTeacherTimetable);
}
if (elements.refreshTimetable) {
    elements.refreshTimetable.addEventListener('click', loadTeacherTimetable);
}
