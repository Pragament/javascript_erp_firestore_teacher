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
    auditLogLink: document.getElementById('audit-log-link'),
    sectionSwitcher: document.getElementById('section-switcher'),
    sectionSelect: document.getElementById('section-select'),
    testsContainer: document.getElementById('tests-container'),
    createTestBtn: document.getElementById('create-test-btn'),
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
    eventModalHeader: document.getElementById('event-modal-header'),
    eventIdInput: document.getElementById('event-id'),
    eventOriginalType: document.getElementById('event-original-type'),
    eventType: document.getElementById('event-type'),
    eventDateInput: document.getElementById('event-date'),
    eventPeriodInput: document.getElementById('event-period'),
    eventDescriptionInput: document.getElementById('event-description'),
    // Test-specific fields
    testFields: document.getElementById('test-fields'),
    testFrequency: document.getElementById('test-frequency'),
    testMode: document.getElementById('test-mode'),
    testCategory: document.getElementById('test-category'),
    testSyllabus: document.getElementById('test-syllabus'),
    testGradeExpectations: document.getElementById('test-grade-expectations'),
    // Revision-specific fields
    revisionFields: document.getElementById('revision-fields'),
    revisionGroupType: document.getElementById('revision-group-type'),
    revisionLocation: document.getElementById('revision-location'),
    availabilityBlock: document.getElementById('availability-block'),
    availMsg: document.getElementById('avail-msg'),
    revisionSyllabus: document.getElementById('revision-syllabus'),
    testRelation: document.getElementById('test-relation'),
    revisionGradeExpect: document.getElementById('revision-grade-expect'),
    // Common fields
    eventClasses: document.getElementById('event-classes'),
    eventSubjects: document.getElementById('event-subjects'),
    eventChapters: document.getElementById('event-chapters'),
    eventTopics: document.getElementById('event-topics'),
    eventSubtopics: document.getElementById('event-subtopics'),
    eventGroupActivity: document.getElementById('event-group-activity'),
    isGroupActivity: document.getElementById('is-group-activity'),
    // Tags and legacy fields
    eventClassInput: document.getElementById('event-class'),
    eventPSEDTags: document.getElementById('event-psed-tags'),
    eventCustomTagsInput: document.getElementById('event-custom-tags'),
    saveEventBtn: document.getElementById('save-event-btn'),
    deleteEventBtn: document.getElementById('delete-event-btn'),
    testEditModal: document.getElementById('testEditModal'),
    testEditModalTitle: document.getElementById('test-edit-modal-title'),
    editTestId: document.getElementById('edit-test-id'),
    editTestName: document.getElementById('edit-test-name'),
    editTestDate: document.getElementById('edit-test-date'),
    editTestSection: document.getElementById('edit-test-section'),
    editTestQuestionPaper: document.getElementById('edit-test-question-paper'),
    editTestMessage: document.getElementById('edit-test-message'),
    saveTestEditLabel: document.getElementById('save-test-edit-label'),
    saveTestEditBtn: document.getElementById('save-test-edit-btn'),
    bubbleImportPreviewModal: document.getElementById('bubbleImportPreviewModal'),
    bubbleImportSummary: document.getElementById('bubble-import-summary'),
    bubbleImportUnmatched: document.getElementById('bubble-import-unmatched'),
    bubbleImportAbsentees: document.getElementById('bubble-import-absentees'),
    bubbleImportPreviewBody: document.getElementById('bubble-import-preview-body'),
    bubbleImportAbsenteeBody: document.getElementById('bubble-import-absentee-body'),
    bubbleImportPreviewNote: document.getElementById('bubble-import-preview-note'),
    confirmBubbleImportBtn: document.getElementById('confirm-bubble-import-btn')
};

let studentsDataTable = null;

// Day order for timetable display
const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Calendar and event globals
let currentView = 'table'; // 'table' or 'calendar'
let currentCalendarView = 'month'; // 'month', 'week', or 'day'
let currentCalendarDate = new Date();
let teacherEvents = [];
let selectedPSEDIndicators = [];
let currentEditingTest = null;
let questionPaperOptions = [];
let pendingBubbleImport = null;
let bubbleImportPreviewSort = { key: 'previewRank', direction: 'asc' };
let bubbleImportAbsenteeSort = { key: 'roll', direction: 'asc' };

// Teacher identifier for timetable matching
let currentTeacherIdentifier = null;
let currentUseTeacherId = false;

const REDIRECT_PARAM = 'redirect';

function getSafeRedirectPath() {
    const redirect = new URLSearchParams(window.location.search).get(REDIRECT_PARAM);
    if (!redirect) return '';

    try {
        const redirectUrl = new URL(redirect, window.location.origin);
        if (redirectUrl.origin !== window.location.origin) return '';
        if (redirectUrl.pathname.endsWith('/index.html') || redirectUrl.pathname === '/' || redirectUrl.pathname === '') return '';
        return `${redirectUrl.pathname}${redirectUrl.search}${redirectUrl.hash}`;
    } catch (error) {
        console.warn('Ignoring invalid post-login redirect:', error);
        return '';
    }
}

function redirectToPreviousPageAfterLogin() {
    const redirectPath = getSafeRedirectPath();
    if (redirectPath) {
        window.location.assign(redirectPath);
        return true;
    }
    return false;
}

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
        if (redirectToPreviousPageAfterLogin()) return;

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
    if (elements.auditLogLink) {
        const query = currentSectionId ? `?sectionId=${encodeURIComponent(currentSectionId)}` : '';
        elements.auditLogLink.href = `audit-log.html${query}`;
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

    if (availableSections.length === 0) {
        elements.sectionSwitcher.classList.add('d-none');
        elements.sectionSelect.innerHTML = '';
        return;
    }

    elements.sectionSelect.innerHTML = availableSections.map((section) => `
        <option value="${section.id}">${section.name || section.id}</option>
    `).join('');
    elements.sectionSelect.value = currentSectionId;
    elements.sectionSwitcher.classList.remove('d-none');
}

function getTestResultsPageUrl(testId) {
    return `test-results.html?testId=${encodeURIComponent(testId)}&sectionId=${encodeURIComponent(currentSectionId)}`;
}

function getSubjectResultsPageUrl(testId, subjectId) {
    return `${getTestResultsPageUrl(testId)}&subjectId=${encodeURIComponent(subjectId)}`;
}

function getQuestionSubject(question) {
    return String(question?.Subject || question?.subject || question?.section || question?.subjectName || '').trim();
}

function getAvailableSubjectsForTest(test, questionPaper) {
    const questions = questionPaper?.questions || test?.questions || [];
    const subjects = new Map();

    questions.forEach((question) => {
        const subject = getQuestionSubject(question);
        const key = subject.toLowerCase();
        if (key && !subjects.has(key)) {
            subjects.set(key, subject);
        }
    });

    return Array.from(subjects.values()).sort((a, b) => a.localeCompare(b));
}

async function fetchQuestionPaper(questionPaperID) {
    if (!questionPaperID) return null;

    const querySnap = await firestore
        .collection('questionpapers')
        .where('questionPaperID', '==', questionPaperID)
        .limit(1)
        .get();

    if (!querySnap.empty) {
        const doc = querySnap.docs[0];
        return { id: doc.id, ...doc.data() };
    }

    const docSnap = await firestore.collection('questionpapers').doc(questionPaperID).get();
    return docSnap.exists ? { id: docSnap.id, ...docSnap.data() } : null;
}

