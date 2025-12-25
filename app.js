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

// DOM elements
const elements = {
    authScreen: document.getElementById('auth-screen'),
    mainApp: document.getElementById('main-app'),
    googleSignin: document.getElementById('google-signin'),
    signoutBtn: document.getElementById('signout-btn'),
    userEmail: document.getElementById('user-email'),
    sectionName: document.getElementById('section-name'),
    testsContainer: document.getElementById('tests-container'),
    refreshTests: document.getElementById('refresh-tests')
};

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
    await getAssignedSection();
    if (currentSectionId) {
        await loadTests();
    }
}

// Get teacher's assigned section
async function getAssignedSection() {
    try {
        const snapshot = await firestore.collection('teacherAssignments')
            .where('teacherEmail', '==', currentUser.email)
            .limit(1)
            .get();
        
        if (snapshot.empty) {
            elements.sectionName.textContent = 'No section assigned';
            elements.testsContainer.innerHTML = '<div class="p-4 text-center text-muted">You are not assigned to any section yet. Contact your school admin.</div>';
            return;
        }

        const assignment = snapshot.docs[0].data();
        currentSectionId = assignment.sectionId;
        currentSectionName = assignment.sectionName || currentSectionId;
        elements.sectionName.textContent = currentSectionName;
    } catch (error) {
        console.error('Get section:', error);
        elements.sectionName.textContent = 'Error loading section';
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
                    <button class="btn" style="background:#16a085;color:white;border:none" 
                            onclick="viewStudentResults('${doc.id}', '${test.testName || 'Test'}')">
                        <i class="bi bi-eye me-2"></i>View Student Results
                    </button>
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

// View student results for a test
window.viewStudentResults = async (testId, testName) => {
    const modal = new bootstrap.Modal(document.getElementById('studentsModal'));
    const studentsList = document.getElementById('students-list');
    
    studentsList.innerHTML = '<div class="text-center py-4"><div class="spinner-border" style="color:#16a085"></div></div>';
    modal.show();
    
    try {
        const snapshot = await firestore.collection('results')
            .where('testId', '==', testId)
            .get();
        
        if (snapshot.empty) {
            studentsList.innerHTML = '<div class="text-center text-muted py-4">No student results yet</div>';
            return;
        }

        const students = await getStudents();
        let html = '';
        
        for (const doc of snapshot.docs) {
            const result = doc.data();
            const student = students.find(s => s.id === result.studentId);
            const studentName = student ? student.name : 'Unknown';
            const studentPhone = student ? student.phone : '';
            const score = calculateScore(result);
            
            html += `
                <div class="student-card">
                    <div>
                        <h6 class="mb-1">${studentName}</h6>
                        <small class="text-muted">${result.studentId}</small>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <span class="result-badge ${score >= 70 ? 'correct' : 'wrong'}">${score}%</span>
                        <a href="report.html?testId=${testId}&studentId=${result.studentId}" 
                           target="_blank" 
                           class="btn btn-sm" 
                           style="background:#2c3e50;color:white;border:none">
                            <i class="bi bi-file-text"></i> View Report
                        </a>
                        ${studentPhone ? `
                            <a href="https://wa.me/${studentPhone.replace(/\D/g, '')}?text=Hi%20${encodeURIComponent(studentName)},%20your%20test%20report:%20${window.location.origin}/report.html?testId=${testId}&studentId=${result.studentId}" 
                               target="_blank" 
                               class="btn btn-sm" 
                               style="background:#25D366;color:white;border:none">
                                <i class="bi bi-whatsapp"></i> Share
                            </a>
                        ` : ''}
                    </div>
                </div>
            `;
        }
        
        studentsList.innerHTML = html;
    } catch (error) {
        console.error('View results:', error);
        studentsList.innerHTML = '<div class="text-center text-danger py-4">Error loading results</div>';
    }
};

// Get students in the section
async function getStudents() {
    try {
        const snapshot = await firestore.collection('students')
            .where('sectionId', '==', currentSectionId)
            .get();
        
        return snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
    } catch (error) {
        return [];
    }
}

// Calculate score from result data
function calculateScore(result) {
    let correct = 0;
    let total = 0;
    
    for (let key in result) {
        if (key.startsWith('Q')) {
            total++;
            if (result[key] === 'R') {
                correct++;
            }
        }
    }
    
    return total > 0 ? Math.round((correct / total) * 100) : 0;
}

// Refresh tests
elements.refreshTests.onclick = () => loadTests();
