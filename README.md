# Teacher Dashboard

## Overview
Web application for teachers to view student test results and share reports via WhatsApp.

## Features
- Google Sign-In authentication
- Automatically loads teacher's assigned section
- View all tests for the section
- See student results for each test
- View detailed student reports (question-by-question)
- Share individual student reports via WhatsApp
- Color-coded results (green=correct, red=wrong)

## Setup
1. Open `index.html` in a web browser
2. Sign in with Google (must use email assigned by school admin)
3. View tests and student results
4. Click "View Report" to see detailed results
5. Click WhatsApp button to share report with student

## Firebase Collections Used
- `teacherAssignments` - Gets teacher's section assignment
- `tests` - Loads tests filtered by sectionId
- `results` - Student test results (Q1, Q2, Q3... with "R" for correct)
- `students` - Student information including phone numbers

## Data Structure
```javascript
// results collection
{
  studentId: "6913169058b48a6faafae246",
  testId: "692ea97189dd07363f2fef38",
  Q1: "R",  // R = correct answer
  Q2: "2",  // number = wrong answer (option selected)
  Q3: "R",
  // ... more questions
}
```

## Report Page
- `report.html` - Standalone page showing detailed test results
- URL format: `report.html?testId=XXX&studentId=YYY`
- Shows all questions with student answers vs correct answers
- Can be printed or shared

## Code Obfuscation

### Current State
Both `app.js` and `report.js` are currently **manually obfuscated** using:
- Shortened variable names (`_0x`, `_cfg`, `_db`, `_el`, `_x`, `_c`, etc.)
- String array obfuscation for Firebase configuration
- Minified single-line functions
- Compact code structure

### Unobfuscated Symbol (Development Reference)

**app.js symbols:**
- `_0x` → `firebaseConfigParts` - String array containing Firebase config parts
- `_cfg` → `firebaseConfig` - Firebase configuration object
- `_db` → `db` or `firestore` - Firestore database instance
- `_auth` → `auth` - Firebase authentication instance
- `_user` → `currentUser` - Current authenticated user object
- `_secId` → `sectionId` - Current teacher's assigned section ID
- `_secName` → `sectionName` - Current teacher's assigned section name
- `_el` → `elements` - DOM elements object (auth, main, signin, signout, email, secName, tests, refresh)
- `_init()` → `initializeApp()` - Initialize app (get section and load tests)
- `_getSec()` → `getTeacherSection()` - Get teacher's assigned section from Firestore
- `_loadTests()` → `loadTests()` - Load all tests for the teacher's section
- `_getRC(tid)` → `getResultCount(testId)` - Get result count for a test
- `_viewRes(tid, tname)` → `viewStudentResults(testId, testName)` - View student results modal
- `_getStud()` → `getStudents()` - Get all students in the teacher's section
- `_calcScore(r)` → `calculateScore(result)` - Calculate percentage score from result object

**report.js symbols:**
- `_0x` → `firebaseConfigParts` - String array containing Firebase config parts
- `_c` → `firebaseConfig` - Firebase configuration object
- `_d` → `db` or `firestore` - Firestore database instance
- `_t` → `testId` - Test ID from URL parameter
- `_s` → `studentId` - Student ID from URL parameter
- `_e` → `elements` - DOM elements object
- `_l()` → `loadReport()` - Load and display report data
- `_g(c, f)` → `getDocument(collection, field)` - Get document from collection