async function getSubjectButtonsHtml(testId, test) {
    try {
        const questionPaper = await fetchQuestionPaper(test.questionPaperID);
        const subjects = getAvailableSubjectsForTest(test, questionPaper);

        if (subjects.length === 0) return '';

        return `
            <div class="subject-result-actions mt-3">
                <div class="small text-muted mb-2">Subject results</div>
                <div class="d-flex flex-wrap gap-2">
                    ${subjects.map((subject) => `
                        <a class="btn btn-sm btn-outline-success"
                           href="${getSubjectResultsPageUrl(testId, subject)}"
                           target="_blank">
                            <i class="bi bi-grid-3x3-gap me-1"></i>${escapeHtml(subject)} Results
                        </a>
                    `).join('')}
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Load subject result buttons:', error);
        return '';
    }
}

function getIsoDateInputValue(value) {
    if (!value) return '';
    const date = value?.toDate?.() || new Date(value);
    if (!date || isNaN(date)) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getQuestionPaperOptionLabel(paper) {
    const id = paper.questionPaperID || paper.id || '';
    const name = paper.templateName || paper.testName || paper.name || paper.title || 'Question Paper';
    const questionCount = Array.isArray(paper.questions) ? ` (${paper.questions.length} questions)` : '';
    return `${name}${id ? ` - ${id}` : ''}${questionCount}`;
}

async function fetchQuestionPaperOptions() {
    if (questionPaperOptions.length > 0) return questionPaperOptions;
    const snapshot = await firestore.collection('questionpapers').get();
    questionPaperOptions = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => getQuestionPaperOptionLabel(a).localeCompare(getQuestionPaperOptionLabel(b), undefined, { numeric: true }));
    return questionPaperOptions;
}

function getTestEditFieldSnapshot(test) {
    return {
        testName: test.testName || '',
        testDate: getIsoDateInputValue(test.testDate),
        sectionId: test.sectionId || '',
        sectionName: test.sectionName || '',
        questionPaperID: test.questionPaperID || '',
    };
}

function getChangedTestFields(before, after) {
    return Object.keys(after).filter((key) => String(before[key] || '') !== String(after[key] || ''));
}

function addTestEditAuditLog(batch, user, testId, before, after, changedFields, actionType = 'test_edit') {
    const auditRef = firestore.collection('resultEditAuditLogs').doc();
    batch.set(auditRef, {
        actionType,
        scope: 'test',
        teacherUid: user.uid || '',
        teacherEmail: user.email || '',
        testId,
        testName: after.testName || before.testName || '',
        sectionId: after.sectionId || before.sectionId || '',
        before,
        after,
        changedFields,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
}

function populateTestEditDropdowns(test) {
    elements.editTestSection.innerHTML = availableSections.map((section) => `
        <option value="${escapeHtml(section.id)}"${section.id === test.sectionId ? ' selected' : ''}>
            ${escapeHtml(section.name || section.id)}
        </option>
    `).join('');

    elements.editTestQuestionPaper.innerHTML = [
        '<option value="">No question paper</option>',
        ...questionPaperOptions.map((paper) => {
            const value = paper.questionPaperID || paper.id || '';
            const selected = value === (test.questionPaperID || '') ? ' selected' : '';
            return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(getQuestionPaperOptionLabel(paper))}</option>`;
        }),
    ].join('');
}

async function openTestEditModal(testId) {
    elements.testEditModalTitle.textContent = 'Edit Test';
    elements.saveTestEditLabel.textContent = 'Save Changes';
    elements.editTestMessage.textContent = 'Loading test details...';
    elements.editTestMessage.className = 'small mt-3 text-muted';
    elements.saveTestEditBtn.disabled = true;

    try {
        const [testSnap] = await Promise.all([
            firestore.collection('tests').doc(testId).get(),
            fetchQuestionPaperOptions(),
        ]);

        if (!testSnap.exists) throw new Error('Test not found.');
        const test = { id: testSnap.id, ...testSnap.data() };
        if (!availableSections.some((section) => section.id === test.sectionId)) {
            throw new Error('You do not have access to edit this test.');
        }

        currentEditingTest = test;
        populateTestEditDropdowns(test);
        elements.editTestId.value = test.id;
        elements.editTestName.value = test.testName || '';
        elements.editTestDate.value = getIsoDateInputValue(test.testDate);
        elements.editTestMessage.textContent = '';
        elements.saveTestEditBtn.disabled = false;
        new bootstrap.Modal(elements.testEditModal).show();
    } catch (error) {
        console.error('Open test edit modal:', error);
        currentEditingTest = null;
        elements.editTestMessage.textContent = error.message || 'Unable to load test details.';
        elements.editTestMessage.className = 'small mt-3 text-danger';
    }
}

async function openCreateTestModal() {
    elements.testEditModalTitle.textContent = 'Create Test';
    elements.saveTestEditLabel.textContent = 'Create Test';
    elements.editTestMessage.textContent = 'Loading form...';
    elements.editTestMessage.className = 'small mt-3 text-muted';
    elements.saveTestEditBtn.disabled = true;

    try {
        await fetchQuestionPaperOptions();
        const section = availableSections.find((item) => item.id === currentSectionId) || availableSections[0] || {};
        currentEditingTest = {
            id: '',
            isNew: true,
            testName: '',
            testDate: getIsoDateInputValue(new Date()),
            sectionId: section.id || '',
            sectionName: section.name || '',
            questionPaperID: '',
        };
        populateTestEditDropdowns(currentEditingTest);
        elements.editTestId.value = '';
        elements.editTestName.value = '';
        elements.editTestDate.value = currentEditingTest.testDate;
        elements.editTestMessage.textContent = '';
        elements.saveTestEditBtn.disabled = false;
        new bootstrap.Modal(elements.testEditModal).show();
    } catch (error) {
        console.error('Open create test modal:', error);
        currentEditingTest = null;
        elements.editTestMessage.textContent = error.message || 'Unable to prepare create test form.';
        elements.editTestMessage.className = 'small mt-3 text-danger';
    }
}

async function saveTestEdit() {
    if (!currentEditingTest || !currentUser) return;

    const selectedSection = availableSections.find((section) => section.id === elements.editTestSection.value);
    const isNewTest = currentEditingTest.isNew === true;
    const before = isNewTest
        ? { testName: '', testDate: '', sectionId: '', sectionName: '', questionPaperID: '' }
        : getTestEditFieldSnapshot(currentEditingTest);
    const after = {
        testName: elements.editTestName.value.trim(),
        testDate: elements.editTestDate.value,
        sectionId: elements.editTestSection.value,
        sectionName: selectedSection?.name || '',
        questionPaperID: elements.editTestQuestionPaper.value,
    };
    const changedFields = getChangedTestFields(before, after);

    if (!after.testName) {
        elements.editTestMessage.textContent = 'Test name is required.';
        elements.editTestMessage.className = 'small mt-3 text-danger';
        return;
    }
    if (!after.sectionId || !selectedSection) {
        elements.editTestMessage.textContent = 'Select a valid assigned section.';
        elements.editTestMessage.className = 'small mt-3 text-danger';
        return;
    }
    if (!isNewTest && changedFields.length === 0) {
        elements.editTestMessage.textContent = 'No changes to save.';
        elements.editTestMessage.className = 'small mt-3 text-muted';
        return;
    }

    elements.saveTestEditBtn.disabled = true;
    elements.editTestMessage.textContent = isNewTest ? 'Creating test...' : 'Saving changes...';
    elements.editTestMessage.className = 'small mt-3 text-muted';

    try {
        const batch = firestore.batch();
        const testRef = isNewTest ? firestore.collection('tests').doc() : firestore.collection('tests').doc(currentEditingTest.id);
        const testData = {
            testName: after.testName,
            testDate: after.testDate,
            sectionId: after.sectionId,
            sectionName: after.sectionName,
            questionPaperID: after.questionPaperID,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: currentUser.email || currentUser.uid || '',
        };
        if (isNewTest) {
            batch.set(testRef, {
                ...testData,
                class: '',
                templateName: '',
                year: '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: currentUser.email || currentUser.uid || '',
            });
        } else {
            batch.update(testRef, testData);
        }
        addTestEditAuditLog(batch, currentUser, testRef.id, before, after, changedFields, isNewTest ? 'test_create' : 'test_edit');
        await batch.commit();

        bootstrap.Modal.getInstance(elements.testEditModal)?.hide();
        if (after.sectionId !== currentSectionId) {
            setCurrentSection(after.sectionId);
        }
        await loadTests();
    } catch (error) {
        console.error('Save test edit:', error);
        elements.saveTestEditBtn.disabled = false;
        elements.editTestMessage.textContent = error.message || 'Unable to save test changes.';
        elements.editTestMessage.className = 'small mt-3 text-danger';
    }
}

function escapeCSV(value) {
    const str = String(value ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

function rowsToCSV(rows) {
    return rows.map((row) => row.map(escapeCSV).join(',')).join('\n');
}

function downloadCSV(filename, csv) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function getSafeFilenamePart(value, fallback = 'results') {
    return String(value || fallback).trim().replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || fallback;
}

function getResultQuestionKeys(results) {
    const keys = new Set();
    results.forEach((result) => {
        Object.keys(result || {}).forEach((key) => {
            if (/^(.+_Q\d+|Q\d+)$/i.test(key)) keys.add(key);
        });
    });
    return Array.from(keys).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

function buildStudentLookup(students) {
    const lookup = new Map();
    students.forEach((student) => {
        if (student.id) lookup.set(student.id, student);
        if (student.studentId) lookup.set(student.studentId, student);
    });
    return lookup;
}

function normalizeImportComparable(value) {
    return String(value ?? '').trim().toLowerCase();
}

function parseCSVText(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        const next = text[index + 1];

        if (char === '"' && inQuotes && next === '"') {
            cell += '"';
            index += 1;
        } else if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            row.push(cell);
            cell = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && next === '\n') index += 1;
            row.push(cell);
            if (row.some((value) => String(value).trim() !== '')) rows.push(row);
            row = [];
            cell = '';
        } else {
            cell += char;
        }
    }

    row.push(cell);
    if (row.some((value) => String(value).trim() !== '')) rows.push(row);
    return rows;
}

