# Firestore Schema

This document describes the Firestore collections and fields used by this app. Firestore is schemaless, so the structures below are the app contract inferred from the current JavaScript code, not a hard database-enforced schema.

## Top-Level Collections

| Collection | Purpose |
| --- | --- |
| `teacherAssignments` | Maps signed-in teachers to accessible sections. |
| `schools` | School master records, sections, teachers, and teacher calendar events. |
| `sections` | Section/class display metadata. |
| `students` | Student master records. |
| `questionpapers` | Question paper templates and answer keys. |
| `tests` | Test instances assigned to sections and question papers. |
| `results` | Student test result rows, per-question answers, calculated marks, rank, and subject stats. |
| `resultEditAuditLogs` | Audit trail for test edits, answer-key edits, student answer edits, and bubble imports. |
| `timetables` | School timetable data by academic year. |
| `psed_records` | PSED term ratings by student. |

## `teacherAssignments/{assignmentId}`

Teacher access records used after authentication.

| Field | Type | Notes |
| --- | --- | --- |
| `teacherEmail` | string | Queried with `where("teacherEmail", "==", currentUser.email)`. |
| `sectionIds` | string[] | Preferred multi-section assignment. |
| `sectionNames` | string[] | Optional names parallel to `sectionIds`. |
| `sectionId` | string | Legacy/single-section assignment fallback. |
| `sectionName` | string | Legacy/single-section display name fallback. |
| `schoolId` | string | Optional school id for timetable/event context. |
| `teacherName` | string | Optional display name fallback. |

## `schools/{schoolId}`

School master data. The timetable tool reads all school docs for the school selector.

| Field | Type | Notes |
| --- | --- | --- |
| `schoolName` | string | Display name for timetable school selector. |
| `sections` | array<object> | Fallback section source. Objects may contain `sectionId`, `sectionName`, or `name`. |

### `schools/{schoolId}/teachers/{teacherDocId}`

Teacher master records used to discover the signed-in teacher's school and timetable identity.

| Field | Type | Notes |
| --- | --- | --- |
| `email` | string | Queried with `where("email", "==", currentUser.email)`. |
| `name` | string | Teacher display name. |
| `teacherName` | string | Legacy display name fallback. |
| `teacherCode` | string | Preferred timetable teacher id. |
| `teacherId` | string | Teacher id fallback. |

### `schools/{schoolId}/classSections/{classSectionDocId}`

Section records discovered from each school.

| Field | Type | Notes |
| --- | --- | --- |
| `schoolSectionId` | string | Links to `sections/{sectionId}`. |

### `schools/{schoolId}/teacherEvents/{eventId}`

Teacher calendar/event records, filtered by `teacherEmail`.

Common fields:

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string | Built from event type and subjects. |
| `eventType` | string | Known values include `test`, `revision`, `theory`, `practical`. |
| `date` | string | Date selected in UI. |
| `period` | string | Period selected in UI. |
| `description` | string | Optional notes. |
| `psedTags` | array | Selected PSED indicators. |
| `customTags` | string[] | Comma-separated UI input saved as array. |
| `teacherEmail` | string | Signed-in teacher email. |
| `teacherName` | string | Teacher display name. |
| `schoolId` | string | Owning school id. |
| `classes` | string | Event class text. |
| `subjects` | string | Event subject text. |
| `chapters` | string | Event chapter text. |
| `topics` | string | Event topic text. |
| `subtopics` | string | Event subtopic text. |
| `groupActivity` | string | Optional group activity notes. |
| `isGroupActivity` | boolean | Group activity flag. |
| `createdAt` | Date | Set when created. |
| `updatedAt` | Date | Set on create/update. |

For `eventType = "test"`:

| Field | Type |
| --- | --- |
| `frequency` | string |
| `testMode` | string |
| `category` | string |
| `testSyllabus` | string |
| `gradeExpectations` | string |

For `eventType = "revision"`:

| Field | Type |
| --- | --- |
| `revisionGroupType` | string |
| `revisionLocation` | string |
| `revisionSyllabus` | string |
| `testRelation` | string |
| `revisionGradeExpect` | string |

## `sections/{sectionId}`

Section display metadata. The app uses several fallback names.

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | Preferred display name. |
| `sectionName` | string | Fallback display name. |
| `className` | string | Fallback display name. |
| `classSectionName` | string | Fallback display name. |
| `title` | string | Fallback display name. |
| `displayName` | string | Fallback display name. |

## `students/{studentId}`

