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
let availableSections = [];
let currentStudents = [];
let hasUnsavedChanges = false;

// PSED Rubric Structure
const psedCategories = [
    {
        name: 'Personal Development',
        indicators: [
            { id: 'self_awareness', name: 'Self-awareness & reflection' },
            { id: 'goal_setting', name: 'Goal setting & time management' },
            { id: 'decision_making', name: 'Decision-making' },
            { id: 'self_discipline', name: 'Self-discipline' },
            { id: 'growth_mindset', name: 'Growth mindset' }
        ]
    },
    {
        name: 'Social Development',
        indicators: [
            { id: 'collaboration', name: 'Collaboration & leadership' },
            { id: 'respect_diversity', name: 'Respect for diversity' },
            { id: 'communication', name: 'Communication skills' },
            { id: 'conflict_resolution', name: 'Conflict resolution' },
            { id: 'digital_responsibility', name: 'Digital responsibility' }
        ]
    },
    {
        name: 'Emotional Development',
        indicators: [
            { id: 'emotional_awareness', name: 'Emotional awareness & control' },
            { id: 'stress_management', name: 'Stress management' },
            { id: 'confidence', name: 'Confidence' },
            { id: 'resilience', name: 'Resilience' },
            { id: 'empathy', name: 'Empathy' }
        ]
    },
    {
        name: 'Life Skills & Ethical Development',
        indicators: [
            { id: 'critical_thinking', name: 'Critical thinking' },
            { id: 'problem_solving', name: 'Problem-solving' },
            { id: 'ethical_decisions', name: 'Ethical decision-making' },
            { id: 'community_responsibility', name: 'Responsibility towards community' },
            { id: 'environmental_awareness', name: 'Environmental awareness' }
        ]
    }
];

const ratingLevels = [
    { value: 0, label: 'Not Rated', description: '-' },
    { value: 1, label: 'Rarely', description: 'Rarely Demonstrates' },
    { value: 2, label: 'Sometimes', description: 'Sometimes Demonstrates' },
    { value: 3, label: 'Often', description: 'Often Demonstrates' },
    { value: 4, label: 'Consistently', description: 'Consistently Demonstrates' }
];

// DOM elements
const elements = {
    authScreen: document.getElementById('auth-screen'),
    mainApp: document.getElementById('main-app'),
    googleSignin: document.getElementById('google-signin'),
    signoutBtn: document.getElementById('signout-btn'),
    userEmail: document.getElementById('user-email'),
    sectionSelect: document.getElementById('section-select'),
    termSelect: document.getElementById('term-select'),
    loadStudentsBtn: document.getElementById('load-students-btn'),
    saveAllBtn: document.getElementById('save-all-btn'),
    exportBtn: document.getElementById('export-btn'),
    loadingIndicator: document.getElementById('loading-indicator'),
    studentsContainer: document.getElementById('students-container')
};

// Authentication state listener
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        elements.authScreen.classList.add('d-none');
        elements.mainApp.classList.remove('d-none');
        elements.userEmail.textContent = user.email;
        await loadAssignedSections();
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

// Normalize assigned sections from Firestore
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

// Load teacher's assigned sections
async function loadAssignedSections() {
    try {
        const snapshot = await firestore.collection('teacherAssignments')
            .where('teacherEmail', '==', currentUser.email)
            .get();

        if (snapshot.empty) {
            availableSections = [];
            elements.sectionSelect.innerHTML = '<option value="">No sections assigned</option>';
            elements.loadStudentsBtn.disabled = true;
            return;
        }

        availableSections = normalizeAssignedSections(snapshot);
        renderSectionSelect();
    } catch (error) {
        console.error('Error loading sections:', error);
        elements.sectionSelect.innerHTML = '<option value="">Error loading sections</option>';
    }
}

// Render section dropdown
function renderSectionSelect() {
    elements.sectionSelect.innerHTML = availableSections.map(section =>
        `<option value="${section.id}">${section.name}</option>`
    ).join('');

    // Auto-select section from URL parameter
    const urlParams = new URLSearchParams(window.location.search);
    const sectionIdFromUrl = urlParams.get('sectionId');
    if (sectionIdFromUrl && availableSections.find(s => s.id === sectionIdFromUrl)) {
        elements.sectionSelect.value = sectionIdFromUrl;
    }
}