function getQuestionNumberFromImportHeader(header) {
    const match = String(header || '').trim().match(/^q(?:uestion)?\s*(\d+)$/i);
    return match ? Number(match[1]) : null;
}

function extractOptionTextForImport(value) {
    if (value == null) return '';
    if (typeof value === 'object') return String(value.optionText || value.text || value.label || value.value || '').trim();
    return String(value).trim().replace(/^Option\s*\d+\s*[:.)-]?\s*/i, '').trim();
}

function getQuestionNumberForImport(question, index) {
    const parsed = String(question?.subjectname_questionnumber || '').match(/_(?:Q)?(\d+)$/i);
    if (parsed) return Number(parsed[1]);
    if (Number.isFinite(Number(question?.questionNumber))) return Number(question.questionNumber);
    return index + 1;
}

function getQuestionSubjectForImport(question) {
    return String(question?.Subject || question?.subject || question?.section || question?.subjectName || 'General').trim() || 'General';
}

function getOptionNumbersFromImportValue(value) {
    const normalized = normalizeImportComparable(value);
    if (!normalized || normalized === '-' || normalized === 's' || normalized === 'skip' || normalized === 'skipped') return [];
    const tokens = normalized.match(/[a-d]|[1-4]/g) || [];
    const numbers = tokens.map((token) => {
        if (/^[1-4]$/.test(token)) return Number(token);
        return ['a', 'b', 'c', 'd'].indexOf(token) + 1;
    }).filter(Boolean);
    return [...new Set(numbers)].sort((a, b) => a - b);
}

function getOptionLettersFromImportNumbers(optionNumbers) {
    return [...new Set(optionNumbers || [])]
        .sort((a, b) => a - b)
        .map((optionNumber) => ['a', 'b', 'c', 'd'][Number(optionNumber) - 1])
        .filter(Boolean);
}

function getCorrectOptionNumbersForImport(question) {
    const explicit = [
        ...getOptionNumbersFromImportValue(question?.['Correct Option']),
        ...getOptionNumbersFromImportValue(question?.['Correct Options']),
    ];
    if (explicit.length > 0) return [...new Set(explicit)].sort((a, b) => a - b);

    const objectCorrect = [];
    for (let optionIndex = 1; optionIndex <= 4; optionIndex += 1) {
        const optionValue = question?.[`Option ${optionIndex}`];
        if (optionValue && typeof optionValue === 'object' && optionValue.correct === true) objectCorrect.push(optionIndex);
    }
    if (objectCorrect.length > 0) return objectCorrect;

    const answerText = normalizeImportComparable(question?.Answer || question?.CorrectAnswer || question?.correctAnswer);
    if (!answerText) return [];

    const matched = [];
    for (let optionIndex = 1; optionIndex <= 4; optionIndex += 1) {
        const optionText = normalizeImportComparable(extractOptionTextForImport(question?.[`Option ${optionIndex}`]));
        if (optionText && optionText === answerText) matched.push(optionIndex);
    }
    return matched;
}

function buildQuestionImportDetails(test, questionPaper) {
    return (questionPaper?.questions || test?.questions || []).map((question, index) => {
        const questionNumber = getQuestionNumberForImport(question, index);
        const subject = getQuestionSubjectForImport(question);
        return {
            questionNumber,
            subject,
            statusKey: `${subject}_Q${questionNumber}`,
            correctOptions: getCorrectOptionNumbersForImport(question),
        };
    });
}

function buildImportedAnswerStatus(selectedOptions, correctOptions) {
    if (!selectedOptions.length) return 's';
    const selectedLetters = getOptionLettersFromImportNumbers(selectedOptions);
    const correctLetters = getOptionLettersFromImportNumbers(correctOptions);
    const selectedKey = selectedLetters.join('');
    return selectedKey === correctLetters.join('') ? `r_${selectedKey}` : selectedKey;
}

function calculateImportedMetrics(result) {
    const counts = { correct: 0, wrong: 0, skipped: 0, total: 0 };
    Object.keys(result || {}).forEach((key) => {
        if (!/^(.+_Q\d+|Q\d+)$/i.test(key)) return;
        const value = normalizeImportComparable(result[key]);
        if (/^r(?:_[a-z0-9]+)?$/.test(value)) counts.correct += 1;
        else if (value === 's') counts.skipped += 1;
        else counts.wrong += 1;
        counts.total += 1;
    });
    const earnedMarks = counts.correct * 3 + counts.wrong * -1;
    const maxMarks = counts.total * 3;
    const marks = maxMarks > 0 ? Math.max(0, Math.min(100, (earnedMarks / maxMarks) * 100)) : 0;
    return {
        ...counts,
        earnedMarks,
        maxMarks,
        marks,
        percent: Math.round(marks),
    };
}

function getStudentRollValue(student, result = {}) {
    return String(student?.rollNo || student?.rollNumber || student?.roll || student?.admissionNo || result.rollNo || result.rollNumber || result.roll || '').trim();
}

function getCanonicalRollKey(value) {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) return '';
    if (/^\d+$/.test(trimmed)) {
        return String(Number(trimmed));
    }
    return trimmed.toLowerCase().replace(/^0+(?=[a-z0-9])/i, '');
}

function buildRollStudentLookup(students) {
    const lookup = new Map();
    students.forEach((student) => {
        const roll = getStudentRollValue(student);
        const canonicalRoll = getCanonicalRollKey(roll);
        if (canonicalRoll) lookup.set(canonicalRoll, student);
    });
    return lookup;
}

async function exportTestStudentResultsCSV(testId) {
    const button = Array.from(elements.testsContainer.querySelectorAll('.export-test-results-btn'))
        .find((item) => item.dataset.testId === testId);
    const originalHtml = button?.innerHTML;
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Exporting...';
    }

    try {
        const testSnap = await firestore.collection('tests').doc(testId).get();
        if (!testSnap.exists) throw new Error('Test not found.');
        const test = { id: testSnap.id, ...testSnap.data() };
        if (!availableSections.some((section) => section.id === test.sectionId)) {
            throw new Error('You do not have access to export this test.');
        }

        const [resultsSnap, studentsSnap] = await Promise.all([
            firestore.collection('results').where('testId', '==', testId).get(),
            firestore.collection('students').where('sectionId', '==', test.sectionId).get(),
        ]);
        const results = resultsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const students = studentsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const studentLookup = buildStudentLookup(students);
        const questionKeys = getResultQuestionKeys(results);
        const rows = [
            [
                'Test_ID',
                'Test_Name',
                'Test_Date',
                'Section_ID',
                'Student_ID',
                'Student_Name',
                'Roll',
                'Correct',
                'Wrong',
                'Skipped',
                'Total',
                'Percent',
                'Marks',
                'Rank',
                ...questionKeys,
            ],
            ...results.map((result) => {
                const student = studentLookup.get(result.studentId) || studentLookup.get(result.id) || {};
                return [
                    test.id,
                    test.testName || '',
                    getIsoDateInputValue(test.testDate),
                    test.sectionId || '',
                    result.studentId || result.id || '',
                    student.name || result.name || '',
                    student.rollNo || student.rollNumber || student.roll || result.rollNo || result.rollNumber || result.roll || '',
                    result.correct ?? '',
                    result.wrong ?? '',
                    result.skipped ?? '',
                    result.total ?? '',
                    result.percent ?? '',
                    result.earnedMarks ?? result.marks ?? '',
                    result.rank ?? '',
                    ...questionKeys.map((key) => result[key] ?? ''),
                ];
            }),
        ];

        downloadCSV(`${getSafeFilenamePart(test.testName || test.id, 'test')}-student-results.csv`, rowsToCSV(rows));
    } catch (error) {
        console.error('Export student results CSV:', error);
        alert(error.message || 'Unable to export student results.');
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = originalHtml;
        }
    }
}

async function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Unable to read file.'));
        reader.readAsText(file);
    });
}

function getBubbleImportSortValue(row, key) {
    if (key === 'rollNo') {
        const rollKey = getCanonicalRollKey(row.rollNo);
        return /^\d+$/.test(rollKey) ? Number(rollKey) : rollKey;
    }
    if (['correct', 'wrong', 'skipped', 'total', 'earnedMarks', 'percent', 'previewRank'].includes(key)) {
        return Number(row[key]) || 0;
    }
    return String(row[key] || '').toLowerCase();
}