Student master record.

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | Student name. |
| `studentId` | string | Optional external/student id. The document id is also treated as a student id. |
| `sectionId` | string | Queried with `where("sectionId", "==", sectionId)`. |
| `phone` | string | Used for WhatsApp report sharing. |
| `rollNo` | string/number | Preferred roll number field. |
| `rollNumber` | string/number | Roll number fallback. |
| `roll` | string/number | Roll number fallback. |
| `admissionNo` | string/number | Roll/admission fallback. |

Roll matching normalizes leading zeros during bubble CSV import, so roll `01` and `1` refer to the same student.

## `questionpapers/{questionPaperDocId}`

Question paper templates and answer keys. The app first tries `where("questionPaperID", "==", questionPaperID)` and then falls back to direct document id lookup.

| Field | Type | Notes |
| --- | --- | --- |
| `questionPaperID` | string | External/stable id used by `tests.questionPaperID`. |
| `templateName` | string | Display label fallback. |
| `testName` | string | Display label fallback. |
| `name` | string | Display label fallback. |
| `title` | string | Display label fallback. |
| `questions` | array<object> | Question list. |

### Question Object

| Field | Type | Notes |
| --- | --- | --- |
| `subjectname_questionnumber` | string | Optional source key, for example `Physics_Q1`. |
| `questionNumber` | number/string | Question number fallback. |
| `Subject` | string | Preferred subject source. |
| `subject` | string | Subject fallback. |
| `section` | string | Subject fallback. |
| `subjectName` | string | Subject fallback. |
| `Chapter` / `chapter` | string | Chapter metadata. |
| `Topic` / `topic` | string | Topic metadata. |
| `Subtopic` / `subtopic` | string | Subtopic metadata. |
| `Question` / `question` / `questionText` | string | Question text. |
| `Option 1` ... `Option 4` | string/object | Option text. Object options may include `optionText`, `text`, `label`, `value`, and `correct`. |
| `Correct Option` | number/string | Single or comma-separated correct option numbers/letters. |
| `Correct Options` | array/string | Multiple correct option numbers/letters. |
| `Answer` | string | Correct answer text fallback. |
| `CorrectAnswer` | string | Correct answer fallback. |
| `correctAnswer` | string | Correct answer fallback. |
| `feedbackCorrectAnswer` | string | Explanation fallback. |
| `feedback` | string | Explanation fallback. |
| `explanation` | string | Explanation fallback. |
| `solution` | string | Explanation fallback. |

When a teacher edits an answer key, the app updates:

| Field | Type | Notes |
| --- | --- | --- |
| `Correct Option` | number/string | Number for single correct answer, comma-separated numbers for multiple. |
| `Correct Options` | number[] | Sorted selected option numbers. |
| `CorrectAnswer` | string | Uppercase letters, for example `A` or `ABC`. |
| `correctAnswer` | string | Lowercase letters, for example `a` or `abc`. |
| `Answer` | string | Selected option texts joined with ` | ` when available. |
| `Option N.correct` | boolean | Updated when the option value is an object. |

## `tests/{testId}`

Test instances shown as cards on the home page.

| Field | Type | Notes |
| --- | --- | --- |
| `testName` | string | Test display name. |
| `testDate` | string | ISO date string, for example `2026-08-04`. |
| `sectionId` | string | Assigned section id. |
| `sectionName` | string | Section display name snapshot. |
| `questionPaperID` | string | Links to `questionpapers.questionPaperID` or a question paper doc id. |
| `class` | string | Optional class metadata. |
| `templateName` | string | Optional template metadata. |
| `year` | string | Optional year metadata. |
| `description` | string | Optional description. |
| `questions` | array<object> | Optional embedded question list fallback. |
| `createdAt` | timestamp | Set on app-created tests. |
| `createdBy` | string | Creator email. |
| `updatedAt` | timestamp | Set on edit. |
| `updatedBy` | string | Last editor email. |

Test create/edit audit entries are saved to `resultEditAuditLogs`.

## `results/{resultId}`

Student result documents. Existing code commonly uses the id format:

```text
{testId}_{studentId}
```

Results are queried by `testId`, and sometimes by both `testId` and `studentId`.

### Identity and Test Fields

| Field | Type | Notes |
| --- | --- | --- |
| `testId` | string | Test id. |
| `studentId` | string | Student id; usually links to `students/{studentId}`. |
| `name` | string | Student name snapshot. |
| `phone` | string | Student phone snapshot. |
| `sectionId` | string | Section id. |
| `testName` | string | Test name snapshot. |
| `rollNo` | string/number | Preferred roll snapshot. |
| `rollNumber` | string/number | Roll fallback. |
| `roll` | string/number | Roll fallback. |

### Dynamic Per-Question Answer Fields

The app stores one field per question directly on the result document. Preferred field name:

```text
{Subject}_Q{questionNumber}
```

Examples:

```text
Physics_Q1: "r_a"
Mathematics_Q12: "bd"
Generic_Q4: "s"
```

Read fallbacks include:

| Pattern | Notes |
| --- | --- |
| `{subjectname_questionnumber}` normalized to `_Qn` | From question paper source keys. |
| `{Subject}_Q{questionNumber}` | Preferred. |
| `{Subject}_{questionNumber}` | Legacy fallback. |
| `Generic_Q{questionNumber}` | Generic subject fallback. |
| `Q{questionNumber}` | Legacy fallback. |

Status value conventions:

| Value | Meaning |
| --- | --- |
| `s` | Skipped. |
| `r` | Correct, legacy value without selected option suffix. |
| `r_a`, `r_ab`, `r_abc` | Correct with selected option letters. |
| `a`, `b`, `ab`, `bd`, etc. | Wrong selected option letters. |

Values are normalized lowercase for comparison. Correct status is detected by the pattern `r` or `r_` followed by letters/numbers.

### Calculated Summary Fields

These fields are recalculated and saved after answer-key edits, student-answer edits, and bubble CSV imports.

| Field | Type | Notes |
| --- | --- | --- |
| `correct` | number | Count of correct answers. |
| `wrong` | number | Count of wrong answers. |
| `skipped` | number | Count of skipped answers. |
| `total` | number | Total counted questions. |
| `percent` | number | Rounded percentage marks. |
| `marks` | number | Percentage marks, not rounded before storage. |
| `earnedMarks` | number | Score using current scoring rules. |
| `maxMarks` | number | Maximum possible score. |
| `grade` | string | Grade from app grade scale. |
| `gradePoint` | number | Grade point from app grade scale. |
| `gpa` | number | Same value as `gradePoint`. |
| `passed` | boolean | Pass/fail from app grade scale. |
| `rank` | number | Rank within the loaded result set. |
| `percentile` | number | Calculated as `((totalStudents - rank + 1) / totalStudents) * 100`. |
| `scoringRules` | object | `{ correct, wrong, skipped }`. |
| `subjectStats` | array<object> | Subject-level calculated stats. |
| `recalculatedAt` | timestamp | Server timestamp. |

### `subjectStats[]`

Each subject stat object contains:

| Field | Type |
| --- | --- |
| `subject` | string |
| `correct` | number |
| `wrong` | number |
| `skipped` | number |
| `total` | number |
| `earnedMarks` | number |
| `maxMarks` | number |
| `marks` | number |
| `grade` | string |
| `gradePoint` | number |
| `passed` | boolean |

### Result Edit Metadata

| Field | Type | Notes |
| --- | --- | --- |
| `updatedAt` | timestamp | Set by bubble import writes. |
| `importedAt` | timestamp | Set when imported from bubble CSV. |
| `importedBy` | string | Teacher email for bubble CSV import. |
| `answerUpdatedAt` | timestamp | Set when a teacher edits one student answer. |
| `answerUpdatedBy` | string | Teacher email for student-answer edits. |

## `resultEditAuditLogs/{logId}`

Audit log collection for teacher changes. Newest entries are shown first in `audit-log.html`.

### Common Fields

| Field | Type | Notes |
| --- | --- | --- |
| `actionType` | string | Known values: `test_create`, `test_edit`, `answer_key_edit`, `student_answer_edit`, `student_bubbles_import`. |
| `scope` | string | Usually `test`; answer-key/student edits may omit this. |
| `teacherUid` | string | Firebase auth uid. |
| `teacherEmail` | string | Firebase auth email. |
| `testId` | string | Affected test. |
| `testName` | string | Test name snapshot. |
| `sectionId` | string | Affected section. |
| `createdAt` | timestamp | Server timestamp. |

### `test_create` / `test_edit`

| Field | Type | Notes |
| --- | --- | --- |
| `before` | object | `{ testName, testDate, sectionId, sectionName, questionPaperID }`. |
| `after` | object | Same shape as `before`. |
| `changedFields` | string[] | Field names changed. |

### `answer_key_edit`

| Field | Type | Notes |
| --- | --- | --- |
| `questionNumber` | number | Affected question number. |
| `subject` | string | Question subject. |
| `chapter` | string | Question chapter. |
| `topic` | string | Question topic. |
| `subtopic` | string | Question subtopic. |
| `questionText` | string | Plain text snapshot, truncated to 500 chars. |
| `before` | object | `{ correctOptions, correctLetters, labels }`. |
| `after` | object | `{ correctOptions, correctLetters, labels }`. |
| `affectedResultCount` | number | Number of result docs recalculated. |
| `scoringRules` | object | Scoring rules active during recalculation. |

### `student_answer_edit`