// Load students for selected section
async function loadStudents() {
    const sectionId = elements.sectionSelect.value;
    if (!sectionId) {
        alert('Please select a section');
        return;
    }

    elements.loadingIndicator.classList.remove('d-none');
    elements.studentsContainer.innerHTML = '';
    elements.saveAllBtn.disabled = true;

    try {
        const snapshot = await firestore.collection('students')
            .where('sectionId', '==', sectionId)
            .get();

        if (snapshot.empty) {
            elements.studentsContainer.innerHTML = `
                <div class="alert alert-warning">
                    <i class="bi bi-exclamation-triangle me-2"></i>No students found in this section.
                </div>
            `;
            currentStudents = [];
            return;
        }

        currentStudents = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            psedData: {} // Will hold PSED ratings
        })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        // Load existing PSED data for all students
        await loadExistingPSEDData();

        renderStudentsTable();
        elements.saveAllBtn.disabled = false;
        hasUnsavedChanges = false;
        updateSaveButton();
    } catch (error) {
        console.error('Error loading students:', error);
        elements.studentsContainer.innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-circle me-2"></i>Error loading students. Please try again.
            </div>
        `;
    } finally {
        elements.loadingIndicator.classList.add('d-none');
    }
}

// Load existing PSED data from Firestore
async function loadExistingPSEDData() {
    const term = elements.termSelect.value;

    try {
        // Get all existing PSED records for these students in this term
        const studentIds = currentStudents.map(s => s.id);
        const psedSnapshot = await firestore.collection('psed_records')
            .where('studentId', 'in', studentIds)
            .where('term', '==', term)
            .get();

        psedSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const student = currentStudents.find(s => s.id === data.studentId);
            if (student) {
                student.psedData = data.ratings || {};
                student.psedRecordId = doc.id;
            }
        });
    } catch (error) {
        console.error('Error loading PSED data:', error);
    }
}

// Render students table with PSED indicators
function renderStudentsTable() {
    const term = elements.termSelect.value;
    const termLabel = term === 'term1' ? 'Term 1' : 'Term 2';

    let html = `
        <div class="table-responsive">
            <table class="table table-bordered table-sm psed-table">
                <thead>
                    <tr>
                        <th class="student-header" rowspan="2">Student</th>
                        <th class="student-header" rowspan="2">Roll No</th>
                        <th class="category-header" colspan="20">${termLabel} Ratings</th>
                        <th class="student-header" rowspan="2">Teacher Notes</th>
                    </tr>
                    <tr>
    `;

    // Add indicator headers
    psedCategories.forEach(category => {
        category.indicators.forEach(indicator => {
            html += `<th title="${indicator.name}">${indicator.name.substring(0, 15)}${indicator.name.length > 15 ? '...' : ''}</th>`;
        });
    });

    html += '</tr></thead><tbody>';

    // Add student rows
    currentStudents.forEach((student, index) => {
        html += `<tr data-student-index="${index}">`;
        html += `<td class="student-header">${escapeHtml(student.name || 'Unknown')}</td>`;
        html += `<td>${escapeHtml(student.studentId || student.rollNumber || '-')}</td>`;

        // Add rating selects for each indicator
        psedCategories.forEach(category => {
            category.indicators.forEach(indicator => {
                const currentValue = student.psedData[indicator.id] || 0;
                html += `
                    <td>
                        <select class="form-select form-select-sm term-select rating-select"
                                data-student-index="${index}"
                                data-indicator="${indicator.id}">
                            ${ratingLevels.map(level =>
                                `<option value="${level.value}" ${currentValue === level.value ? 'selected' : ''}>
                                    ${level.label}
                                </option>`
                            ).join('')}
                        </select>
                    </td>
                `;
            });
        });

        // Teacher notes
        const notes = student.psedData.teacherNotes || '';
        html += `
            <td>
                <input type="text" class="form-control form-control-sm"
                       data-student-index="${index}"
                       data-field="teacherNotes"
                       value="${escapeHtml(notes)}"
                       placeholder="Optional notes">
            </td>
        `;

        html += '</tr>';
    });

    html += '</tbody></table></div>';

    // Add category legend
    html += `
        <div class="mt-3">
            <h6 class="fw-bold">Rating Guide:</h6>
            <div class="row g-2">
                ${ratingLevels.slice(1).map(level => `
                    <div class="col-auto">
                        <span class="badge bg-light text-dark border">
                            ${level.label}: ${level.description}
                        </span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    elements.studentsContainer.innerHTML = html;

    // Add event listeners for changes
    document.querySelectorAll('.rating-select, input[data-field="teacherNotes"]').forEach(element => {
        element.addEventListener('change', handleDataChange);
        element.addEventListener('input', handleDataChange);
    });
}

// Handle data change
function handleDataChange(event) {
    const element = event.target;
    const studentIndex = parseInt(element.dataset.studentIndex);
    const student = currentStudents[studentIndex];

    if (element.classList.contains('rating-select')) {
        const indicatorId = element.dataset.indicator;
        const value = parseInt(element.value);
        student.psedData[indicatorId] = value;
    } else if (element.dataset.field === 'teacherNotes') {
        student.psedData.teacherNotes = element.value;
    }

    hasUnsavedChanges = true;
    updateSaveButton();
}

// Update save button state
function updateSaveButton() {
    const btn = elements.saveAllBtn;
    if (hasUnsavedChanges) {
        btn.innerHTML = '<i class="bi bi-save me-1"></i>Save All Changes*';
        btn.classList.add('btn-warning');
        btn.classList.remove('save-btn');
    } else {
        btn.innerHTML = '<i class="bi bi-save me-1"></i>Save All Changes';
        btn.classList.remove('btn-warning');
        btn.classList.add('save-btn');
    }
}

// Save all PSED data to Firestore
async function saveAllChanges() {
    if (!hasUnsavedChanges) return;

    const btn = elements.saveAllBtn;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Saving...';

    const term = elements.termSelect.value;
    const sectionId = elements.sectionSelect.value;
    const timestamp = new Date();
    let successCount = 0;
    let errorCount = 0;

    try {
        const batch = firestore.batch();
        const psedCollection = firestore.collection('psed_records');

        for (const student of currentStudents) {
            const recordData = {
                studentId: student.id,
                studentName: student.name,
                sectionId: sectionId,
                term: term,
                ratings: student.psedData,
                updatedAt: timestamp,
                updatedBy: currentUser.email
            };

            if (student.psedRecordId) {
                // Update existing record
                const docRef = psedCollection.doc(student.psedRecordId);
                batch.update(docRef, recordData);
            } else {
                // Create new record
                const newDocRef = psedCollection.doc();
                batch.set(newDocRef, {
                    ...recordData,
                    createdAt: timestamp,
                    createdBy: currentUser.email
                });
                student.psedRecordId = newDocRef.id;
            }
            successCount++;
        }

        await batch.commit();

        hasUnsavedChanges = false;
        updateSaveButton();
        alert(`Successfully saved PSED data for ${successCount} students!`);
    } catch (error) {
        console.error('Error saving PSED data:', error);
        alert('Error saving changes. Please try again.');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Export data to CSV
function exportToCSV() {
    if (currentStudents.length === 0) {
        alert('No data to export');
        return;
    }

    const term = elements.termSelect.value;
    const sectionName = availableSections.find(s => s.id === elements.sectionSelect.value)?.name || '';

    // CSV Header
    let csv = 'Student Name,Roll Number,Section,';
    psedCategories.forEach(category => {
        category.indicators.forEach(indicator => {
            csv += `${indicator.name} (${term}),`;
        });
    });
    csv += 'Teacher Notes\n';

    // CSV Data
    currentStudents.forEach(student => {
        csv += `"${student.name || ''}","${student.studentId || student.rollNumber || ''}","${sectionName}",`;

        psedCategories.forEach(category => {
            category.indicators.forEach(indicator => {
                const value = student.psedData[indicator.id] || 0;
                const label = ratingLevels.find(l => l.value === value)?.label || 'Not Rated';
                csv += `"${label}",`;
            });
        });

        const notes = student.psedData.teacherNotes || '';
        csv += `"${notes}"\n`;
    });

    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PSED_${sectionName}_${term}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
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

// Event listeners
elements.loadStudentsBtn.onclick = loadStudents;
elements.saveAllBtn.onclick = saveAllChanges;
elements.exportBtn.onclick = exportToCSV;

// Term change - reload data
elements.termSelect.onchange = () => {
    if (currentStudents.length > 0) {
        if (hasUnsavedChanges) {
            if (!confirm('You have unsaved changes. Changing terms will discard them. Continue?')) {
                // Revert to previous value
                elements.termSelect.value = elements.termSelect.dataset.previousValue || 'term1';
                return;
            }
        }
        elements.termSelect.dataset.previousValue = elements.termSelect.value;
        loadStudents();
    }
};

// Section change - reload data
elements.sectionSelect.onchange = () => {
    if (currentStudents.length > 0) {
        if (hasUnsavedChanges) {
            if (!confirm('You have unsaved changes. Changing sections will discard them. Continue?')) {
                // Revert selection
                elements.sectionSelect.value = elements.sectionSelect.dataset.previousValue || '';
                return;
            }
        }
        elements.sectionSelect.dataset.previousValue = elements.sectionSelect.value;
        currentStudents = [];
        elements.studentsContainer.innerHTML = `
            <div class="alert alert-info">
                <i class="bi bi-info-circle me-2"></i>Click "Load Students" to load students from the new section.
            </div>
        `;
        elements.saveAllBtn.disabled = true;
        hasUnsavedChanges = false;
        updateSaveButton();
    }
};

// Warn before leaving with unsaved changes
window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
    }
});