function sortBubbleImportRows(rows, sortState) {
    const direction = sortState.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
        const valueA = getBubbleImportSortValue(a, sortState.key);
        const valueB = getBubbleImportSortValue(b, sortState.key);
        if (typeof valueA === 'number' && typeof valueB === 'number') {
            if (valueA !== valueB) return (valueA - valueB) * direction;
        } else {
            const compare = String(valueA).localeCompare(String(valueB), undefined, { numeric: true, sensitivity: 'base' });
            if (compare !== 0) return compare * direction;
        }
        return String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' });
    });
}

function getAbsenteeSortValue(student, key) {
    if (key === 'roll') {
        const rollKey = getCanonicalRollKey(student.roll);
        return /^\d+$/.test(rollKey) ? Number(rollKey) : rollKey;
    }
    return String(student[key] || '').toLowerCase();
}

function sortBubbleImportAbsentees(absentees) {
    const direction = bubbleImportAbsenteeSort.direction === 'asc' ? 1 : -1;
    return [...absentees].sort((a, b) => {
        const valueA = getAbsenteeSortValue(a, bubbleImportAbsenteeSort.key);
        const valueB = getAbsenteeSortValue(b, bubbleImportAbsenteeSort.key);
        if (typeof valueA === 'number' && typeof valueB === 'number') {
            if (valueA !== valueB) return (valueA - valueB) * direction;
        } else {
            const compare = String(valueA).localeCompare(String(valueB), undefined, { numeric: true, sensitivity: 'base' });
            if (compare !== 0) return compare * direction;
        }
        return String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' });
    });
}

function bindBubbleImportPreviewSortButtons() {
    document.querySelectorAll('.bubble-import-sort').forEach((button) => {
        button.addEventListener('click', () => {
            const key = button.dataset.sortKey || 'previewRank';
            bubbleImportPreviewSort = {
                key,
                direction: bubbleImportPreviewSort.key === key && bubbleImportPreviewSort.direction === 'asc' ? 'desc' : 'asc',
            };
            if (pendingBubbleImport) showBubbleImportPreview(pendingBubbleImport);
        });
    });

    document.querySelectorAll('.bubble-absentee-sort').forEach((button) => {
        button.addEventListener('click', () => {
            const key = button.dataset.sortKey || 'roll';
            bubbleImportAbsenteeSort = {
                key,
                direction: bubbleImportAbsenteeSort.key === key && bubbleImportAbsenteeSort.direction === 'asc' ? 'desc' : 'asc',
            };
            if (pendingBubbleImport) showBubbleImportPreview(pendingBubbleImport);
        });
    });
}

function showBubbleImportPreview(importData) {
    pendingBubbleImport = importData;
    const sortedImportedRows = sortBubbleImportRows(importData.importedResults, bubbleImportPreviewSort);
    const previewRows = sortedImportedRows.slice(0, 25);
    const absentees = sortBubbleImportAbsentees(importData.absentees || []);
    elements.bubbleImportSummary.innerHTML = `
        <strong>${escapeHtml(importData.test.testName || 'Test')}</strong><br>
        ${importData.importedResults.length} matched student row${importData.importedResults.length === 1 ? '' : 's'},
        ${absentees.length} absentee${absentees.length === 1 ? '' : 's'},
        ${importData.questionColumns.length} question column${importData.questionColumns.length === 1 ? '' : 's'}.
        Firestore will be updated only after confirmation.
    `;
    if (importData.unmatchedRolls.length) {
        elements.bubbleImportUnmatched.classList.remove('d-none');
        elements.bubbleImportUnmatched.textContent = `Unmatched rolls will be skipped: ${importData.unmatchedRolls.join(', ')}`;
    } else {
        elements.bubbleImportUnmatched.classList.add('d-none');
        elements.bubbleImportUnmatched.textContent = '';
    }

    elements.bubbleImportPreviewBody.innerHTML = previewRows.map((result) => `
        <tr>
            <td>${escapeHtml(result.rollNo || '')}</td>
            <td>${escapeHtml(result.name || result.studentId || '')}</td>
            <td>${escapeHtml(result.correct ?? '')}</td>
            <td>${escapeHtml(result.wrong ?? '')}</td>
            <td>${escapeHtml(result.skipped ?? '')}</td>
            <td>${escapeHtml(result.total ?? '')}</td>
            <td>${escapeHtml(result.earnedMarks ?? '')}</td>
            <td>${escapeHtml(result.percent ?? '')}</td>
            <td>${escapeHtml(result.previewRank ?? '')}</td>
        </tr>
    `).join('');
    elements.bubbleImportPreviewNote.textContent = importData.importedResults.length > previewRows.length
        ? `Showing first ${previewRows.length} rows. Confirm will import all ${importData.importedResults.length} matched rows.`
        : '';
    if (absentees.length) {
        elements.bubbleImportAbsentees.classList.remove('d-none');
        elements.bubbleImportAbsenteeBody.innerHTML = absentees.map((student) => `
            <tr>
                <td>${escapeHtml(student.roll || '')}</td>
                <td>${escapeHtml(student.name || '')}</td>
                <td>${escapeHtml(student.studentId || student.id || '')}</td>
            </tr>
        `).join('');
    } else {
        elements.bubbleImportAbsentees.classList.add('d-none');
        elements.bubbleImportAbsenteeBody.innerHTML = '';
    }
    elements.confirmBubbleImportBtn.disabled = false;
    bindBubbleImportPreviewSortButtons();
    bootstrap.Modal.getOrCreateInstance(elements.bubbleImportPreviewModal).show();
}

async function prepareStudentBubblesImport(testId, file) {
    const button = Array.from(elements.testsContainer.querySelectorAll('.import-bubbles-btn'))
        .find((item) => item.dataset.testId === testId);
    const originalHtml = button?.innerHTML;
    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Preparing...';
    }

    try {
        const csvText = await readFileAsText(file);
        const rows = parseCSVText(csvText);
        if (rows.length < 2) throw new Error('CSV must include a header row and student rows.');

        const headers = rows[0].map((header) => String(header || '').trim());
        const rollIndex = headers.findIndex((header) => /^roll(?:\s*no|number)?$/i.test(header));
        if (rollIndex < 0) throw new Error('CSV must include a Roll column.');

        const questionColumns = headers
            .map((header, index) => ({ index, questionNumber: getQuestionNumberFromImportHeader(header) }))
            .filter((column) => column.questionNumber);
        if (questionColumns.length === 0) throw new Error('CSV must include question columns like q1, q2, q3.');

        const testSnap = await firestore.collection('tests').doc(testId).get();
        if (!testSnap.exists) throw new Error('Test not found.');
        const test = { id: testSnap.id, ...testSnap.data() };
        if (!availableSections.some((section) => section.id === test.sectionId)) {
            throw new Error('You do not have access to import this test.');
        }

        const [questionPaper, studentsSnap, existingResultsSnap] = await Promise.all([
            fetchQuestionPaper(test.questionPaperID),
            firestore.collection('students').where('sectionId', '==', test.sectionId).get(),
            firestore.collection('results').where('testId', '==', testId).get(),
        ]);
        const questionDetails = buildQuestionImportDetails(test, questionPaper);
        const questionByNumber = new Map(questionDetails.map((question) => [question.questionNumber, question]));
        const missingQuestions = questionColumns
            .map((column) => column.questionNumber)
            .filter((questionNumber) => !questionByNumber.has(questionNumber));
        if (missingQuestions.length > 0) {
            throw new Error(`Question paper missing q${missingQuestions.slice(0, 5).join(', q')}.`);
        }

        const students = studentsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const rollLookup = buildRollStudentLookup(students);
        const existingResults = existingResultsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        const existingByStudentId = new Map(existingResults.map((result) => [result.studentId || result.id, result]));
        const importedStudentIds = new Set();
        const uploadedRollKeys = new Set();
        const unmatchedRolls = [];
        const importedResults = [];

        rows.slice(1).forEach((row) => {
            const roll = String(row[rollIndex] || '').trim();
            if (!roll) return;
            const rollKey = getCanonicalRollKey(roll);
            if (rollKey) uploadedRollKeys.add(rollKey);
            const student = rollLookup.get(rollKey);
            if (!student) {
                unmatchedRolls.push(roll);
                return;
            }

            const studentId = student.studentId || student.id;
            const resultId = `${testId}_${studentId}`;
            const existing = existingByStudentId.get(studentId) || {};
            const nextResult = {
                ...existing,
                id: existing.id || resultId,
                testId,
                studentId,
                name: student.name || existing.name || '',
                rollNo: getStudentRollValue(student, existing),
                sectionId: test.sectionId || '',
                testName: test.testName || '',
                importedAt: firebase.firestore.FieldValue.serverTimestamp(),
                importedBy: currentUser.email || currentUser.uid || '',
            };

            questionColumns.forEach((column) => {
                const question = questionByNumber.get(column.questionNumber);
                const selectedOptions = getOptionNumbersFromImportValue(row[column.index]);
                nextResult[question.statusKey] = buildImportedAnswerStatus(selectedOptions, question.correctOptions);
            });

            const metrics = calculateImportedMetrics(nextResult);
            Object.assign(nextResult, metrics);
            importedStudentIds.add(studentId);
            importedResults.push(nextResult);
        });
        const absentees = students
            .map((student) => ({
                id: student.id,
                studentId: student.studentId || student.id || '',
                name: student.name || '',
                roll: getStudentRollValue(student),
            }))
            .filter((student) => !uploadedRollKeys.has(getCanonicalRollKey(student.roll)));

        if (importedResults.length === 0) {
            throw new Error(unmatchedRolls.length ? 'No CSV rolls matched students in this section.' : 'No student rows found to import.');
        }

        const nextResultsByKey = new Map(existingResults.map((result) => [result.studentId || result.id, { ...result }]));
        importedResults.forEach((result) => nextResultsByKey.set(result.studentId || result.id, result));
        const allResults = Array.from(nextResultsByKey.values()).map((result) => {
            const metrics = calculateImportedMetrics(result);
            return { ...result, ...metrics };
        });
        const ranked = [...allResults].sort((a, b) => {
            if ((b.earnedMarks || 0) !== (a.earnedMarks || 0)) return (b.earnedMarks || 0) - (a.earnedMarks || 0);
            return (b.marks || 0) - (a.marks || 0);
        });
        const rankByStudentId = new Map(ranked.map((result, index) => [result.studentId || result.id, index + 1]));
        const previewImportedResults = importedResults.map((result) => ({
            ...result,
            previewRank: rankByStudentId.get(result.studentId || result.id) || 0,
        }));

        showBubbleImportPreview({
            testId,
            test,
            importedResults: previewImportedResults,
            allResults,
            importedStudentIds,
            existingResults,
            rankByStudentId,
            unmatchedRolls,
            absentees,
            questionColumns,
            fileName: file.name || '',
        });
    } catch (error) {
        console.error('Import student bubbles CSV:', error);
        alert(error.message || 'Unable to import student bubbles CSV.');
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = originalHtml;
        }
    }
}

