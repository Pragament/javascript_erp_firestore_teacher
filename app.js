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
    sectionInfo: document.getElementById('section-info'),
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
    refreshTimetable: document.getElementById('refresh-timetable'),
    viewTableBtn: document.getElementById('view-table'),
    viewCalendarBtn: document.getElementById('view-calendar'),
    addEventBtn: document.getElementById('add-event-btn'),
    eventModal: document.getElementById('eventModal'),
    eventModalTitle: document.getElementById('event-modal-title'),
    eventIdInput: document.getElementById('event-id'),
    eventTitleInput: document.getElementById('event-title'),
    eventDateInput: document.getElementById('event-date'),
    eventPeriodInput: document.getElementById('event-period'),
    eventClassInput: document.getElementById('event-class'),
    eventDescriptionInput: document.getElementById('event-description'),
    eventPSEDTags: document.getElementById('event-psed-tags'),
    eventCustomTagsInput: document.getElementById('event-custom-tags'),
    saveEventBtn: document.getElementById('save-event-btn'),
    deleteEventBtn: document.getElementById('delete-event-btn')
};

let studentsDataTable = null;

// Day order for timetable display
const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Calendar and event globals
let currentView = 'table'; // 'table' or 'calendar'
let currentCalendarDate = new Date();
let teacherEvents = [];
let selectedPSEDIndicators = [];

// Teacher identifier for timetable matching
let currentTeacherIdentifier = null;
let currentUseTeacherId = false;