| Field | Type | Notes |
| --- | --- | --- |
| `questionNumber` | number | Affected question number. |
| `subject` | string | Question subject. |
| `chapter` | string | Question chapter. |
| `topic` | string | Question topic. |
| `subtopic` | string | Question subtopic. |
| `questionText` | string | Plain text snapshot, truncated to 500 chars. |
| `resultId` | string | Affected `results` doc id. |
| `studentId` | string | Affected student id. |
| `studentName` | string | Student display name snapshot. |
| `roll` | string | Roll number snapshot. |
| `statusKey` | string | Dynamic result field updated, for example `Physics_Q1`. |
| `before` | object | `{ status, selectedOptions, selectedLetters }`. |
| `after` | object | `{ status, selectedOptions, selectedLetters }`. |
| `correctOptions` | number[] | Correct option numbers at edit time. |
| `correctLetters` | string[] | Correct option letters at edit time. |
| `scoringRules` | object | Scoring rules active during recalculation. |

### `student_bubbles_import`

| Field | Type | Notes |
| --- | --- | --- |
| `importedRows` | number | Count of imported CSV rows matched to students. |
| `unmatchedRolls` | string[] | CSV roll numbers without a matching student. |
| `absentees` | array<object> | Students in the section missing from the CSV. |
| `questionCount` | number | Number of question columns imported. |
| `fileName` | string | Uploaded CSV file name. |

`absentees[]` objects contain:

| Field | Type |
| --- | --- |
| `id` | string |
| `studentId` | string |
| `name` | string |
| `roll` | string |

## `timetables/{schoolId}/years/{academicYear}`

School timetable data saved by the timetable tool.

| Field | Type | Notes |
| --- | --- | --- |
| `timetableData` | object | Timetable by class/day/period. |
| `holidays` | array<object> | Holiday list. |
| `periodTimes` | object | Period time definitions. |
| `teacherSubjectMap` | object | Teacher-subject mapping metadata used by timetable UI. |
| `currentYear` | string | Current display year. |
| `schoolId` | string | Owning school id. |
| `academicYear` | string | Academic year doc id/value. |
| `copiedFrom` | string | Source year when copied. |
| `updatedAt` | timestamp | Server timestamp. |
| `updatedBy` | string | User email. |

### Timetable Period Shape

`timetableData` is nested, but period objects are expected to include:

| Field | Type | Notes |
| --- | --- | --- |
| `subject` | string | Subject/code. |
| `teacherName` | string | Teacher display name. |
| `teacherId` | string | Teacher code/id. |
| `room` | string | Optional room/location. |

The app also handles class/day containers such as:

```text
timetableData[className].days[].dayName
timetableData[className].days[].periods[]
```

## `psed_records/{recordId}`

PSED term ratings by student.

| Field | Type | Notes |
| --- | --- | --- |
| `studentId` | string | Queried with `where("studentId", "in", studentIds)`. |
| `studentName` | string | Student name snapshot. |
| `sectionId` | string | Section id. |
| `term` | string | Known values include `term1`, `term2`. |
| `ratings` | object | Rating values by PSED indicator id, plus optional `teacherNotes`. |
| `updatedAt` | Date | Set on save. |
| `updatedBy` | string | Teacher email. |
| `createdAt` | Date | Set on create. |
| `createdBy` | string | Teacher email. |

Known PSED indicator keys:

| Category | Keys |
| --- | --- |
| Personal Growth | `self_awareness`, `goal_setting`, `decision_making`, `self_discipline`, `growth_mindset` |
| Social Skills | `collaboration`, `respect_diversity`, `communication`, `conflict_resolution`, `digital_responsibility` |
| Emotional Wellbeing | `emotional_awareness`, `stress_management`, `confidence`, `resilience`, `empathy` |
| Responsible Citizenship | `critical_thinking`, `problem_solving`, `ethical_decisions`, `community_responsibility`, `environmental_awareness` |

## Common Query Patterns

| Collection | Query |
| --- | --- |
| `teacherAssignments` | `where("teacherEmail", "==", email)` |
| `schools/{schoolId}/teachers` | `where("email", "==", email)` |
| `students` | `where("sectionId", "==", sectionId)` |
| `questionpapers` | `where("questionPaperID", "==", questionPaperID).limit(1)` |
| `results` | `where("testId", "==", testId)` |
| `results` | `where("testId", "==", testId).where("studentId", "==", studentId)` |
| `psed_records` | `where("studentId", "in", studentIds).where("term", "==", term)` |
| `schools/{schoolId}/teacherEvents` | `where("teacherEmail", "==", email)` |

Composite Firestore indexes may be required for multi-field queries, depending on project index configuration.