async function confirmStudentBubblesImport() {
    if (!pendingBubbleImport) return;
    const importData = pendingBubbleImport;
    elements.confirmBubbleImportBtn.disabled = true;
    elements.confirmBubbleImportBtn.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>Saving...';

    try {
        const batch = firestore.batch();
        importData.allResults.forEach((result) => {
            const studentId = result.studentId || result.id;
            const docId = result.id || `${importData.testId}_${studentId}`;
            const rank = importData.rankByStudentId.get(studentId) || 0;
            const percentile = importData.allResults.length ? ((importData.allResults.length - rank + 1) / importData.allResults.length) * 100 : 0;
            const { id, ...data } = {
                ...result,
                rank,
                percentile,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            };
            const ref = firestore.collection('results').doc(docId);
            if (importData.importedStudentIds.has(studentId) || importData.existingResults.some((existing) => existing.id === docId)) {
                batch.set(ref, data, { merge: true });
            }
        });
        batch.set(firestore.collection('resultEditAuditLogs').doc(), {
            actionType: 'student_bubbles_import',
            scope: 'test',
            teacherUid: currentUser.uid || '',
            teacherEmail: currentUser.email || '',
            testId: importData.testId,
            testName: importData.test.testName || '',
            sectionId: importData.test.sectionId || '',
            importedRows: importData.importedResults.length,
            unmatchedRolls: importData.unmatchedRolls,
            absentees: importData.absentees || [],
            questionCount: importData.questionColumns.length,
            fileName: importData.fileName || '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        await batch.commit();

        bootstrap.Modal.getInstance(elements.bubbleImportPreviewModal)?.hide();
        pendingBubbleImport = null;
        alert(`Imported ${importData.importedResults.length} student row${importData.importedResults.length === 1 ? '' : 's'}.${importData.unmatchedRolls.length ? ` Unmatched rolls: ${importData.unmatchedRolls.join(', ')}` : ''}`);
        await loadTests();
    } catch (error) {
        console.error('Confirm student bubbles import:', error);
        alert(error.message || 'Unable to save imported student bubbles.');
    } finally {
        elements.confirmBubbleImportBtn.disabled = false;
        elements.confirmBubbleImportBtn.innerHTML = '<i class="bi bi-check2-circle me-1"></i>Confirm Import';
    }
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

// Fetch sections from all schools' classSections and sections array
async function fetchSectionsFromSchoolSectionId() {
    try {
        const sectionsMap = new Map();

        // Get all schools
        const schoolsSnapshot = await firestore.collection('schools').get();

        for (const schoolDoc of schoolsSnapshot.docs) {
            const schoolId = schoolDoc.id;
            const schoolData = schoolDoc.data();

            // 1. Fetch from classSections subcollection
            const classSectionsSnapshot = await firestore.collection('schools')
                .doc(schoolId)
                .collection('classSections')
                .get();

            for (const classSectionDoc of classSectionsSnapshot.docs) {
                const classSectionData = classSectionDoc.data();
                const schoolSectionId = classSectionData?.schoolSectionId;

                if (schoolSectionId && !sectionsMap.has(schoolSectionId)) {
                    // Try to get section name from the sections collection
                    const sectionDoc = await firestore.collection('sections').doc(schoolSectionId).get();
                    let sectionName = schoolSectionId;

                    if (sectionDoc.exists) {
                        const sectionData = sectionDoc.data();
                        sectionName = sectionData?.name
                            || sectionData?.sectionName
                            || sectionData?.className
                            || sectionData?.classSectionName
                            || sectionData?.title
                            || sectionData?.displayName
                            || schoolSectionId;
                    }

                    sectionsMap.set(schoolSectionId, {
                        id: schoolSectionId,
                        name: sectionName,
                        schoolId: schoolId
                    });
                }
            }

            // 2. Fetch from school's sections array
            const sectionsArray = schoolData?.sections;
            if (Array.isArray(sectionsArray)) {
                for (const sectionItem of sectionsArray) {
                    const sectionId = sectionItem?.sectionId;
                    const sectionName = sectionItem?.sectionName || sectionItem?.name || sectionId;

                    if (sectionId && !sectionsMap.has(sectionId)) {
                        sectionsMap.set(sectionId, {
                            id: sectionId,
                            name: sectionName,
                            schoolId: schoolId
                        });
                    }
                }
            }
        }

        const sections = Array.from(sectionsMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        console.log('[DEBUG] Fetched sections from all schools:', sections);
        return sections;
    } catch (error) {
        console.error('[DEBUG] Error fetching sections from schools:', error);
        return [];
    }
}

// Get teacher's assigned sections
async function loadAssignedSections() {
    try {
        // First, fetch sections from the specific schoolSectionId path
        const schoolSections = await fetchSectionsFromSchoolSectionId();
        console.log('[DEBUG] Sections from schoolSectionId:', schoolSections);

        const snapshot = await firestore.collection('teacherAssignments')
            .where('teacherEmail', '==', currentUser.email)
            .get();

        if (snapshot.empty && schoolSections.length === 0) {
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

        // Combine sections from both sources
        const assignmentSections = snapshot.empty ? [] : normalizeAssignedSections(snapshot);

        // Merge sections, avoiding duplicates (prefer assignment sections if same ID)
        const sectionMap = new Map();

        // Add schoolSections first
        schoolSections.forEach(section => {
            sectionMap.set(section.id, section);
        });

        // Add assignment sections (will overwrite if duplicate, keeping schoolId from assignments if present)
        assignmentSections.forEach(section => {
            sectionMap.set(section.id, section);
        });

        availableSections = Array.from(sectionMap.values()).sort((a, b) => a.name.localeCompare(b.name));
        console.log('[DEBUG] availableSections after merge:', availableSections);

        setCurrentSection(currentSectionId || availableSections[0]?.id || null);
        renderSectionSwitcher();

        // Show section-info if sections are available
        if (elements.sectionInfo) {
            elements.sectionInfo.classList.toggle('d-none', availableSections.length === 0);
        }
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
            const subjectButtonsHtml = await getSubjectButtonsHtml(doc.id, test);

            // Format test date
            const testDateObj = test.testDate?.toDate?.() || new Date(test.testDate || null);
            const dateStr = testDateObj && !isNaN(testDateObj) ? testDateObj.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'No date';

            html += `
                <div class="test-card">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h5 class="fw-bold">${escapeHtml(test.testName || 'Test')}</h5>
                        <div class="d-flex align-items-center gap-2">
                            <button type="button" class="btn btn-sm btn-outline-secondary edit-test-btn" data-test-id="${escapeHtml(doc.id)}" title="Edit test">
                                <i class="bi bi-pencil-square"></i>
                            </button>
                            <span class="badge" style="background:#16a085;color:white">${resultCount} Results</span>
                        </div>
                    </div>
                    <p class="text-muted mb-1"><i class="bi bi-calendar me-1"></i>${dateStr}</p>
                    <p class="text-muted mb-3">${escapeHtml(test.description || 'No description')}</p>
                    <div class="d-flex flex-wrap gap-2">
                        <a class="btn" style="background:#16a085;color:white;border:none"
                           href="${getTestResultsPageUrl(doc.id)}"
                           target="_blank">
                            <i class="bi bi-eye me-2"></i>View Student Results
                        </a>
                        <button type="button" class="btn export-test-results-btn" style="background:#f1c40f;color:#2c3e50;border:none"
                           data-test-id="${escapeHtml(doc.id)}">
                            <i class="bi bi-download me-2"></i>Export CSV
                        </button>
                        <button type="button" class="btn import-bubbles-btn" style="background:#8e44ad;color:white;border:none"
                           data-test-id="${escapeHtml(doc.id)}">
                            <i class="bi bi-upload me-2"></i>Import Bubbles CSV
                        </button>
                        <input type="file" class="d-none import-bubbles-input" data-test-id="${escapeHtml(doc.id)}" accept=".csv,text/csv">
                    </div>
                    ${subjectButtonsHtml}
                </div>
            `;
        }
        
        html += '</div>';
        elements.testsContainer.innerHTML = html;
        elements.testsContainer.querySelectorAll('.edit-test-btn').forEach((button) => {
            button.addEventListener('click', () => openTestEditModal(button.dataset.testId));
        });
        elements.testsContainer.querySelectorAll('.export-test-results-btn').forEach((button) => {
            button.addEventListener('click', () => exportTestStudentResultsCSV(button.dataset.testId));
        });
        elements.testsContainer.querySelectorAll('.import-bubbles-btn').forEach((button) => {
            button.addEventListener('click', () => {
                const input = Array.from(elements.testsContainer.querySelectorAll('.import-bubbles-input'))
                    .find((item) => item.dataset.testId === button.dataset.testId);
                if (input) input.click();
            });
        });
        elements.testsContainer.querySelectorAll('.import-bubbles-input').forEach((input) => {
            input.addEventListener('change', () => {
                const file = input.files?.[0];
                if (file) prepareStudentBubblesImport(input.dataset.testId, file);
                input.value = '';
            });
        });
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
elements.createTestBtn.onclick = () => openCreateTestModal();
elements.refreshTests.onclick = () => loadTests();
elements.saveTestEditBtn.onclick = () => saveTestEdit();
elements.confirmBubbleImportBtn.onclick = () => confirmStudentBubblesImport();
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

// Render calendar view (dispatcher for month/week/day)
function renderCalendar() {
    if (currentCalendarView === 'month') {
        renderMonthView();
    } else if (currentCalendarView === 'week') {
        renderWeekView();
    } else if (currentCalendarView === 'day') {
        renderDayView();
    }
}
window.renderCalendar = renderCalendar;

// Change calendar period based on current view
function changeCalendarPeriod(delta) {
    if (currentCalendarView === 'month') {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    } else if (currentCalendarView === 'week') {
        currentCalendarDate.setDate(currentCalendarDate.getDate() + (delta * 7));
    } else if (currentCalendarView === 'day') {
        currentCalendarDate.setDate(currentCalendarDate.getDate() + delta);
    }
    renderCalendar();
}
window.changeCalendarPeriod = changeCalendarPeriod;

// Set calendar view (month/week/day)
function setCalendarView(view) {
    currentCalendarView = view;
    renderCalendar();
}
window.setCalendarView = setCalendarView;

// Get view selector HTML
function getViewSelectorHtml() {
    return `
        <div class="btn-group btn-group-sm" role="group">
            <button class="btn btn-outline-secondary ${currentCalendarView === 'day' ? 'active' : ''}" onclick="setCalendarView('day')">
                <i class="bi bi-calendar-event"></i> Day
            </button>
            <button class="btn btn-outline-secondary ${currentCalendarView === 'week' ? 'active' : ''}" onclick="setCalendarView('week')">
                <i class="bi bi-calendar-week"></i> Week
            </button>
            <button class="btn btn-outline-secondary ${currentCalendarView === 'month' ? 'active' : ''}" onclick="setCalendarView('month')">
                <i class="bi bi-calendar-month"></i> Month
            </button>
        </div>
    `;
}

// Render month view
function renderMonthView() {
    if (!elements.timetableContainer) return;

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const monthName = currentCalendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    // Get first day of month and number of days
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay(); // 0 = Sunday

    // Adjust for Monday start
    const adjustedStartDay = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    let html = `
        <div class="calendar-nav">
            <div class="d-flex align-items-center gap-2">
                <button class="btn btn-outline-secondary btn-sm" onclick="changeCalendarPeriod(-1)">
                    <i class="bi bi-chevron-left"></i> Prev
                </button>
                <span class="calendar-month-year">${monthName}</span>
                <button class="btn btn-outline-secondary btn-sm" onclick="changeCalendarPeriod(1)">
                    Next <i class="bi bi-chevron-right"></i>
                </button>
            </div>
            ${getViewSelectorHtml()}
        </div>
        <div class="calendar-view calendar-month-view">
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

            // Get event type and color
            const eventType = event.eventType || event.type || 'test';
            const borderColor =
                eventType === 'test' ? '#dc2626' :
                eventType === 'revision' ? '#16a34a' :
                eventType === 'theory' ? '#2563eb' :
                eventType === 'practical' ? '#7c3aed' : '#2c3e50';

            // Get icon based on type
            const typeIcon =
                eventType === 'test' ? '📝' :
                eventType === 'revision' ? '📖' :
                eventType === 'theory' ? '🧠' :
                eventType === 'practical' ? '🔬' : '📅';

            // Get frequency info for tests
            const freqInfo = eventType === 'test' && event.frequency ? ` (${event.frequency})` : '';

            html += `
                <div class="calendar-event ${eventClass}" onclick="event.stopPropagation(); editEvent('${event.id}')" style="border-left: 4px solid ${borderColor};">
                    ${typeIcon} <strong>${escapeHtml(event.period || 'All Day')}</strong> ${escapeHtml(event.title)}${freqInfo}
                    <span class="event-classes-badge">${escapeHtml(event.classes || '')}</span>
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
window.renderMonthView = renderMonthView;

// Render week view
function renderWeekView() {
    if (!elements.timetableContainer) return;

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const date = currentCalendarDate.getDate();
    const dayOfWeek = currentCalendarDate.getDay();

    // Adjust for Monday start (0 = Monday, 6 = Sunday)
    const adjustedDayOfWeek = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    // Get start of week (Monday)
    const weekStart = new Date(year, month, date - adjustedDayOfWeek);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const weekRangeText = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

    let html = `
        <div class="calendar-nav">
            <div class="d-flex align-items-center gap-2">
                <button class="btn btn-outline-secondary btn-sm" onclick="changeCalendarPeriod(-1)">
                    <i class="bi bi-chevron-left"></i> Prev
                </button>
                <span class="calendar-month-year">${weekRangeText}</span>
                <button class="btn btn-outline-secondary btn-sm" onclick="changeCalendarPeriod(1)">
                    Next <i class="bi bi-chevron-right"></i>
                </button>
            </div>
            ${getViewSelectorHtml()}
        </div>
        <div class="calendar-view calendar-week-view">
    `;

    const today = new Date();
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // Generate 7 days
    for (let i = 0; i < 7; i++) {
        const currentDay = new Date(weekStart);
        currentDay.setDate(weekStart.getDate() + i);

        const dateStr = currentDay.toISOString().split('T')[0];
        const dayNum = currentDay.getDate();
        const isToday = today.toDateString() === currentDay.toDateString();
        const dayClass = isToday ? 'calendar-day today' : 'calendar-day';

        // Get events for this day
        const dayEvents = teacherEvents.filter(e => e.date === dateStr);

        html += `<div class="${dayClass}" onclick="openEventModal('${dateStr}')">`;
        html += `<div class="calendar-day-header">${dayNames[i]} ${dayNum}</div>`;

        // Render events with more details in week view
        dayEvents.forEach(event => {
            const eventClass = getEventStatusClass(event.date);
            const tagsHtml = event.psedTags?.map(tag => `<span class="event-tag psed-tag-${getPSEDTagCategory(tag)}">${tag}</span>`).join('') || '';

            // Get event type and color
            const eventType = event.eventType || event.type || 'test';
            const borderColor =
                eventType === 'test' ? '#dc2626' :
                eventType === 'revision' ? '#16a34a' :
                eventType === 'theory' ? '#2563eb' :
                eventType === 'practical' ? '#7c3aed' : '#2c3e50';

            // Get icon based on type
            const typeIcon =
                eventType === 'test' ? '📝' :
                eventType === 'revision' ? '📖' :
                eventType === 'theory' ? '🧠' :
                eventType === 'practical' ? '🔬' : '📅';

            // Week view shows more details
            const subjects = event.subjects ? `<div class="event-detail">${escapeHtml(event.subjects)}</div>` : '';
            const period = event.period ? `<span class="event-time">${escapeHtml(event.period)}</span>` : '';

            html += `
                <div class="calendar-event ${eventClass} week-event" onclick="event.stopPropagation(); editEvent('${event.id}')" style="border-left: 4px solid ${borderColor};">
                    <div class="event-header">${typeIcon} ${period}</div>
                    <div class="event-title">${escapeHtml(event.title)}</div>
                    ${subjects}
                    ${tagsHtml}
                </div>
            `;
        });

        html += '</div>';
    }

    html += '</div>';
    elements.timetableContainer.innerHTML = html;
}
window.renderWeekView = renderWeekView;

// Render day view
function renderDayView() {
    if (!elements.timetableContainer) return;

    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    const date = currentCalendarDate.getDate();
    const dayOfWeek = currentCalendarDate.getDay();

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = dayNames[dayOfWeek];
    const dateStr = currentCalendarDate.toISOString().split('T')[0];
    const isToday = new Date().toDateString() === currentCalendarDate.toDateString();

    const dateDisplay = currentCalendarDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    let html = `
        <div class="calendar-nav">
            <div class="d-flex align-items-center gap-2">
                <button class="btn btn-outline-secondary btn-sm" onclick="changeCalendarPeriod(-1)">
                    <i class="bi bi-chevron-left"></i> Prev
                </button>
                <span class="calendar-month-year ${isToday ? 'text-primary' : ''}">${dateDisplay}</span>
                <button class="btn btn-outline-secondary btn-sm" onclick="changeCalendarPeriod(1)">
                    Next <i class="bi bi-chevron-right"></i>
                </button>
            </div>
            ${getViewSelectorHtml()}
        </div>
        <div class="calendar-view calendar-day-view">
    `;

    // Get events for this day
    const dayEvents = teacherEvents.filter(e => e.date === dateStr);

    if (dayEvents.length === 0) {
        html += `
            <div class="calendar-empty-state day-empty">
                <i class="bi bi-calendar-x" style="font-size: 2rem; color: #adb5bd;"></i>
                <p class="mt-2">No events for this day</p>
                <button class="btn btn-outline-primary btn-sm mt-2" onclick="openEventModal('${dateStr}')">
                    <i class="bi bi-plus-lg"></i> Add Event
                </button>
            </div>
        `;
    } else {
        // Sort events by period if available
        dayEvents.sort((a, b) => (a.period || '').localeCompare(b.period || ''));

        dayEvents.forEach(event => {
            const eventClass = getEventStatusClass(event.date);
            const tagsHtml = event.psedTags?.map(tag => `<span class="event-tag psed-tag-${getPSEDTagCategory(tag)}">${tag}</span>`).join('') || '';

            // Get event type and color
            const eventType = event.eventType || event.type || 'test';
            const borderColor =
                eventType === 'test' ? '#dc2626' :
                eventType === 'revision' ? '#16a34a' :
                eventType === 'theory' ? '#2563eb' :
                eventType === 'practical' ? '#7c3aed' : '#2c3e50';

            // Get icon based on type
            const typeIcon =
                eventType === 'test' ? '📝' :
                eventType === 'revision' ? '📖' :
                eventType === 'theory' ? '🧠' :
                eventType === 'practical' ? '🔬' : '📅';

            // Day view shows full details
            const details = [];
            if (event.period) details.push(`<span class="detail-item"><i class="bi bi-clock"></i> ${escapeHtml(event.period)}</span>`);
            if (event.classes) details.push(`<span class="detail-item"><i class="bi bi-people"></i> ${escapeHtml(event.classes)}</span>`);
            if (event.subjects) details.push(`<span class="detail-item"><i class="bi bi-book"></i> ${escapeHtml(event.subjects)}</span>`);
            if (event.chapters) details.push(`<span class="detail-item"><i class="bi bi-journal-text"></i> Chapters: ${escapeHtml(event.chapters)}</span>`);
            if (event.topics) details.push(`<span class="detail-item"><i class="bi bi-list-check"></i> Topics: ${escapeHtml(event.topics)}</span>`);

            // Type-specific details
            if (eventType === 'test') {
                if (event.frequency) details.push(`<span class="detail-item"><i class="bi bi-calendar-check"></i> ${escapeHtml(event.frequency)}</span>`);
                if (event.testMode) details.push(`<span class="detail-item"><i class="bi bi-laptop"></i> Mode: ${escapeHtml(event.testMode)}</span>`);
                if (event.category) details.push(`<span class="detail-item"><i class="bi bi-lock"></i> ${escapeHtml(event.category)}</span>`);
            } else if (eventType === 'revision') {
                if (event.revisionGroupType) details.push(`<span class="detail-item"><i class="bi bi-person-check"></i> ${escapeHtml(event.revisionGroupType)}</span>`);
                if (event.revisionLocation) details.push(`<span class="detail-item"><i class="bi bi-geo-alt"></i> ${escapeHtml(event.revisionLocation)}</span>`);
                if (event.testRelation && event.testRelation !== 'none') details.push(`<span class="detail-item"><i class="bi bi-link"></i> ${escapeHtml(event.testRelation)}</span>`);
            }

            const detailsHtml = details.length > 0 ? `<div class="event-details">${details.join('')}</div>` : '';

            // Description
            const descHtml = event.description ? `<div class="event-description">${escapeHtml(event.description)}</div>` : '';

            html += `
                <div class="calendar-day-card ${eventClass}" onclick="editEvent('${event.id}')" style="border-left: 6px solid ${borderColor};">
                    <div class="day-card-header">
                        <span class="day-card-icon">${typeIcon}</span>
                        <span class="day-card-title">${escapeHtml(event.title)}</span>
                        <span class="day-card-type">${eventType}</span>
                    </div>
                    ${detailsHtml}
                    ${descHtml}
                    <div class="day-card-footer">
                        ${tagsHtml}
                        <button class="btn btn-sm btn-outline-primary" onclick="event.stopPropagation(); editEvent('${event.id}')">
                            <i class="bi bi-pencil"></i> Edit
                        </button>
                    </div>
                </div>
            `;
        });

        // Add button at bottom
        html += `
            <div class="text-center mt-3">
                <button class="btn btn-outline-primary" onclick="openEventModal('${dateStr}')">
                    <i class="bi bi-plus-lg"></i> Add Another Event
                </button>
            </div>
        `;
    }

    html += '</div>';
    elements.timetableContainer.innerHTML = html;
}
window.renderDayView = renderDayView;

// Change calendar month (legacy - now uses changeCalendarPeriod)
function changeCalendarMonth(delta) {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
    renderCalendar();
}
window.changeCalendarMonth = changeCalendarMonth;

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

// Toggle test/revision fields based on event type
function toggleEventTypeFields(eventType) {
    const testFields = elements.testFields;
    const revisionFields = elements.revisionFields;
    const modalHeader = elements.eventModalHeader;

    if (testFields) testFields.style.display = eventType === 'test' ? 'block' : 'none';
    if (revisionFields) revisionFields.style.display = eventType === 'revision' ? 'block' : 'none';

    // Update modal header color based on event type
    if (modalHeader) {
        modalHeader.style.background =
            eventType === 'test' ? '#dc2626' :
            eventType === 'revision' ? '#16a34a' :
            eventType === 'theory' ? '#2563eb' :
            eventType === 'practical' ? '#7c3aed' : '#2c3e50';
    }
}

// Update availability info for revision location
function updateAvailabilityInfo(location, dateStr) {
    const availBlock = elements.availabilityBlock;
    const availMsg = elements.availMsg;

    if (!availBlock || !availMsg || !location) return;

    if (location.includes('Android touch TV room') || location.includes('Computer lab')) {
        availBlock.style.display = 'block';
        const dayOfWeek = new Date(dateStr).toLocaleDateString('en', { weekday: 'long' });
        const isWeekend = dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday';
        availMsg.textContent = isWeekend
            ? '⚠️ Limited availability on weekends'
            : `✅ Available on ${dayOfWeek}: 8:00 - 16:00`;
    } else {
        availBlock.style.display = 'none';
    }
}

// Open event modal (add new)
function openEventModal(dateStr = null) {
    if (!elements.eventModal) return;

    // Reset form
    elements.eventIdInput.value = '';
    elements.eventOriginalType.value = '';
    elements.eventType.value = 'test';
    elements.eventDateInput.value = dateStr || new Date().toISOString().split('T')[0];
    elements.eventPeriodInput.value = '';
    elements.eventDescriptionInput.value = '';
    elements.eventCustomTagsInput.value = '';
    selectedPSEDIndicators = [];

    // Reset common fields
    if (elements.eventClasses) elements.eventClasses.value = '';
    if (elements.eventSubjects) elements.eventSubjects.value = '';
    if (elements.eventChapters) elements.eventChapters.value = '';
    if (elements.eventTopics) elements.eventTopics.value = '';
    if (elements.eventSubtopics) elements.eventSubtopics.value = '';
    if (elements.eventGroupActivity) elements.eventGroupActivity.value = '';
    if (elements.isGroupActivity) elements.isGroupActivity.checked = false;

    // Reset test-specific fields
    if (elements.testFrequency) elements.testFrequency.value = 'Weekly tests';
    if (elements.testMode) elements.testMode.value = 'OMR';
    if (elements.testCategory) elements.testCategory.value = 'Closed book';
    if (elements.testSyllabus) elements.testSyllabus.value = '';
    if (elements.testGradeExpectations) elements.testGradeExpectations.value = '';

    // Reset revision-specific fields
    if (elements.revisionGroupType) elements.revisionGroupType.value = 'Group of students';
    if (elements.revisionLocation) elements.revisionLocation.value = 'Homework';
    if (elements.revisionSyllabus) elements.revisionSyllabus.value = '';
    if (elements.testRelation) elements.testRelation.value = 'none';
    if (elements.revisionGradeExpect) elements.revisionGradeExpect.value = '';
    if (elements.availabilityBlock) elements.availabilityBlock.style.display = 'none';

    // Show/hide type-specific fields
    toggleEventTypeFields('test');

    // Reset tag styling
    elements.eventPSEDTags?.querySelectorAll('.psed-tag').forEach(tag => tag.classList.remove('selected'));

    elements.eventModalTitle.textContent = 'Add Event';
    elements.deleteEventBtn?.classList.add('d-none');

    const modal = new bootstrap.Modal(elements.eventModal);
    modal.show();
}
window.openEventModal = openEventModal;

// Edit existing event
function editEvent(eventId) {
    const event = teacherEvents.find(e => e.id === eventId);
    if (!event || !elements.eventModal) return;

    elements.eventIdInput.value = event.id;
    elements.eventOriginalType.value = event.eventType || event.type || 'test';
    elements.eventType.value = event.eventType || event.type || 'test';
    elements.eventDateInput.value = event.date || '';
    elements.eventPeriodInput.value = event.period || '';
    elements.eventDescriptionInput.value = event.description || '';
    elements.eventCustomTagsInput.value = event.customTags?.join(', ') || '';

    // Set common fields
    if (elements.eventClasses) elements.eventClasses.value = event.classes || event.className || '';
    if (elements.eventSubjects) elements.eventSubjects.value = event.subjects || '';
    if (elements.eventChapters) elements.eventChapters.value = event.chapters || '';
    if (elements.eventTopics) elements.eventTopics.value = event.topics || '';
    if (elements.eventSubtopics) elements.eventSubtopics.value = event.subtopics || '';
    if (elements.eventGroupActivity) elements.eventGroupActivity.value = event.groupActivity || event.groupActivityText || '';
    if (elements.isGroupActivity) elements.isGroupActivity.checked = event.isGroupActivity || false;

    // Show/hide type-specific fields
    const eventType = event.eventType || event.type || 'test';
    toggleEventTypeFields(eventType);

    // Set test-specific fields
    if (eventType === 'test') {
        if (elements.testFrequency) elements.testFrequency.value = event.frequency || event.testFrequency || 'Weekly tests';
        if (elements.testMode) elements.testMode.value = event.testMode || 'OMR';
        if (elements.testCategory) elements.testCategory.value = event.category || event.testCategory || 'Closed book';
        if (elements.testSyllabus) elements.testSyllabus.value = event.testSyllabus || '';
        if (elements.testGradeExpectations) elements.testGradeExpectations.value = event.gradeExpectations || event.testGradeExpectations || '';
    }

    // Set revision-specific fields
    if (eventType === 'revision') {
        if (elements.revisionGroupType) elements.revisionGroupType.value = event.revisionGroupType || 'Group of students';
        if (elements.revisionLocation) elements.revisionLocation.value = event.revisionLocation || 'Homework';
        if (elements.revisionSyllabus) elements.revisionSyllabus.value = event.revisionSyllabus || '';
        if (elements.testRelation) elements.testRelation.value = event.testRelation || 'none';
        if (elements.revisionGradeExpect) elements.revisionGradeExpect.value = event.revisionGradeExpect || '';
        if (elements.revisionLocation && elements.eventDateInput) {
            updateAvailabilityInfo(elements.revisionLocation.value, elements.eventDateInput.value);
        }
    }

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
window.editEvent = editEvent;

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

    const eventType = elements.eventType?.value || 'test';

    // Build event title based on type and specific details
    let eventTitle = '';
    if (eventType === 'test') {
        const frequency = elements.testFrequency?.value || 'Test';
        const subjects = elements.eventSubjects?.value || '';
        eventTitle = `${frequency}${subjects ? ' - ' + subjects : ''}`;
    } else if (eventType === 'revision') {
        const subjects = elements.eventSubjects?.value || '';
        eventTitle = `Revision${subjects ? ' - ' + subjects : ''}`;
    } else if (eventType === 'theory') {
        const subjects = elements.eventSubjects?.value || '';
        eventTitle = `Theory${subjects ? ' - ' + subjects : ''}`;
    } else if (eventType === 'practical') {
        const subjects = elements.eventSubjects?.value || '';
        eventTitle = `Practical${subjects ? ' - ' + subjects : ''}`;
    }

    const eventData = {
        title: eventTitle,
        eventType: eventType,
        date: elements.eventDateInput?.value,
        period: elements.eventPeriodInput?.value,
        description: elements.eventDescriptionInput?.value?.trim(),
        psedTags: selectedPSEDIndicators,
        customTags: elements.eventCustomTagsInput?.value?.split(',').map(t => t.trim()).filter(t => t) || [],
        teacherEmail: currentUser.email,
        teacherName: teacherName || extractTeacherNameFromEmail(currentUser.email),
        schoolId: teacherSchoolId,
        updatedAt: new Date(),
        // Common fields
        classes: elements.eventClasses?.value?.trim() || '',
        subjects: elements.eventSubjects?.value?.trim() || '',
        chapters: elements.eventChapters?.value?.trim() || '',
        topics: elements.eventTopics?.value?.trim() || '',
        subtopics: elements.eventSubtopics?.value?.trim() || '',
        groupActivity: elements.eventGroupActivity?.value?.trim() || '',
        isGroupActivity: elements.isGroupActivity?.checked || false
    };

    // Add type-specific fields
    if (eventType === 'test') {
        eventData.frequency = elements.testFrequency?.value || '';
        eventData.testMode = elements.testMode?.value || '';
        eventData.category = elements.testCategory?.value || '';
        eventData.testSyllabus = elements.testSyllabus?.value?.trim() || '';
        eventData.gradeExpectations = elements.testGradeExpectations?.value?.trim() || '';
    } else if (eventType === 'revision') {
        eventData.revisionGroupType = elements.revisionGroupType?.value || '';
        eventData.revisionLocation = elements.revisionLocation?.value || '';
        eventData.revisionSyllabus = elements.revisionSyllabus?.value?.trim() || '';
        eventData.testRelation = elements.testRelation?.value || 'none';
        eventData.revisionGradeExpect = elements.revisionGradeExpect?.value?.trim() || '';
    }

    if (!eventData.date) {
        alert('Please select a date');
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

// Event type change - show/hide type-specific fields
if (elements.eventType) {
    elements.eventType.addEventListener('change', (e) => {
        toggleEventTypeFields(e.target.value);
        if (e.target.value === 'revision' && elements.revisionLocation) {
            updateAvailabilityInfo(elements.revisionLocation.value, elements.eventDateInput?.value);
        }
    });
}

// Revision location change - update availability info
if (elements.revisionLocation) {
    elements.revisionLocation.addEventListener('change', (e) => {
        if (elements.eventType?.value === 'revision') {
            updateAvailabilityInfo(e.target.value, elements.eventDateInput?.value);
        }
    });
}