// PSED indicators for event tagging
const psedIndicators = [
    { id: 'self_awareness', name: 'Self-awareness', category: 'personal' },
    { id: 'goal_setting', name: 'Goal Setting', category: 'personal' },
    { id: 'decision_making', name: 'Decision-making', category: 'personal' },
    { id: 'self_discipline', name: 'Self-discipline', category: 'personal' },
    { id: 'growth_mindset', name: 'Growth Mindset', category: 'personal' },
    { id: 'collaboration', name: 'Collaboration', category: 'social' },
    { id: 'respect_diversity', name: 'Respect Diversity', category: 'social' },
    { id: 'communication', name: 'Communication', category: 'social' },
    { id: 'conflict_resolution', name: 'Conflict Resolution', category: 'social' },
    { id: 'digital_responsibility', name: 'Digital Responsibility', category: 'social' },
    { id: 'emotional_awareness', name: 'Emotional Awareness', category: 'emotional' },
    { id: 'stress_management', name: 'Stress Management', category: 'emotional' },
    { id: 'confidence', name: 'Confidence', category: 'emotional' },
    { id: 'resilience', name: 'Resilience', category: 'emotional' },
    { id: 'empathy', name: 'Empathy', category: 'emotional' },
    { id: 'critical_thinking', name: 'Critical Thinking', category: 'lifeskills' },
    { id: 'problem_solving', name: 'Problem-solving', category: 'lifeskills' },
    { id: 'ethical_decisions', name: 'Ethical Decisions', category: 'lifeskills' },
    { id: 'community_responsibility', name: 'Community', category: 'lifeskills' },
    { id: 'environmental_awareness', name: 'Environmental', category: 'lifeskills' }
];

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
        const schoolId = assignment.schoolId || null;

        if (sectionIds.length > 0) {
            sectionIds.forEach((sectionId, index) => {
                if (!sectionId || sectionsMap.has(sectionId)) return;
                sectionsMap.set(sectionId, {
                    id: sectionId,
                    name: sectionNames[index] || assignment.sectionName || sectionId,
                    schoolId: schoolId
                });
            });
        }

        if (assignment.sectionId && !sectionsMap.has(assignment.sectionId)) {
            sectionsMap.set(assignment.sectionId, {
                id: assignment.sectionId,
                name: assignment.sectionName || assignment.sectionId,
                schoolId: schoolId
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
    if (elements.sectionInfo) {
        elements.sectionInfo.classList.toggle('d-none', !currentSectionId);
    }
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

// Check if teacher exists in any school's teachers collection
async function checkTeacherInSchools(email) {
    try {
        // Query all schools and check their teachers subcollection
        const schoolsSnapshot = await firestore.collection('schools').get();

        for (const schoolDoc of schoolsSnapshot.docs) {
            const teachersSnapshot = await firestore.collection('schools')
                .doc(schoolDoc.id)
                .collection('teachers')
                .where('email', '==', email)
                .limit(1)
                .get();

            if (!teachersSnapshot.empty) {
                const teacherData = teachersSnapshot.docs[0].data();
                return {
                    found: true,
                    schoolId: schoolDoc.id,
                    teacherId: teachersSnapshot.docs[0].id,
                    teacherData: teacherData
                };
            }
        }
        return { found: false };
    } catch (error) {
        console.error('Error checking teacher in schools:', error);
        return { found: false };
    }
}

// Get teacher's assigned sections
async function loadAssignedSections() {
    try {
        const snapshot = await firestore.collection('teacherAssignments')
            .where('teacherEmail', '==', currentUser.email)
            .get();

        if (snapshot.empty) {
            // Check if teacher exists in schools/{schoolId}/teachers collection
            const schoolCheck = await checkTeacherInSchools(currentUser.email);

            if (schoolCheck.found) {
                // Teacher found in school's teachers collection - allow login with empty sections
                console.log('[DEBUG] Teacher found in school:', schoolCheck.schoolId);
                teacherSchoolId = schoolCheck.schoolId;
                availableSections = [];
                currentSectionId = null;
                currentSectionName = '';
                elements.sectionName.textContent = 'No section assigned';
                if (elements.sectionInfo) {
                    elements.sectionInfo.classList.add('d-none');
                }
                elements.testsContainer.innerHTML = '<div class="p-4 text-center text-muted">You are registered as a teacher but not assigned to any section yet. Contact your school admin.</div>';
                renderSectionSwitcher();
                return;
            }

            // Teacher not found anywhere - block login
            availableSections = [];
            currentSectionId = null;
            currentSectionName = '';
            elements.sectionName.textContent = 'No section assigned';
            if (elements.sectionInfo) {
                elements.sectionInfo.classList.add('d-none');
            }
            elements.testsContainer.innerHTML = '<div class="p-4 text-center text-muted">You are not assigned to any section yet. Contact your school admin.</div>';
            renderSectionSwitcher();
            return;
        }

        availableSections = normalizeAssignedSections(snapshot);
        console.log('[DEBUG] availableSections after normalize:', availableSections);
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
    
    // First check if we can get schoolId from the selected section
    const selectedSectionId = elements.sectionSelect?.value;
    console.log('[DEBUG] Selected section ID from dropdown:', selectedSectionId);
    
    if (selectedSectionId) {
        const selectedSection = availableSections.find(s => s.id === selectedSectionId);
        console.log('[DEBUG] Found selected section:', selectedSection);
        if (selectedSection && selectedSection.schoolId) {
            teacherSchoolId = selectedSection.schoolId;
            console.log('[DEBUG] Using schoolId from selected section:', teacherSchoolId);
        }
    }
    
    try {
        const snapshot = await firestore.collection('teacherAssignments')
            .where('teacherEmail', '==', currentUser.email)
            .get();

        console.log('[DEBUG] teacherAssignments query returned', snapshot.size, 'documents');
        snapshot.docs.forEach((doc, i) => {
            console.log(`[DEBUG] Assignment ${i}:`, doc.id, doc.data());
        });

        if (snapshot.empty) {
            console.log('[DEBUG] No teacher assignments found, checking schools collection');

            // Check if teacher exists in schools/{schoolId}/teachers collection
            const schoolCheck = await checkTeacherInSchools(currentUser.email);

            if (schoolCheck.found) {
                console.log('[DEBUG] Teacher found in school collection:', schoolCheck.schoolId);

                // Use schoolId from schools collection
                if (!teacherSchoolId) {
                    teacherSchoolId = schoolCheck.schoolId;
                    console.log('[DEBUG] Using schoolId from schools collection:', teacherSchoolId);
                }

                // Use teacherName from schools data or extract from email
                teacherName = schoolCheck.teacherData.name ||
                              schoolCheck.teacherData.teacherName ||
                              extractTeacherNameFromEmail(currentUser.email);
                console.log('[DEBUG] Final teacherSchoolId:', teacherSchoolId, 'teacherName:', teacherName);

                // Show timetable section if we have school info
                console.log('[DEBUG] teacherSchoolId present?', !!teacherSchoolId, 'timetableSection exists?', !!elements.timetableSection);
                if (teacherSchoolId && elements.timetableSection) {
                    elements.timetableSection.classList.remove('d-none');
                    console.log('[DEBUG] Timetable section made visible');
                }

                return true;
            }

            console.log('[DEBUG] Teacher not found in schools collection either');
            return false;
        }

        const assignment = snapshot.docs[0].data();
        console.log('[DEBUG] Using assignment:', assignment);

        // Use schoolId from section if available, otherwise fallback to assignment
        if (!teacherSchoolId) {
            teacherSchoolId = assignment.schoolId || null;
            console.log('[DEBUG] Using schoolId from assignment:', teacherSchoolId);
        }

        teacherName = assignment.teacherName || extractTeacherNameFromEmail(currentUser.email);
        console.log('[DEBUG] Final teacherSchoolId:', teacherSchoolId, 'teacherName:', teacherName);

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
    
    // Always refresh schoolId from currently selected section (user may have changed sections)
    refreshTeacherSchoolId();
    
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

    // If still no schoolId, try loading from teacherAssignments
    if (!teacherSchoolId) {
        console.log('[DEBUG] teacherSchoolId still missing, calling loadTeacherInfo()');
        await loadTeacherInfo();
    }

    console.log('[DEBUG] Final teacherSchoolId:', teacherSchoolId, 'teacherName:', teacherName);
    
    // Fetch teacherId (teacherCode) from schools collection
    let teacherId = null;
    if (teacherSchoolId) {
        teacherId = await fetchTeacherIdFromSchool();
        console.log('[DEBUG] teacherId fetched from school:', teacherId);
    }

    if (!teacherSchoolId) {
        elements.timetableContainer.innerHTML = `
            <div class="alert alert-warning">
                <i class="bi bi-exclamation-triangle me-2"></i>
                No school assigned. Please contact your administrator.
            </div>
        `;
        return;
    }

    // Use teacherId if available, otherwise fall back to teacherName
    currentTeacherIdentifier = teacherId || teacherName || extractTeacherNameFromEmail(currentUser?.email);
    currentUseTeacherId = !!teacherId;
    console.log('[DEBUG] Using teacherIdentifier:', currentTeacherIdentifier, 'useTeacherId:', currentUseTeacherId);

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

        // Pass teacherId and useTeacherId flag to render function
        renderTeacherTimetable(currentTeacherIdentifier, currentUseTeacherId);
        
        // Also load teacher events for calendar view
        await loadTeacherEvents();
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
function renderTeacherTimetable(teacherIdentifier, useTeacherId = false) {
    console.log('[DEBUG] renderTeacherTimetable() called with teacherIdentifier:', teacherIdentifier, 'useTeacherId:', useTeacherId);
    console.log('[DEBUG] timetableData available?', !!timetableData);
    if (!timetableData || !teacherIdentifier) {
        console.log('[DEBUG] Missing data - timetableData:', timetableData, 'teacherIdentifier:', teacherIdentifier);
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
                let match = false;
                if (useTeacherId && period.teacherId) {
                    // Match by teacherId (teacherCode)
                    match = period.teacherId.toLowerCase() === teacherIdentifier.toLowerCase();
                } else {
                    // Match by teacherName (fallback)
                    match = period.teacherName && period.teacherName.toLowerCase() === teacherIdentifier.toLowerCase();
                }
                if (match) {
                    console.log('[DEBUG] Found matching period:', period, 'in class:', classData.className, 'day:', dayName, 'useTeacherId:', useTeacherId);
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
        console.log('[DEBUG] No matching classes found for teacherIdentifier:', teacherIdentifier);
        elements.timetableContainer.innerHTML = `
            <div class="alert alert-info">
                <i class="bi bi-info-circle me-2"></i>
                No classes found for <strong>${escapeHtml(teacherIdentifier)}</strong> in this timetable.
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
            <i class="bi bi-person-check me-2"></i>Showing schedule for: <strong>${escapeHtml(teacherIdentifier)}</strong> (${useTeacherId ? 'by Teacher ID' : 'by Name'})
        </div>
    `;

    elements.timetableContainer.innerHTML = html;
}

// Initialize timetable after app loads
async function initializeTimetable() {
    await loadTeacherInfo();
}

// Refresh schoolId from currently selected section (call when user changes section or clicks refresh)
function refreshTeacherSchoolId() {
    console.log('[DEBUG] refreshTeacherSchoolId() called');
    const selectedSectionId = elements.sectionSelect?.value;
    console.log('[DEBUG] Current selected section ID:', selectedSectionId);
    
    if (selectedSectionId) {
        const selectedSection = availableSections.find(s => s.id === selectedSectionId);
        console.log('[DEBUG] Found section for schoolId refresh:', selectedSection);
        if (selectedSection && selectedSection.schoolId) {
            teacherSchoolId = selectedSection.schoolId;
            console.log('[DEBUG] Refreshed teacherSchoolId from selected section:', teacherSchoolId);
            return true;
        }
    }
    console.log('[DEBUG] Could not refresh schoolId from selected section');
    return false;
}

// Fetch teacherId (teacherCode) from schools/{schoolId}/teachers collection
async function fetchTeacherIdFromSchool() {
    console.log('[DEBUG] fetchTeacherIdFromSchool() called, teacherSchoolId:', teacherSchoolId, 'currentUser.email:', currentUser?.email);
    if (!teacherSchoolId || !currentUser?.email) {
        console.log('[DEBUG] Missing schoolId or email, cannot fetch teacherId');
        return null;
    }
    
    try {
        // Query teachers collection by email
        const snapshot = await firestore.collection('schools')
            .doc(teacherSchoolId)
            .collection('teachers')
            .where('email', '==', currentUser.email)
            .get();
        
        console.log('[DEBUG] Teachers query returned', snapshot.size, 'documents');
        snapshot.docs.forEach((doc, i) => {
            console.log(`[DEBUG] Teacher ${i}:`, doc.id, doc.data());
        });
        
        if (snapshot.empty) {
            console.log('[DEBUG] No teacher found with email:', currentUser.email);
            return null;
        }
        
        const teacherData = snapshot.docs[0].data();
        const teacherCode = teacherData.teacherCode || teacherData.teacherId || null;
        console.log('[DEBUG] Found teacherCode:', teacherCode, 'from teacher:', teacherData);
        return teacherCode;
    } catch (error) {
        console.error('[DEBUG] Error fetching teacherId from school:', error);
        return null;
    }
}

// Timetable event listeners
if (elements.timetableYearSelect) {
    elements.timetableYearSelect.addEventListener('change', loadTeacherTimetable);
}
if (elements.refreshTimetable) {
    elements.refreshTimetable.addEventListener('click', () => {
        console.log('[DEBUG] Refresh timetable button clicked');
        // Clear cached schoolId to force refresh from selected section
        teacherSchoolId = null;
        loadTeacherTimetable();
    });
}

// ==================== CALENDAR VIEW FUNCTIONS ====================

// Toggle between table and calendar view
function toggleView(view) {
    currentView = view;
    if (view === 'table') {
        elements.viewTableBtn?.classList.add('active');
        elements.viewCalendarBtn?.classList.remove('active');
        elements.addEventBtn?.classList.add('d-none');
        // Reload timetable to show table view
        if (timetableData) {
            renderTeacherTimetable(currentTeacherIdentifier || teacherName || extractTeacherNameFromEmail(currentUser?.email), currentUseTeacherId);
        }
    } else {
        elements.viewTableBtn?.classList.remove('active');
        elements.viewCalendarBtn?.classList.add('active');
        elements.addEventBtn?.classList.remove('d-none');
        renderCalendar();
        loadTeacherEvents();
    }
}

// Render calendar view
function renderCalendar() {
    if (!elements.timetableContainer) return;

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const monthName = currentCalendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay(); // 0 = Sunday

    // Adjust for Monday start (optional - change if you want Sunday start)
    const adjustedStartDay = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    let html = `
        <div class="calendar-nav">
            <button class="btn btn-outline-secondary btn-sm" onclick="changeCalendarMonth(-1)">
                <i class="bi bi-chevron-left"></i> Prev
            </button>
            <span class="calendar-month-year">${monthName}</span>
            <button class="btn btn-outline-secondary btn-sm" onclick="changeCalendarMonth(1)">
                Next <i class="bi bi-chevron-right"></i>
            </button>
        </div>
        <div class="calendar-view">
            <div class="calendar-header">Mon</div>
            <div class="calendar-header">Tue</div>
            <div class="calendar-header">Wed</div>
            <div class="calendar-header">Thu</div>
            <div class="calendar-header">Fri</div>
            <div class="calendar-header">Sat</div>
            <div class="calendar-header">Sun</div>
    `;

    // Previous month days
    const prevMonth = new Date(year, month, 0);
    const daysInPrevMonth = prevMonth.getDate();
    for (let i = adjustedStartDay - 1; i >= 0; i--) {
        const day = daysInPrevMonth - i;
        html += `<div class="calendar-day other-month"><div class="calendar-day-number">${day}</div></div>`;
    }

    // Current month days
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
        const dayClass = isToday ? 'calendar-day today' : 'calendar-day';

        // Get events for this day
        const dayEvents = teacherEvents.filter(e => e.date === dateStr);

        html += `<div class="${dayClass}" onclick="openEventModal('${dateStr}')">`;
        html += `<div class="calendar-day-number">${day}</div>`;

        // Render events
        dayEvents.forEach(event => {
            const eventClass = getEventStatusClass(event.date);
            const tagsHtml = event.psedTags?.map(tag => `<span class="event-tag psed-tag-${getPSEDTagCategory(tag)}">${tag}</span>`).join('') || '';
            html += `
                <div class="calendar-event ${eventClass}" onclick="event.stopPropagation(); editEvent('${event.id}')">
                    <strong>${escapeHtml(event.period)}</strong> ${escapeHtml(event.title)}
                    ${tagsHtml}
                </div>
            `;
        });

        html += '</div>';
    }

    // Next month days
    const totalCells = adjustedStartDay + daysInMonth;
    const remainingCells = 35 - totalCells; // 5 rows x 7 days = 35
    for (let day = 1; day <= remainingCells; day++) {
        html += `<div class="calendar-day other-month"><div class="calendar-day-number">${day}</div></div>`;
    }

    html += '</div>';
    elements.timetableContainer.innerHTML = html;
}

// Change calendar month
function changeCalendarMonth(delta) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    renderCalendar();
}

// Get event status class based on date
function getEventStatusClass(eventDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const event = new Date(eventDate);
    event.setHours(0, 0, 0, 0);

    if (event.getTime() === today.getTime()) return 'event-today';
    if (event < today) return 'event-past';
    return 'event-upcoming';
}

// Get PSED tag category for styling
function getPSEDTagCategory(tagId) {
    const indicator = psedIndicators.find(p => p.id === tagId);
    return indicator ? indicator.category : 'personal';
}

// ==================== EVENT MANAGEMENT FUNCTIONS ====================

// Initialize PSED tags in modal
function initPSEDTagSelector() {
    if (!elements.eventPSEDTags) return;

    elements.eventPSEDTags.innerHTML = psedIndicators.map(indicator => `
        <span class="psed-tag psed-tag-${indicator.category}" 
              data-indicator="${indicator.id}"
              onclick="togglePSEDTag('${indicator.id}')">
            ${indicator.name}
        </span>
    `).join('');
}

// Toggle PSED tag selection
function togglePSEDTag(indicatorId) {
    const index = selectedPSEDIndicators.indexOf(indicatorId);
    const tagElement = elements.eventPSEDTags?.querySelector(`[data-indicator="${indicatorId}"]`);

    if (index > -1) {
        selectedPSEDIndicators.splice(index, 1);
        tagElement?.classList.remove('selected');
    } else {
        selectedPSEDIndicators.push(indicatorId);
        tagElement?.classList.add('selected');
    }
}

// Open event modal (add new)
function openEventModal(dateStr = null) {
    if (!elements.eventModal) return;

    // Reset form
    elements.eventIdInput.value = '';
    elements.eventTitleInput.value = '';
    elements.eventDateInput.value = dateStr || new Date().toISOString().split('T')[0];
    elements.eventPeriodInput.value = '';
    elements.eventClassInput.value = '';
    elements.eventDescriptionInput.value = '';
    elements.eventCustomTagsInput.value = '';
    selectedPSEDIndicators = [];

    // Reset tag styling
    elements.eventPSEDTags?.querySelectorAll('.psed-tag').forEach(tag => tag.classList.remove('selected'));

    elements.eventModalTitle.textContent = 'Add Event';
    elements.deleteEventBtn?.classList.add('d-none');

    const modal = new bootstrap.Modal(elements.eventModal);
    modal.show();
}

// Edit existing event
function editEvent(eventId) {
    const event = teacherEvents.find(e => e.id === eventId);
    if (!event || !elements.eventModal) return;

    elements.eventIdInput.value = event.id;
    elements.eventTitleInput.value = event.title || '';
    elements.eventDateInput.value = event.date || '';
    elements.eventPeriodInput.value = event.period || '';
    elements.eventClassInput.value = event.className || '';
    elements.eventDescriptionInput.value = event.description || '';
    elements.eventCustomTagsInput.value = event.customTags?.join(', ') || '';

    // Set PSED tags
    selectedPSEDIndicators = event.psedTags || [];
    elements.eventPSEDTags?.querySelectorAll('.psed-tag').forEach(tag => {
        if (selectedPSEDIndicators.includes(tag.dataset.indicator)) {
            tag.classList.add('selected');
        } else {
            tag.classList.remove('selected');
        }
    });

    elements.eventModalTitle.textContent = 'Edit Event';
    elements.deleteEventBtn?.classList.remove('d-none');

    const modal = new bootstrap.Modal(elements.eventModal);
    modal.show();
}

// Get day name from date string (e.g., "2025-04-28" -> "Monday")
function getDayNameFromDate(dateStr) {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
}

// Autopopulate class/subject from timetable based on date and period
function autopopulateFromTimetable() {
    const dateStr = elements.eventDateInput?.value;
    const period = elements.eventPeriodInput?.value;
    
    console.log('[DEBUG] autopopulateFromTimetable() called, date:', dateStr, 'period:', period);
    console.log('[DEBUG] Using globals - teacherIdentifier:', currentTeacherIdentifier, 'useTeacherId:', currentUseTeacherId);
    
    if (!dateStr || !period || period === 'all' || !timetableData || !currentTeacherIdentifier) {
        console.log('[DEBUG] Missing data for autopopulate');
        return;
    }
    
    const dayName = getDayNameFromDate(dateStr);
    console.log('[DEBUG] Day name from date:', dayName);
    
    if (!dayName) return;
    
    // Search through timetable data for matching day and period
    let foundClass = null;
    let foundSubject = null;
    
    Object.values(timetableData).forEach(classData => {
        if (!classData?.days) return;
        
        classData.days.forEach(day => {
            if (day.dayName !== dayName || !day.periods) return;
            
            day.periods.forEach(p => {
                const periodMatch = String(p.period) === period.replace('P', '');
                const teacherMatch = currentUseTeacherId 
                    ? (p.teacherId && p.teacherId.toLowerCase() === currentTeacherIdentifier.toLowerCase())
                    : (p.teacherName && p.teacherName.toLowerCase() === currentTeacherIdentifier.toLowerCase());
                
                if (periodMatch && teacherMatch) {
                    foundClass = classData.className;
                    foundSubject = p.subject;
                    console.log('[DEBUG] Found match:', foundClass, foundSubject);
                }
            });
        });
    });
    
    // Autopopulate if found
    if (foundClass && foundSubject) {
        elements.eventClassInput.value = `${foundClass}, ${foundSubject}`;
        console.log('[DEBUG] Autopopulated class/subject:', elements.eventClassInput.value);
    }
}

// Save event to Firestore
async function saveEvent() {
    if (!currentUser?.email || !teacherSchoolId) {
        alert('Please wait for data to load');
        return;
    }

    const eventData = {
        title: elements.eventTitleInput?.value?.trim(),
        date: elements.eventDateInput?.value,
        period: elements.eventPeriodInput?.value,
        className: elements.eventClassInput?.value?.trim(),
        description: elements.eventDescriptionInput?.value?.trim(),
        psedTags: selectedPSEDIndicators,
        customTags: elements.eventCustomTagsInput?.value?.split(',').map(t => t.trim()).filter(t => t) || [],
        teacherEmail: currentUser.email,
        teacherName: teacherName || extractTeacherNameFromEmail(currentUser.email),
        schoolId: teacherSchoolId,
        updatedAt: new Date()
    };

    if (!eventData.title || !eventData.date) {
        alert('Please enter title and date');
        return;
    }

    try {
        const eventId = elements.eventIdInput?.value;
        const eventsRef = firestore.collection('schools')
            .doc(teacherSchoolId)
            .collection('teacherEvents');

        if (eventId) {
            // Update existing
            await eventsRef.doc(eventId).update(eventData);
        } else {
            // Create new
            eventData.createdAt = new Date();
            await eventsRef.add(eventData);
        }

        // Close modal and refresh
        bootstrap.Modal.getInstance(elements.eventModal)?.hide();
        await loadTeacherEvents();

        if (currentView === 'calendar') {
            renderCalendar();
        }
    } catch (error) {
        console.error('Error saving event:', error);
        alert('Error saving event. Please try again.');
    }
}

// Delete event
async function deleteEvent() {
    const eventId = elements.eventIdInput?.value;
    if (!eventId || !teacherSchoolId) return;

    if (!confirm('Are you sure you want to delete this event?')) return;

    try {
        await firestore.collection('schools')
            .doc(teacherSchoolId)
            .collection('teacherEvents')
            .doc(eventId)
            .delete();

        bootstrap.Modal.getInstance(elements.eventModal)?.hide();
        await loadTeacherEvents();

        if (currentView === 'calendar') {
            renderCalendar();
        }
    } catch (error) {
        console.error('Error deleting event:', error);
        alert('Error deleting event');
    }
}

// Load teacher events from Firestore
async function loadTeacherEvents() {
    if (!teacherSchoolId || !currentUser?.email) {
        console.log('[DEBUG] Cannot load events - missing schoolId or email');
        return;
    }

    try {
        const snapshot = await firestore.collection('schools')
            .doc(teacherSchoolId)
            .collection('teacherEvents')
            .where('teacherEmail', '==', currentUser.email)
            .get();

        teacherEvents = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log('[DEBUG] Loaded', teacherEvents.length, 'teacher events');

        if (currentView === 'calendar') {
            renderCalendar();
        }
    } catch (error) {
        console.error('Error loading events:', error);
    }
}

// ==================== CALENDAR EVENT LISTENERS ====================

// Initialize PSED tags on page load
if (elements.eventPSEDTags) {
    initPSEDTagSelector();
}

// View toggle buttons
if (elements.viewTableBtn) {
    elements.viewTableBtn.addEventListener('click', () => toggleView('table'));
}
if (elements.viewCalendarBtn) {
    elements.viewCalendarBtn.addEventListener('click', () => toggleView('calendar'));
}

// Add event button
if (elements.addEventBtn) {
    elements.addEventBtn.addEventListener('click', () => openEventModal());
}

// Save/Delete event buttons
if (elements.saveEventBtn) {
    elements.saveEventBtn.addEventListener('click', saveEvent);
}
if (elements.deleteEventBtn) {
    elements.deleteEventBtn.addEventListener('click', deleteEvent);
}

// Autopopulate class/subject when date or period changes
if (elements.eventDateInput) {
    elements.eventDateInput.addEventListener('change', autopopulateFromTimetable);
}
if (elements.eventPeriodInput) {
    elements.eventPeriodInput.addEventListener('change', autopopulateFromTimetable);
}
