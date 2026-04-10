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
    studentsTableBody: document.getElementById('studentsTableBody')
};

let studentsDataTable = null;

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
    elements.sectionName.textContent = currentSectionName || 'No section assigned';
    if (elements.analyticsLink) {
        const query = currentSectionId ? `?sectionId=${encodeURIComponent(currentSectionId)}` : '';
        elements.analyticsLink.href = `analytics.html${query}`;
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
    return `test-results.html?testId=${encodeURIComponent(testId)}`;
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

        let html = '<div class="p-3">';
        
        for (const doc of snapshot.docs) {
            const test = doc.data();
            const resultCount = await getResultCount(doc.id);
            
            html += `
                <div class="test-card">
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <h5 class="fw-bold">${test.testName || 'Test'}</h5>
                        <span class="badge" style="background:#16a085;color:white">${resultCount} Results</span>
                    </div>
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
