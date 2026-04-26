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
        const firestore = firebase.firestore();
        const auth = firebase.auth();

        // Application state
        const state = {
            timetableData: null,
            holidays: [],
            currentView: 'class',
            selectedPeriods: [],
            rescheduleMode: false,
            currentYear: '2026',
            periodTimes: {},
            fileType: 'excel',
            excelFormat: 'legacy',
            overlapCheckInProgress: false,
            teacherSubjectMap: {}
        };

        let currentUser = null;
        
        // Sample data for demonstration
        const sampleHolidays = [
            { id: 1, name: "New Year's Day", date: "2026-01-01", type: "public", description: "Celebration of the new year" },
            { id: 2, name: "Republic Day", date: "2026-01-26", type: "public", description: "Celebration of the adoption of the Constitution" },
            { id: 3, name: "Summer Break", date: "2026-05-15", type: "school", description: "Summer vacation for students" },
            { id: 4, name: "Independence Day", date: "2026-08-15", type: "public", description: "Celebration of India's independence" },
            { id: 5, name: "Diwali", date: "2026-10-29", type: "optional", description: "Festival of lights" },
            { id: 6, name: "Christmas", date: "2026-12-25", type: "public", description: "Celebration of Christmas" }
        ];
        
        // Initialize the application
        document.addEventListener('DOMContentLoaded', function() {
            // Check auth state and initialize
            auth.onAuthStateChanged(async (user) => {
                if (user) {
                    currentUser = user;
                    // Display user email
                    const userEmailEl = document.getElementById('user-email');
                    if (userEmailEl) userEmailEl.textContent = user.email;
                    await initAppWithSync();
                } else {
                    // Not authenticated, load from localStorage only
                    loadFromLocalStorage();
                    updateSyncStatus('local-only', 'Not authenticated');
                    initUI();
                }
            });
        });

        // Initialize app with Firestore sync
        async function initAppWithSync() {
            // Load schools for navbar
            await loadNavSchools();
            
            const hasLocalTimetable = !!localStorage.getItem('schoolTimetable');
            const hasLocalHolidays = !!localStorage.getItem('schoolHolidays');
            const selectedSchool = localStorage.getItem('selectedSchool');
            const selectedYear = localStorage.getItem('selectedAcademicYear');
            
            if (!selectedSchool || !selectedYear) {
                loadFromLocalStorage();
                updateSyncStatus('local-only', 'Select school and year');
                showPushButton();
                setupTabs();
                setupEventListeners();
                initUI();
                return;
            }
            
            // Try to load from Firestore first
            const firestoreData = await loadFromFirestore();
            
            if (firestoreData) {
                // Firestore has data - use it and save to localStorage
                state.timetableData = firestoreData.timetableData;
                state.holidays = firestoreData.holidays || sampleHolidays;
                state.periodTimes = firestoreData.periodTimes || {};
                state.teacherSubjectMap = firestoreData.teacherSubjectMap || {};
                state.currentYear = firestoreData.currentYear || '2026';
                
                // Save to localStorage
                saveTimetableToStorage();
                saveHolidaysToStorage();
                savePeriodTimesToStorage();
                saveTeacherSubjectMapToStorage();
                localStorage.setItem('currentYear', state.currentYear);
                
                updateSyncStatus('synced', `${selectedSchool} | ${selectedYear}`);
            } else if (hasLocalTimetable) {
                // No Firestore data but localStorage has data
                loadFromLocalStorage();
                updateSyncStatus('local-only', 'Local only - Push to sync');
                showPushButton();
            } else {
                // No data anywhere - use defaults
                state.holidays = sampleHolidays;
                saveHolidaysToStorage();
                loadFromLocalStorage();
                updateSyncStatus('local-only', 'No data - Upload timetable');
            }
            
            // Set up UI
            setupTabs();
            setupEventListeners();
            initUI();
        }

        // Load schools for navbar dropdown
        async function loadNavSchools() {
            try {
                const snapshot = await firestore.collection('schools').get();
                const schoolSelect = document.getElementById('nav-school-select');
                const yearSelect = document.getElementById('nav-year-select');
                
                let optionsHtml = '<option value="">Select School</option>';
                snapshot.docs.forEach(doc => {
                    const schoolData = doc.data();
                    const schoolName = schoolData.schoolName || doc.id;
                    optionsHtml += `<option value="${doc.id}">${schoolName}</option>`;
                });
                
                schoolSelect.innerHTML = optionsHtml;
                
                // Restore selections from localStorage
                const savedSchool = localStorage.getItem('selectedSchool');
                const savedYear = localStorage.getItem('selectedAcademicYear');
                if (savedSchool) schoolSelect.value = savedSchool;
                if (savedYear) yearSelect.value = savedYear;
                
                // Save school selection on change and reload
                schoolSelect.addEventListener('change', async function() {
                    localStorage.setItem('selectedSchool', this.value);
                    await reloadForSchoolAndYear();
                });
                
                // Save year selection on change and reload
                yearSelect.addEventListener('change', async function() {
                    localStorage.setItem('selectedAcademicYear', this.value);
                    await reloadForSchoolAndYear();
                });
            } catch (error) {
                console.error('Load schools for nav:', error);
            }
        }

        // Reload data when school or year changes
        async function reloadForSchoolAndYear() {
            const selectedSchool = localStorage.getItem('selectedSchool');
            const selectedYear = localStorage.getItem('selectedAcademicYear');
            
            if (!selectedSchool || !selectedYear) {
                updateSyncStatus('local-only', 'Select school and year');
                return;
            }
            
            updateSyncStatus('syncing', 'Loading...');
            const firestoreData = await loadFromFirestore();
            
            if (firestoreData) {
                state.timetableData = firestoreData.timetableData;
                state.holidays = firestoreData.holidays || sampleHolidays;
                state.periodTimes = firestoreData.periodTimes || {};
                state.teacherSubjectMap = firestoreData.teacherSubjectMap || {};
                state.currentYear = firestoreData.currentYear || '2026';
                
                saveTimetableToStorage();
                saveHolidaysToStorage();
                savePeriodTimesToStorage();
                saveTeacherSubjectMapToStorage();
                localStorage.setItem('currentYear', state.currentYear);
                
                updateSyncStatus('synced', `${selectedSchool} | ${selectedYear}`);
                hidePushButton();
            } else {
                loadFromLocalStorage();
                updateSyncStatus('local-only', 'Local only - Push to sync');
                showPushButton();
            }
            
            initUI();
        }

        // Load data from Firestore
        async function loadFromFirestore() {
            const selectedSchool = localStorage.getItem('selectedSchool');
            const selectedYear = localStorage.getItem('selectedAcademicYear');
            if (!selectedSchool || !selectedYear) return null;
            
            try {
                const doc = await firestore.collection('timetables')
                    .doc(selectedSchool)
                    .collection('years')
                    .doc(selectedYear)
                    .get();
                if (doc.exists) {
                    return doc.data();
                }
                return null;
            } catch (error) {
                console.error('Error loading from Firestore:', error);
                return null;
            }
        }

        // Push data to Firestore
        async function pushToFirestore() {
            if (!currentUser) {
                alert('Please sign in first');
                return;
            }

            const selectedSchool = localStorage.getItem('selectedSchool');
            const selectedYear = localStorage.getItem('selectedAcademicYear');
            
            if (!selectedSchool || !selectedYear) {
                alert('Please select a school and academic year first');
                return;
            }

            updateSyncStatus('syncing', 'Pushing...');

            try {
                const dataToPush = {
                    timetableData: state.timetableData,
                    holidays: state.holidays,
                    periodTimes: state.periodTimes,
                    teacherSubjectMap: state.teacherSubjectMap,
                    currentYear: state.currentYear,
                    schoolId: selectedSchool,
                    academicYear: selectedYear,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    updatedBy: currentUser.email
                };

                await firestore.collection('timetables')
                    .doc(selectedSchool)
                    .collection('years')
                    .doc(selectedYear)
                    .set(dataToPush);
                
                updateSyncStatus('synced', `${selectedSchool} | ${selectedYear}`);
                hidePushButton();
                alert(`Timetable for ${selectedYear} pushed to Firestore successfully!`);
            } catch (error) {
                console.error('Error pushing to Firestore:', error);
                updateSyncStatus('error', 'Sync failed');
                alert('Failed to push to Firestore: ' + error.message);
            }
        }

        // Update sync status UI
        function updateSyncStatus(status, message) {
            const statusEl = document.getElementById('syncStatus');
            const textEl = document.getElementById('syncStatusText');
            
            statusEl.className = 'sync-status me-3 ' + status;
            
            const icons = {
                'synced': '<i class="fas fa-check-circle"></i>',
                'local-only': '<i class="fas fa-exclamation-triangle"></i>',
                'syncing': '<i class="fas fa-circle-notch fa-spin"></i>',
                'error': '<i class="fas fa-times-circle"></i>'
            };
            
            textEl.innerHTML = icons[status] + ' ' + message;
        }

        // Show/hide push button
        function showPushButton() {
            const btn = document.getElementById('pushToFirestoreBtn');
            if (btn) btn.style.display = 'inline-block';
        }

        function hidePushButton() {
            const btn = document.getElementById('pushToFirestoreBtn');
            if (btn) btn.style.display = 'none';
        }
        
        // Load data from localStorage
        function loadFromLocalStorage() {
            const storedTimetable = localStorage.getItem('schoolTimetable');
            const storedHolidays = localStorage.getItem('schoolHolidays');
            const storedPeriodTimes = localStorage.getItem('periodTimes');
            const storedTeacherSubjectMap = localStorage.getItem('teacherSubjectMap');
            
            if (storedTimetable) {
                state.timetableData = JSON.parse(storedTimetable);
            }
            
            if (storedHolidays) {
                state.holidays = JSON.parse(storedHolidays);
            } else {
                // Use sample holidays if none stored
                state.holidays = sampleHolidays;
                saveHolidaysToStorage();
            }
            
            if (storedPeriodTimes) {
                state.periodTimes = JSON.parse(storedPeriodTimes);
            }
            
            if (storedTeacherSubjectMap) {
                state.teacherSubjectMap = JSON.parse(storedTeacherSubjectMap);
            }
        }
        
        // Save timetable to localStorage with academic year
        function saveTimetableToStorage(academicYear) {
            if (state.timetableData) {
                localStorage.setItem('schoolTimetable', JSON.stringify(state.timetableData));
                if (academicYear) {
                    localStorage.setItem('timetableAcademicYear', academicYear);
                }
            }
        }
        
        // Prompt for academic year before upload
        function promptForAcademicYear() {
            // Get current selection from navbar
            const navYearSelect = document.getElementById('nav-year-select');
            const selectedYear = navYearSelect ? navYearSelect.value : '';
            
            if (!selectedYear) {
                // If no year selected in navbar, prompt user
                const years = ['2024-25', '2025-26', '2026-27', '2027-28'];
                const yearOptions = years.map((y, i) => `${i + 1}. ${y}`).join('\n');
                const input = prompt(`Select academic year for this timetable:\n${yearOptions}\n\nEnter number (1-4) or type the year (e.g., 2025-26):`, '2');
                
                if (!input) return null; // User cancelled
                
                // Parse input
                const num = parseInt(input);
                if (!isNaN(num) && num >= 1 && num <= 4) {
                    return years[num - 1];
                } else if (years.includes(input)) {
                    return input;
                } else {
                    // Try to match format
                    const matched = years.find(y => y === input.trim());
                    if (matched) return matched;
                    alert('Invalid year selection. Please try again.');
                    return promptForAcademicYear();
                }
            }
            
            return selectedYear;
        }
        
        // Save holidays to localStorage
        function saveHolidaysToStorage() {
            localStorage.setItem('schoolHolidays', JSON.stringify(state.holidays));
        }
        
        // Save period times to localStorage
        function savePeriodTimesToStorage() {
            localStorage.setItem('periodTimes', JSON.stringify(state.periodTimes));
        }
        
        function saveTeacherSubjectMapToStorage() {
            localStorage.setItem('teacherSubjectMap', JSON.stringify(state.teacherSubjectMap || {}));
        }
        
        // Set up tab navigation
        function setupTabs() {
            const tabs = document.querySelectorAll('.tab');
            tabs.forEach(tab => {
                tab.addEventListener('click', function() {
                    const targetId = this.getAttribute('data-target');
                    
                    // Remove active class from all tabs and sections
                    tabs.forEach(t => t.classList.remove('active'));
                    document.querySelectorAll('.content-section').forEach(section => {
                        section.classList.remove('active');
                    });
                    
                    // Add active class to clicked tab and corresponding section
                    this.classList.add('active');
                    document.getElementById(targetId).classList.add('active');
                });
            });
        }
        
        // Set up event listeners
        function setupEventListeners() {
            // Push to Firestore button
            const pushBtn = document.getElementById('pushToFirestoreBtn');
            if (pushBtn) pushBtn.addEventListener('click', pushToFirestore);
            
            // Helper to safely add event listener
            const addListener = (id, event, handler) => {
                const el = document.getElementById(id);
                if (el) el.addEventListener(event, handler);
            };
            
            // Holiday management
            addListener('addHolidayBtn', 'click', openAddHolidayModal);
            addListener('addFirstHolidayBtn', 'click', openAddHolidayModal);
            addListener('exportHolidaysBtn', 'click', exportHolidays);
            addListener('yearSelect', 'change', function() {
                state.currentYear = this.value;
                renderHolidays();
            });
            
            // Holiday modal
            addListener('closeHolidayModal', 'click', closeAddHolidayModal);
            addListener('cancelHolidayBtn', 'click', closeAddHolidayModal);
            addListener('saveHolidayBtn', 'click', saveHoliday);
            
            // File type selector
            document.querySelectorAll('.file-type-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    document.querySelectorAll('.file-type-btn').forEach(b => b.classList.remove('active'));
                    this.classList.add('active');
                    state.fileType = this.getAttribute('data-type');
                    
                    // Show/hide appropriate upload areas
                    document.getElementById('excelUploadArea').style.display = state.fileType === 'excel' ? 'block' : 'none';
                    document.getElementById('csvUploadArea').style.display = state.fileType === 'csv' ? 'block' : 'none';
                });
            });
            
            // View timetable
            document.querySelectorAll('.view-option').forEach(option => {
                option.addEventListener('click', function() {
                    document.querySelectorAll('.view-option').forEach(o => o.classList.remove('active'));
                    this.classList.add('active');
                    state.currentView = this.getAttribute('data-view');
                    
                    // Show/hide appropriate filters
                    const classFilter = document.getElementById('classFilter');
                    const teacherFilter = document.getElementById('teacherFilter');
                    const subjectFilter = document.getElementById('subjectFilter');
                    
                    classFilter.style.display = state.currentView === 'class' ? 'block' : 'none';
                    teacherFilter.style.display = state.currentView === 'teacher' ? 'block' : 'none';
                    subjectFilter.style.display = state.currentView === 'subject' ? 'block' : 'none';
                    
                    renderTimetable();
                });
            });
            
            addListener('applyFilterBtn', 'click', renderTimetable);
            addListener('checkOverlapsBtn', 'click', runOverlapCheckWithProgress);
            addListener('checkMappingsBtn', 'click', checkMappings);
            addListener('exportOverlapsBtn', 'click', exportOverlapsCSV);
            addListener('exportTimetableBtn', 'click', exportTimetable);
            addListener('goToUploadBtn', 'click', function() {
                document.querySelector('.tab[data-target="upload-timetable-section"]').click();
            });
            
            // Upload timetable
            addListener('excelFormatSelect', 'change', function() {
                state.excelFormat = this.value;
            });
            addListener('excelFileInput', 'change', handleExcelUpload);
            addListener('csvFileInput', 'change', handleCSVUpload);
            addListener('subjectMappingFileInput', 'change', handleSubjectMappingUpload);
            addListener('downloadTemplateBtn', 'click', downloadTemplate);
            
            // Time modal
            addListener('closeTimeModal', 'click', closeTimeInputModal);
            addListener('cancelTimeBtn', 'click', closeTimeInputModal);
            addListener('saveTimeBtn', 'click', savePeriodTimes);
            
            // Modify timetable
            addListener('rescheduleModeBtn', 'click', toggleRescheduleMode);
            addListener('loadTimetableBtn', 'click', loadTimetableForModification);
            
            // Teacher schedule
            addListener('loadTeacherScheduleBtn', 'click', loadTeacherSchedule);
            addListener('exportTeacherScheduleBtn', 'click', exportTeacherSchedule);
            
            // Reschedule modal
            addListener('closeRescheduleModal', 'click', closeRescheduleModal);
            addListener('cancelRescheduleBtn', 'click', closeRescheduleModal);
            addListener('confirmRescheduleBtn', 'click', confirmReschedule);
            
            // Copy year modal
            addListener('copyYearBtn', 'click', openCopyYearModal);
            addListener('closeCopyYearModal', 'click', closeCopyYearModal);
            addListener('cancelCopyYearBtn', 'click', closeCopyYearModal);
            addListener('confirmCopyYearBtn', 'click', confirmCopyYear);
            
            // Export timetable modal
            addListener('closeTimetableExportModal', 'click', closeTimetableExportModal);
            addListener('cancelTimetableExportBtn', 'click', closeTimetableExportModal);
            
            // Mapping issues modal
            addListener('closeMappingIssuesModal', 'click', closeMappingIssuesModal);
            addListener('closeMappingIssuesBtn', 'click', closeMappingIssuesModal);
            
            // Filter inputs for mapping issues
            addListener('filterIssueClass', 'input', renderMappingIssuesTable);
            addListener('filterIssueTeacher', 'input', renderMappingIssuesTable);
            addListener('filterIssueSubject', 'input', renderMappingIssuesTable);
            addListener('filterIssueType', 'change', renderMappingIssuesTable);
            addListener('filterExcludePeriods', 'change', renderMappingIssuesTable);
        }
        
        // Initialize the UI
        function initUI() {
            renderHolidays();
            
            // If timetable data exists, show it
            if (state.timetableData) {
                const updatedPeriods = autoFillMissingSubjectsFromTeacherMap();
                if (updatedPeriods > 0) {
                    saveTimetableToStorage();
                }
                updateTimetableSummary();
                renderTimetable();
            }
        }
        
        // Render holidays list
        function renderHolidays() {
            const holidaysList = document.getElementById('holidaysList');
            const yearHolidays = state.holidays.filter(h => h.date.startsWith(state.currentYear));
            
            // Update summary counts
            document.getElementById('totalHolidays').textContent = yearHolidays.length;
            document.getElementById('publicHolidays').textContent = yearHolidays.filter(h => h.type === 'public').length;
            document.getElementById('schoolHolidays').textContent = yearHolidays.filter(h => h.type === 'school').length;
            document.getElementById('optionalHolidays').textContent = yearHolidays.filter(h => h.type === 'optional').length;
            
            if (yearHolidays.length === 0) {
                holidaysList.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-umbrella-beach"></i>
                        <h3>No Holidays Added Yet</h3>
                        <p>Start by adding your first holiday. You can add public holidays, school holidays, or optional holidays.</p>
                        <button class="btn btn-primary" id="addFirstHolidayBtn">
                            <i class="fas fa-plus"></i> Add First Holiday
                        </button>
                    </div>
                `;
                document.getElementById('addFirstHolidayBtn').addEventListener('click', openAddHolidayModal);
                return;
            }
            
            let html = '<div class="holiday-cards">';
            
            yearHolidays.forEach(holiday => {
                const typeClass = `${holiday.type}-holiday`;
                const typeLabel = holiday.type === 'public' ? 'Public Holiday' : 
                                 holiday.type === 'school' ? 'School Holiday' : 'Optional Holiday';
                
                html += `
                    <div class="holiday-card ${typeClass}">
                        <div class="holiday-date">${formatDate(holiday.date)}</div>
                        <h3>${holiday.name}</h3>
                        <p><strong>Type:</strong> ${typeLabel}</p>
                        ${holiday.description ? `<p>${holiday.description}</p>` : ''}
                        <div style="margin-top: 15px;">
                            <button class="btn btn-danger btn-sm" onclick="deleteHoliday(${holiday.id})" style="padding: 5px 10px; font-size: 0.8rem;">
                                <i class="fas fa-trash"></i> Delete
                            </button>
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
            holidaysList.innerHTML = html;
        }
        
        // Format date for display
        function formatDate(dateString) {
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
        }
        
        // Open add holiday modal
        function openAddHolidayModal() {
            document.getElementById('addHolidayModal').classList.add('active');
            document.getElementById('holidayDate').value = `${state.currentYear}-01-01`;
        }
        
        // Close add holiday modal
        function closeAddHolidayModal() {
            document.getElementById('addHolidayModal').classList.remove('active');
            // Clear form
            document.getElementById('holidayName').value = '';
            document.getElementById('holidayDescription').value = '';
        }
        
        // Save holiday
        function saveHoliday() {
            const name = document.getElementById('holidayName').value;
            const date = document.getElementById('holidayDate').value;
            const type = document.getElementById('holidayType').value;
            const description = document.getElementById('holidayDescription').value;
            
            if (!name || !date) {
                alert("Please fill in all required fields.");
                return;
            }
            
            const newHoliday = {
                id: state.holidays.length > 0 ? Math.max(...state.holidays.map(h => h.id)) + 1 : 1,
                name,
                date,
                type,
                description
            };
            
            state.holidays.push(newHoliday);
            saveHolidaysToStorage();
            renderHolidays();
            closeAddHolidayModal();
        }
        
        // Delete holiday
        function deleteHoliday(id) {
            if (confirm("Are you sure you want to delete this holiday?")) {
                state.holidays = state.holidays.filter(h => h.id !== id);
                saveHolidaysToStorage();
                renderHolidays();
            }
        }
        
        // Export holidays
        function exportHolidays() {
            // In a real app, this would generate an Excel or PDF file
            alert("Exporting holidays to Excel file...");
            
            // For demo, we'll create a simple CSV
            const yearHolidays = state.holidays.filter(h => h.date.startsWith(state.currentYear));
            let csv = "Name,Date,Type,Description\n";
            
            yearHolidays.forEach(holiday => {
                csv += `"${holiday.name}","${holiday.date}","${holiday.type}","${holiday.description || ''}"\n`;
            });
            
            // Create download link
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `holidays_${state.currentYear}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        
        // Handle Excel file upload
        function handleExcelUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            document.getElementById('selectedExcelFileName').textContent = `Selected file: ${file.name}`;
            
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    // Process the workbook
                    processExcelWorkbook(workbook);
                } catch (error) {
                    console.error("Error reading Excel file:", error);
                    alert("Error reading Excel file. Please make sure it's in the correct format.");
                }
            };
            
            reader.readAsArrayBuffer(file);
        }
        
        // Handle CSV file upload
        function handleCSVUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            document.getElementById('selectedCSVFileName').textContent = `Selected file: ${file.name}`;
            
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const csvData = e.target.result;
                    // Process the CSV
                    processCSVData(csvData, file.name);
                } catch (error) {
                    console.error("Error reading CSV file:", error);
                    alert("Error reading CSV file. Please make sure it's in the correct format.");
                }
            };
            
            reader.readAsText(file);
        }
        
        function handleSubjectMappingUpload(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            document.getElementById('selectedSubjectMappingFileName').textContent = `Selected file: ${file.name}`;
            
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const csvData = e.target.result;
                    processSubjectMappingCSV(csvData, file.name);
                } catch (error) {
                    console.error("Error reading subject mapping CSV file:", error);
                    alert("Error reading subject mapping CSV file. Please make sure it's in the correct format.");
                }
            };
            
            reader.readAsText(file);
        }
        
        // Process uploaded Excel workbook
        function processExcelWorkbook(workbook) {
            // Clear previous data
            state.timetableData = {};
            let processedCount = 0;
            
            if (state.excelFormat === 'teacher_wise') {
                processedCount = processStateTimetableWorkbook(workbook);
            } else {
                // Process each sheet
                workbook.SheetNames.forEach(sheetName => {
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    
                    // Process the data based on the template format
                    processExcelSheetData(sheetName, jsonData);
                });
                processedCount = Object.keys(state.timetableData).length;
            }
            
            if (processedCount === 0) {
                return;
            }
            
            assignTeacherIdsInTimetableData();
            autoFillMissingSubjectsFromTeacherMap();
            
            // Prompt for academic year before saving
            const academicYear = promptForAcademicYear();
            if (!academicYear) {
                alert('Academic year is required. Please select a year to save the timetable.');
                return;
            }
            
            // Update navbar selection if different
            const navYearSelect = document.getElementById('nav-year-select');
            if (navYearSelect) navYearSelect.value = academicYear;
            localStorage.setItem('selectedAcademicYear', academicYear);
            
            // Save to localStorage with academic year
            saveTimetableToStorage(academicYear);
            
            // Update UI
            updateTimetableSummary();
            renderTimetable();
            
            // Show upload status
            const uploadDetails = document.getElementById('uploadDetails');
            if (uploadDetails) {
                uploadDetails.innerHTML = `
                    <p><i class="fas fa-check-circle" style="color: var(--success-color);"></i> Timetable uploaded successfully!</p>
                    <p>Processed ${processedCount} classes for academic year ${academicYear}.</p>
                `;
            }
            const uploadStatus = document.getElementById('uploadStatus');
            if (uploadStatus) uploadStatus.style.display = 'block';
            
            const timetableDataInfo = document.getElementById('timetableDataInfo');
            if (timetableDataInfo) timetableDataInfo.style.display = 'block';
            
            showPushButton();
        }
        
        function toCleanString(value) {
            return String(value || '')
                .replace(/\s+/g, ' ')
                .trim();
        }
        
        function safeLocaleCompare(a, b) {
            return String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base' });
        }
        
        function assignTeacherIdsInTimetableData() {
            if (!state.timetableData) return;
            
            const teacherIdMap = new Map();
            let nextId = 1;
            
            Object.values(state.timetableData).forEach(classData => {
                (classData.days || []).forEach(day => {
                    (day.periods || []).forEach(period => {
                        const teacherName = toCleanString(period.teacherName);
                        const teacherId = toCleanString(period.teacherId);
                        if (!teacherName) return;
                        
                        if (teacherId) {
                            teacherIdMap.set(teacherName, teacherId);
                            return;
                        }
                        
                        if (!teacherIdMap.has(teacherName)) {
                            teacherIdMap.set(teacherName, `T${String(nextId).padStart(4, '0')}`);
                            nextId += 1;
                        }
                    });
                });
            });
            
            Object.values(state.timetableData).forEach(classData => {
                (classData.days || []).forEach(day => {
                    (day.periods || []).forEach(period => {
                        const teacherName = toCleanString(period.teacherName);
                        if (!teacherName) return;
                        period.teacherId = teacherIdMap.get(teacherName) || toCleanString(period.teacherId);
                    });
                });
            });
        }
        
        function normalizeClassSectionLabel(value) {
            const raw = toCleanString(value).toUpperCase();
            if (!raw) return '';
            
            const compact = raw.replace(/\s+/g, '');
            const match = compact.match(/^(?:GRADE)?([IVX]+|\d+)([A-Z])$/);
            if (match) {
                return `Grade-${match[1]}-${match[2]}`;
            }
            
            const parts = raw.split(/\s+/).filter(Boolean);
            if (parts.length >= 2) {
                return `Grade-${parts[0]}-${parts[1]}`;
            }
            
            return raw;
        }
        
        function getStandardDayOrder() {
            return ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        }
        
        function processStateTimetableWorkbook(workbook) {
            const firstSheetName = workbook.SheetNames[0];
            if (!firstSheetName) return 0;
            
            const worksheet = workbook.Sheets[firstSheetName];
            const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
            if (data.length < 4) {
                alert("Selected STATE format file appears invalid (expected day and period headers in rows 2 and 3).");
                return 0;
            }
            
            const dayHeaderRow = data[1] || [];
            const periodHeaderRow = data[2] || [];
            const dayNamesMap = {
                MONDAY: 'Monday',
                TUESDAY: 'Tuesday',
                WEDNESDAY: 'Wednesday',
                THURSDAY: 'Thursday',
                FRIDAY: 'Friday',
                SATURDAY: 'Saturday'
            };
            
            const dayStarts = [];
            for (let c = 0; c < dayHeaderRow.length; c++) {
                const dayText = toCleanString(dayHeaderRow[c]).toUpperCase();
                if (dayNamesMap[dayText]) {
                    dayStarts.push({ dayName: dayNamesMap[dayText], startCol: c });
                }
            }
            
            if (dayStarts.length === 0) {
                alert("Could not detect day blocks in selected STATE format file.");
                return 0;
            }
            
            const dayBlocks = [];
            for (let i = 0; i < dayStarts.length; i++) {
                const { dayName, startCol } = dayStarts[i];
                const nextStart = i < dayStarts.length - 1 ? dayStarts[i + 1].startCol : periodHeaderRow.length;
                const periodColumns = [];
                
                for (let c = startCol; c < nextStart; c++) {
                    const periodText = toCleanString(periodHeaderRow[c]);
                    const periodMatch = periodText.match(/(\d+)/);
                    const periodNo = periodMatch ? Number(periodMatch[1]) : NaN;
                    if (Number.isInteger(periodNo) && periodNo > 0) {
                        periodColumns.push({ col: c, period: periodNo });
                    }
                }
                
                if (periodColumns.length > 0) {
                    dayBlocks.push({ dayName, periodColumns });
                }
            }
            
            if (dayBlocks.length === 0) {
                alert("Could not detect period columns in selected STATE format file.");
                return 0;
            }
            
            const maxPeriods = dayBlocks.reduce((maxVal, block) => {
                const blockMax = block.periodColumns.reduce((m, p) => Math.max(m, p.period), 0);
                return Math.max(maxVal, blockMax);
            }, 0);
            
            const classMap = {};
            const ensureClass = (className) => {
                if (!classMap[className]) {
                    const days = getStandardDayOrder().map(dayName => ({
                        dayName,
                        periods: Array.from({ length: maxPeriods }, (_, idx) => ({
                            period: idx + 1,
                            subject: '',
                            teacherName: '',
                            teacherId: '',
                            time: getPeriodTime(idx + 1),
                            type: 'Regular',
                            breakAfter: 0
                        }))
                    }));
                    classMap[className] = { className, days };
                }
                return classMap[className];
            };
            
            for (let r = 3; r < data.length; r++) {
                const row = data[r] || [];
                const teacherName = toCleanString(row[0]);
                if (!teacherName) continue;
                
                dayBlocks.forEach(block => {
                    const dayEntryForClass = (className) => ensureClass(className).days.find(d => d.dayName === block.dayName);
                    
                    block.periodColumns.forEach(({ col, period }) => {
                        const classValue = normalizeClassSectionLabel(row[col]);
                        if (!classValue) return;
                        
                        const dayEntry = dayEntryForClass(classValue);
                        if (!dayEntry) return;
                        
                        const periodEntry = dayEntry.periods[period - 1];
                        if (!periodEntry) return;
                        
                        if (periodEntry.teacherName && periodEntry.teacherName !== teacherName) {
                            periodEntry.teacherName = `${periodEntry.teacherName} / ${teacherName}`;
                        } else {
                            periodEntry.teacherName = teacherName;
                        }
                    });
                });
            }
            
            state.timetableData = classMap;
            return Object.keys(state.timetableData).length;
        }
        
        // Process Excel sheet data
        function processExcelSheetData(sheetName, data) {
            // Skip header rows
            if (data.length < 3) return;
            
            const classData = {
                className: sheetName,
                days: []
            };
            
            // Process each row starting from row 2 (0-indexed)
            for (let i = 2; i < data.length; i++) {
                const row = data[i];
                if (!row || row.length === 0) continue;
                
                const day = {
                    dayName: row[0],
                    periods: []
                };
                
                // Process each period (8 periods in the template)
                for (let p = 0; p < 8; p++) {
                    const baseIndex = p * 5;
                    const period = {
                        period: p + 1,
                        subject: row[baseIndex + 1] || '',
                        teacherName: row[baseIndex + 2] || '',
                        teacherId: row[baseIndex + 3] || '',
                        time: row[baseIndex + 4] || getPeriodTime(p + 1),
                        type: row[baseIndex + 5] || 'Regular'
                    };
                    
                    day.periods.push(period);
                }
                
                classData.days.push(day);
            }
            
            // Store in state
            state.timetableData[sheetName] = classData;
        }
        
        // Process CSV data
        function processCSVData(csvData, fileName) {
            // Clear previous data
            state.timetableData = {};
            
            // Parse CSV
            const lines = csvData.split('\n');
            if (lines.length < 2) {
                alert("CSV file is empty or has invalid format.");
                return;
            }
            
            // Get headers
            const headers = lines[0].split(',');
            
            // Check if it's the new format
            if (headers[0] !== 'Class-Section' || headers[1] !== 'Day') {
                alert("CSV format not recognized. Expected format: Class-Section,Day,P1,P2,...");
                return;
            }
            
            // Get period columns (P1, P2, etc.)
            const periodColumns = headers.filter(h => h.startsWith('P'));
            const numPeriods = periodColumns.length;
            
            // Store period count for time input
            state.tempPeriodCount = numPeriods;
            state.tempCSVData = [];
            
            // Process each data line
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;
                
                const cells = parseCSVLine(line);
                if (cells.length < 2) continue;
                
                const classSection = cells[0];
                const day = cells[1];
                
                // Create class data structure if not exists
                if (!state.tempCSVData[classSection]) {
                    state.tempCSVData[classSection] = {
                        className: classSection,
                        days: []
                    };
                }
                
                // Find or create day entry
                let dayEntry = state.tempCSVData[classSection].days.find(d => d.dayName === day);
                if (!dayEntry) {
                    dayEntry = {
                        dayName: day,
                        periods: []
                    };
                    state.tempCSVData[classSection].days.push(dayEntry);
                }
                
                // Process each period
                for (let p = 0; p < numPeriods; p++) {
                    const periodData = cells[2 + p] || '';
                    
                    let teacherId = '';
                    let teacherName = '';
                    let subject = '';
                    
                    if (periodData && periodData.includes(':')) {
                        const parts = periodData.split(':');
                        teacherId = parts[0] || '';
                        teacherName = parts[1] || '';
                        subject = parts[2] || '';
                    } else if (periodData) {
                        // Handle case where there's data but not in expected format
                        subject = periodData;
                    }
                    
                    const period = {
                        period: p + 1,
                        subject: subject,
                        teacherName: teacherName,
                        teacherId: teacherId,
                        time: '', // Will be set later
                        type: 'Regular'
                    };
                    
                    dayEntry.periods.push(period);
                }
            }
            
            // Convert to array and show time input modal
            state.tempCSVData = Object.values(state.tempCSVData);
            openTimeInputModal(numPeriods);
        }
        
        // Parse CSV line considering quoted values
        function parseCSVLine(line) {
            const result = [];
            let current = '';
            let inQuotes = false;
            
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    result.push(current);
                    current = '';
                } else {
                    current += char;
                }
            }
            
            result.push(current);
            return result;
        }
        
        function buildTeacherSubjectMapKey(teacherName, teacherId) {
            const id = toCleanString(teacherId).toLowerCase();
            const name = toCleanString(teacherName).toLowerCase();
            if (id) return `id:${id}`;
            if (name) return `name:${name}`;
            return '';
        }
        
        function getMappedSubjectForPeriod(period) {
            if (!state.teacherSubjectMap) return '';
            const keyById = buildTeacherSubjectMapKey('', period.teacherId);
            if (keyById && state.teacherSubjectMap[keyById]) {
                return toCleanString(state.teacherSubjectMap[keyById]);
            }
            
            const keyByName = buildTeacherSubjectMapKey(period.teacherName, '');
            if (keyByName && state.teacherSubjectMap[keyByName]) {
                return toCleanString(state.teacherSubjectMap[keyByName]);
            }
            
            return '';
        }
        
        function autoFillMissingSubjectsFromTeacherMap() {
            if (!state.timetableData || !state.teacherSubjectMap) return 0;
            
            let updatedCount = 0;
            Object.values(state.timetableData).forEach(classData => {
                (classData.days || []).forEach(day => {
                    (day.periods || []).forEach(period => {
                        const hasSubject = toCleanString(period.subject) !== '';
                        if (hasSubject) return;
                        const mappedSubject = getMappedSubjectForPeriod(period);
                        if (!mappedSubject) return;
                        period.subject = mappedSubject;
                        updatedCount += 1;
                    });
                });
            });
            
            return updatedCount;
        }
        
        function processSubjectMappingCSV(csvData, fileName) {
            const lines = csvData.split('\n').filter(line => line.trim() !== '');
            if (lines.length < 2) {
                alert("Subject mapping CSV is empty or has invalid format.");
                return;
            }
            
            const headerCells = parseCSVLine(lines[0]).map(cell => toCleanString(cell).toLowerCase());
            const teacherNameIndex = headerCells.findIndex(h => h === 'teacher name' || h === 'teachername');
            const teacherIdIndex = headerCells.findIndex(h => h === 'teacher id' || h === 'teacherid' || h === 'id');
            const subjectIndex = headerCells.findIndex(h => h === 'subject');
            
            if (teacherNameIndex === -1 && teacherIdIndex === -1) {
                alert("Subject mapping CSV must include Teacher Name or Teacher ID column.");
                return;
            }
            if (subjectIndex === -1) {
                alert("Subject mapping CSV must include Subject column.");
                return;
            }
            
            const parsedMap = {};
            let importedRows = 0;
            for (let i = 1; i < lines.length; i++) {
                const cells = parseCSVLine(lines[i]);
                const teacherName = toCleanString(cells[teacherNameIndex]);
                const teacherId = toCleanString(cells[teacherIdIndex]);
                const subject = toCleanString(cells[subjectIndex]);
                if (!subject) continue;
                
                const key = buildTeacherSubjectMapKey(teacherName, teacherId);
                if (!key) continue;
                
                parsedMap[key] = subject;
                importedRows += 1;
            }
            
            if (importedRows === 0) {
                alert("No valid rows found in subject mapping CSV.");
                return;
            }
            
            state.teacherSubjectMap = {
                ...(state.teacherSubjectMap || {}),
                ...parsedMap
            };
            saveTeacherSubjectMapToStorage();
            
            const updatedPeriods = autoFillMissingSubjectsFromTeacherMap();
            if (updatedPeriods > 0) {
                saveTimetableToStorage();
                updateTimetableSummary();
                renderTimetable();
            }
            
            document.getElementById('uploadStatus').style.display = 'block';
            document.getElementById('uploadDetails').innerHTML = `
                <p><i class="fas fa-check-circle" style="color: var(--success-color);"></i> Subject mapping uploaded successfully!</p>
                <p>Imported ${importedRows} teacher-subject mappings from ${fileName}. Auto-filled ${updatedPeriods} missing subjects.</p>
            `;
        }
        
        // Open time input modal
        function openTimeInputModal(numPeriods) {
            const container = document.getElementById('timeInputContainer');
            container.innerHTML = '';
            
            let html = `
                <div class="time-setup-controls">
                    <div class="time-setup-row">
                        <div class="time-setup-field">
                            <label for="p1StartTime">P1 Start Time</label>
                            <input type="time" id="p1StartTime" value="08:00">
                        </div>
                        <div class="time-setup-field">
                            <label for="regularDuration">Regular Period Duration (minutes)</label>
                            <input type="number" id="regularDuration" min="1" value="45">
                        </div>
                    </div>
                </div>
                <div class="time-period-config-grid">
            `;
            
            for (let i = 1; i <= numPeriods; i++) {
                html += `
                    <div class="time-period-row">
                        <div class="time-period-title">P${i}</div>
                        <div class="time-period-fields">
                            <label for="periodType-P${i}">Type</label>
                            <select id="periodType-P${i}" class="form-control">
                                <option value="regular">Regular</option>
                                <option value="special">Special</option>
                            </select>
                        </div>
                        <div class="time-period-fields time-special-duration-wrap" id="specialDurationWrap-P${i}" style="display: none;">
                            <label for="specialDuration-P${i}">Special Duration (minutes)</label>
                            <input type="number" id="specialDuration-P${i}" min="1" value="45">
                        </div>
                        <div class="time-period-fields">
                            <label for="breakAfter-P${i}">Break After P${i} (minutes)</label>
                            <input type="number" id="breakAfter-P${i}" min="0" value="0">
                        </div>
                        <div class="time-period-preview" id="timePreview-P${i}">--:--</div>
                    </div>
                `;
            }
            
            html += '</div>';
            container.innerHTML = html;
            
            const commonInputs = [
                document.getElementById('p1StartTime'),
                document.getElementById('regularDuration')
            ];
            commonInputs.forEach(input => {
                input.addEventListener('input', function() {
                    refreshGeneratedPeriodTimes(numPeriods);
                });
            });
            
            for (let i = 1; i <= numPeriods; i++) {
                const typeSelect = document.getElementById(`periodType-P${i}`);
                const specialDurationInput = document.getElementById(`specialDuration-P${i}`);
                const breakAfterInput = document.getElementById(`breakAfter-P${i}`);
                const specialWrap = document.getElementById(`specialDurationWrap-P${i}`);
                
                typeSelect.addEventListener('change', function() {
                    specialWrap.style.display = this.value === 'special' ? 'block' : 'none';
                    refreshGeneratedPeriodTimes(numPeriods);
                });
                
                specialDurationInput.addEventListener('input', function() {
                    refreshGeneratedPeriodTimes(numPeriods);
                });
                
                breakAfterInput.addEventListener('input', function() {
                    refreshGeneratedPeriodTimes(numPeriods);
                });
            }
            
            refreshGeneratedPeriodTimes(numPeriods);
            document.getElementById('timeInputModal').classList.add('active');
        }
        
        // Close time input modal
        function closeTimeInputModal() {
            document.getElementById('timeInputModal').classList.remove('active');
            state.tempCSVData = null;
            state.tempPeriodCount = 0;
        }
        
        function parseTimeToMinutes(value) {
            if (!value || typeof value !== 'string' || !value.includes(':')) return null;
            const parts = value.split(':');
            if (parts.length !== 2) return null;
            
            const hours = Number(parts[0]);
            const minutes = Number(parts[1]);
            
            if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
            if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
            
            return (hours * 60) + minutes;
        }
        
        function formatMinutesToTime(totalMinutes) {
            const normalized = ((totalMinutes % 1440) + 1440) % 1440;
            const hours = Math.floor(normalized / 60);
            const minutes = normalized % 60;
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        }
        
        function buildGeneratedPeriodPlan(numPeriods) {
            const p1Start = document.getElementById('p1StartTime').value;
            const regularDuration = Number(document.getElementById('regularDuration').value);
            const startMinutes = parseTimeToMinutes(p1Start);
            
            if (startMinutes === null) {
                return { error: 'Please set a valid P1 start time.' };
            }
            
            if (!Number.isFinite(regularDuration) || regularDuration <= 0) {
                return { error: 'Regular period duration must be greater than 0.' };
            }
            
            const periodTimes = {};
            const periodTypes = {};
            const periodBreaks = {};
            let cursor = startMinutes;
            
            for (let i = 1; i <= numPeriods; i++) {
                const periodKey = `P${i}`;
                const typeValue = document.getElementById(`periodType-${periodKey}`).value;
                const isSpecial = typeValue === 'special';
                let duration = regularDuration;
                
                if (isSpecial) {
                    const specialDuration = Number(document.getElementById(`specialDuration-${periodKey}`).value);
                    if (!Number.isFinite(specialDuration) || specialDuration <= 0) {
                        return { error: `Special duration for ${periodKey} must be greater than 0.` };
                    }
                    duration = specialDuration;
                }
                
                const breakAfter = Number(document.getElementById(`breakAfter-${periodKey}`).value);
                if (!Number.isFinite(breakAfter) || breakAfter < 0) {
                    return { error: `Break after ${periodKey} must be 0 or greater.` };
                }
                
                const periodStart = cursor;
                const periodEnd = cursor + duration;
                
                periodTimes[periodKey] = `${formatMinutesToTime(periodStart)}-${formatMinutesToTime(periodEnd)}`;
                periodTypes[periodKey] = isSpecial ? 'Special' : 'Regular';
                periodBreaks[periodKey] = breakAfter;
                cursor = periodEnd + breakAfter;
            }
            
            return { periodTimes, periodTypes, periodBreaks };
        }
        
        function refreshGeneratedPeriodTimes(numPeriods) {
            const plan = buildGeneratedPeriodPlan(numPeriods);
            
            for (let i = 1; i <= numPeriods; i++) {
                const preview = document.getElementById(`timePreview-P${i}`);
                const periodKey = `P${i}`;
                if (!preview) continue;
                preview.textContent = plan.periodTimes ? plan.periodTimes[periodKey] : '--:--';
            }
        }
        
        // Save period times
        function savePeriodTimes() {
            const numPeriods = state.tempPeriodCount;
            const plan = buildGeneratedPeriodPlan(numPeriods);
            
            if (plan.error) {
                alert(plan.error);
                return;
            }
            
            for (let i = 1; i <= numPeriods; i++) {
                const periodKey = `P${i}`;
                state.periodTimes[periodKey] = plan.periodTimes[periodKey];
            }
            
            savePeriodTimesToStorage();
            
            // Now process the CSV data with times
            if (state.tempCSVData) {
                // Convert temp data to final format
                state.timetableData = {};
                
                state.tempCSVData.forEach(classData => {
                    const className = classData.className;
                    state.timetableData[className] = {
                        className: className,
                        days: []
                    };
                    
                    classData.days.forEach(day => {
                        const dayEntry = {
                            dayName: day.dayName,
                            periods: []
                        };
                        
                        day.periods.forEach(period => {
                            const periodKey = `P${period.period}`;
                            const periodTime = state.periodTimes[periodKey] || getDefaultPeriodTime(period.period);
                            const periodType = plan.periodTypes[periodKey] || 'Regular';
                            const breakAfter = plan.periodBreaks[periodKey] || 0;
                            
                            dayEntry.periods.push({
                                period: period.period,
                                subject: period.subject,
                                teacherName: period.teacherName,
                                teacherId: period.teacherId,
                                time: periodTime,
                                type: periodType,
                                breakAfter: breakAfter
                            });
                        });
                        
                        state.timetableData[className].days.push(dayEntry);
                    });
                });
                
                assignTeacherIdsInTimetableData();
                autoFillMissingSubjectsFromTeacherMap();
                
                // Prompt for academic year before saving
                const academicYear = promptForAcademicYear();
                if (!academicYear) {
                    alert('Academic year is required. Please select a year to save the timetable.');
                    return;
                }
                
                // Update navbar selection if different
                const navYearSelect = document.getElementById('nav-year-select');
                if (navYearSelect) navYearSelect.value = academicYear;
                localStorage.setItem('selectedAcademicYear', academicYear);
                
                // Save to localStorage with academic year
                saveTimetableToStorage(academicYear);
                
                // Update UI
                updateTimetableSummary();
                renderTimetable();
                
                // Show upload status
                const uploadDetails = document.getElementById('uploadDetails');
                if (uploadDetails) {
                    uploadDetails.innerHTML = `
                        <p><i class="fas fa-check-circle" style="color: var(--success-color);"></i> CSV Timetable uploaded successfully!</p>
                        <p>Processed ${state.tempCSVData.length} classes for academic year ${academicYear}.</p>
                    `;
                }
                const uploadStatus = document.getElementById('uploadStatus');
                if (uploadStatus) uploadStatus.style.display = 'block';
                
                const timetableDataInfo = document.getElementById('timetableDataInfo');
                if (timetableDataInfo) timetableDataInfo.style.display = 'block';
                
                showPushButton();
            }
            
            // Update class filters
            updateClassFilters();
            
            // Close modal
            closeTimeInputModal();
        }
        
        // Get default period time
        function getDefaultPeriodTime(periodNumber) {
            // Default times starting from 8:00 AM, 45-minute periods
            const startHour = 8;
            const periodDuration = 45;
            const breakDuration = 15;
            
            let totalMinutes = (startHour * 60) + ((periodNumber - 1) * (periodDuration + breakDuration));
            
            // Adjust for breaks (assume break after 4th period)
            if (periodNumber > 4) {
                totalMinutes += 30; // Long break
            }
            
            const startHours = Math.floor(totalMinutes / 60);
            const startMinutes = totalMinutes % 60;
            const endHours = Math.floor((totalMinutes + periodDuration) / 60);
            const endMinutes = (totalMinutes + periodDuration) % 60;
            
            return `${startHours.toString().padStart(2, '0')}:${startMinutes.toString().padStart(2, '0')}-${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}`;
        }
        
        // Get period time from stored times or default
        function getPeriodTime(periodNumber) {
            const periodKey = `P${periodNumber}`;
            if (state.periodTimes && state.periodTimes[periodKey]) {
                return state.periodTimes[periodKey];
            }
            return getDefaultPeriodTime(periodNumber);
        }
        
        function normalizeSubjectName(subject) {
            return toCleanString(subject).toLowerCase();
        }
        
        function escapeHtmlAttribute(value) {
            return String(value)
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }
        
        function getUniqueSubjectMap() {
            const subjectMap = new Map();
            if (!state.timetableData) return subjectMap;
            
            Object.keys(state.timetableData).forEach(className => {
                const classData = state.timetableData[className];
                classData.days.forEach(day => {
                    day.periods.forEach(period => {
                        const label = toCleanString(period.subject);
                        const key = normalizeSubjectName(label);
                        if (key && !subjectMap.has(key)) {
                            subjectMap.set(key, label);
                        }
                    });
                });
            });
            
            return subjectMap;
        }
        
        function getMultiSelectValues(selectId) {
            const select = document.getElementById(selectId);
            return Array.from(select.selectedOptions)
                .map(option => option.value)
                .filter(value => value && value.trim() !== '');
        }
        
        // Update timetable summary
        function updateTimetableSummary() {
            if (!state.timetableData) return;
            
            const classes = Object.keys(state.timetableData);
            let periodsCount = 0;
            const teachers = new Set();
            const subjects = new Set();
            
            classes.forEach(className => {
                const classData = state.timetableData[className];
                classData.days.forEach(day => {
                    day.periods.forEach(period => {
                        const hasSubject = toCleanString(period.subject) !== '';
                        const hasTeacher = toCleanString(period.teacherName) !== '';
                        const hasTeacherId = String(period.teacherId || '').trim() !== '';
                        
                        if (hasSubject || hasTeacher || hasTeacherId) {
                            periodsCount++;
                        }
                        if (hasTeacher) {
                            teachers.add(toCleanString(period.teacherName));
                        }
                        if (hasSubject) {
                            subjects.add(toCleanString(period.subject));
                        }
                    });
                });
            });
            
            document.getElementById('classesCount').textContent = classes.length;
            document.getElementById('periodsCount').textContent = periodsCount;
            document.getElementById('teachersCount').textContent = teachers.size;
            document.getElementById('subjectsCount').textContent = subjects.size;
            
            // Update class filters
            updateClassFilters();
        }
        
        // Update class filters
        function updateClassFilters() {
            if (!state.timetableData) return;
            
            const classes = Object.keys(state.timetableData)
                .sort((a, b) => safeLocaleCompare(a, b));
            
            // Update class filter in View Timetable
            const classFilter = document.getElementById('classFilter');
            const selectedClasses = getMultiSelectValues('classFilter');
            classFilter.innerHTML = '';
            classes.forEach(className => {
                const isSelected = selectedClasses.includes(className) ? ' selected' : '';
                classFilter.innerHTML += `<option value="${className}"${isSelected}>${className}</option>`;
            });
            if (selectedClasses.length === 0) {
                classFilter.selectedIndex = -1;
            }
            
            // Update class filter in Modify Timetable
            const modifyClassFilter = document.getElementById('modifyClassFilter');
            modifyClassFilter.innerHTML = '<option value="">Select Class</option>';
            classes.forEach(className => {
                modifyClassFilter.innerHTML += `<option value="${className}">${className}</option>`;
            });
            
            // Update teacher filter
            const teachers = new Set();
            classes.forEach(className => {
                const classData = state.timetableData[className];
                classData.days.forEach(day => {
                    day.periods.forEach(period => {
                        const teacherLabel = toCleanString(period.teacherName);
                        if (teacherLabel) teachers.add(teacherLabel);
                    });
                });
            });
            const sortedTeachers = Array.from(teachers)
                .sort((a, b) => safeLocaleCompare(a, b));
            
            const teacherFilter = document.getElementById('teacherFilter');
            const selectedTeachers = getMultiSelectValues('teacherFilter');
            teacherFilter.innerHTML = '';
            sortedTeachers.forEach(teacher => {
                const isSelected = selectedTeachers.includes(teacher) ? ' selected' : '';
                teacherFilter.innerHTML += `<option value="${teacher}"${isSelected}>${teacher}</option>`;
            });
            if (selectedTeachers.length === 0) {
                teacherFilter.selectedIndex = -1;
            }
            
            const teacherScheduleFilter = document.getElementById('teacherScheduleFilter');
            teacherScheduleFilter.innerHTML = '<option value="">Select Teacher</option>';
            sortedTeachers.forEach(teacher => {
                teacherScheduleFilter.innerHTML += `<option value="${teacher}">${teacher}</option>`;
            });
            
            const subjectFilter = document.getElementById('subjectFilter');
            const selectedSubjects = getMultiSelectValues('subjectFilter');
            subjectFilter.innerHTML = '';
            
            const uniqueSubjects = Array.from(getUniqueSubjectMap().entries())
                .sort((a, b) => safeLocaleCompare(a[1], b[1]));
            
            uniqueSubjects.forEach(([subjectKey, subjectLabel]) => {
                const isSelected = selectedSubjects.includes(subjectKey) ? ' selected' : '';
                subjectFilter.innerHTML += `<option value="${subjectKey}"${isSelected}>${subjectLabel}</option>`;
            });
            if (selectedSubjects.length === 0) {
                subjectFilter.selectedIndex = -1;
            }
        }
        
        // Render timetable
        function renderTimetable() {
            const timetableDisplay = document.getElementById('timetableDisplay');
            
            if (!state.timetableData) {
                timetableDisplay.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-calendar-alt"></i>
                        <h3>No Timetable Loaded</h3>
                        <p>Upload a timetable using the "Upload Timetable" tab to view it here.</p>
                        <button class="btn btn-primary" id="goToUploadBtn">
                            <i class="fas fa-file-upload"></i> Go to Upload
                        </button>
                    </div>
                `;
                document.getElementById('goToUploadBtn').addEventListener('click', function() {
                    document.querySelector('.tab[data-target="upload-timetable-section"]').click();
                });
                return;
            }
            
            // Get filter values
            const classFilters = getMultiSelectValues('classFilter');
            const teacherFilters = getMultiSelectValues('teacherFilter');
            const subjectFilters = getMultiSelectValues('subjectFilter');
            
            let html = '';
            
            if (state.currentView === 'class') {
                // Show class-wise timetable
                const classesToShow = classFilters.length > 0 ? classFilters : Object.keys(state.timetableData);
                
                classesToShow.forEach(className => {
                    const classData = state.timetableData[className];
                    
                    html += `<h3 style="margin: 20px 0 10px 15px;">${className}</h3>`;
                    html += generateTimetableHTML(classData);
                });
            } else if (state.currentView === 'teacher') {
                // Show teacher-wise timetable
                html = generateTeacherTimetableHTML(teacherFilters);
            } else if (state.currentView === 'subject') {
                // Show subject-wise timetable
                html = generateSubjectTimetableHTML(subjectFilters);
            }
            
            timetableDisplay.innerHTML = html;
        }
        
        // Generate timetable HTML
        function generateTimetableHTML(classData) {
            if (!classData || !classData.days || classData.days.length === 0) {
                return '<p>No timetable data for this class.</p>';
            }
            
            // Determine number of periods from the first day
            const numPeriods = classData.days[0].periods.length;
            const headerDay = classData.days[0];
            const showBreakAfterPeriod = {};
            
            for (let i = 0; i < numPeriods; i++) {
                const period = headerDay.periods[i];
                showBreakAfterPeriod[i + 1] = i < numPeriods - 1 && Number(period?.breakAfter || 0) > 0;
            }
            
            let html = '<table class="timetable">';
            
            // Header row
            html += '<thead><tr><th>Day/Period</th>';
            for (let i = 1; i <= numPeriods; i++) {
                const periodTime = toCleanString(headerDay.periods[i - 1]?.time);
                const periodTimeHtml = periodTime ? `<div class="period-header-time">${periodTime}</div>` : '';
                html += `<th><div>P${i}</div>${periodTimeHtml}</th>`;
                if (showBreakAfterPeriod[i]) {
                    html += `<th class="break-header">Break</th>`;
                }
            }
            html += '</tr></thead><tbody>';
            
            // Data rows - sort days in correct order
            const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            
            dayOrder.forEach(dayName => {
                const dayData = classData.days.find(d => d.dayName === dayName);
                
                if (!dayData) return;
                
                html += `<tr><td style="font-weight: 600; background-color: #f9f9f9;">${dayName}</td>`;
                
                dayData.periods.forEach(period => {
                    // Check if this is a holiday
                    const isHoliday = isDateHoliday(dayName);
                    const hasSubject = toCleanString(period.subject) !== '';
                    const hasTeacher = toCleanString(period.teacherName) !== '';
                    
                    if (!hasSubject && !hasTeacher) {
                        html += `<td class="break-cell">BREAK</td>`;
                    } else if (isHoliday) {
                        html += `<td class="holiday-cell">HOLIDAY</td>`;
                    } else {
                        const overlapClass = period.overlap ? 'overlap' : '';
                        const overlapTooltip = period.overlapInfo || 'Teacher overlap detected.';
                        const overlapWarningHtml = period.overlap
                            ? `<div class="overlap-warning" title="${escapeHtmlAttribute(overlapTooltip)}" aria-label="${escapeHtmlAttribute(overlapTooltip)}"><i class="fas fa-exclamation-triangle"></i></div>`
                            : '';
                        const subjectHtml = hasSubject
                            ? `<div class="period-subject">${period.subject}</div>`
                            : '<div class="period-subject subject-missing" title="No subject assigned" aria-label="No subject assigned">🟡</div>';
                        const teacherHtml = hasTeacher
                            ? `<div class="period-teacher">${period.teacherName}</div>`
                            : '<div class="period-teacher">No Teacher</div>';
                        html += `
                            <td class="period-cell ${overlapClass}" data-class="${classData.className}" data-day="${dayName}" data-period="${period.period}">
                                ${overlapWarningHtml}
                                ${subjectHtml}
                                ${teacherHtml}
                            </td>
                        `;
                    }
                    
                    if (showBreakAfterPeriod[period.period]) {
                        const breakAfter = Number(period.breakAfter || 0);
                        const breakCellHtml = breakAfter > 0
                            ? `<div class="break-cell-title">BREAK</div><div class="break-cell-time">${breakAfter} min</div>`
                            : `<div class="break-cell-title">-</div>`;
                        html += `<td class="inter-period-break-cell">${breakCellHtml}</td>`;
                    }
                });
                
                html += '</tr>';
            });
            
            html += '</tbody></table>';
            return html;
        }
        
        // Generate teacher timetable HTML
        function generateTeacherTimetableHTML(teacherFilters) {
            if (!teacherFilters || teacherFilters.length === 0) {
                return '<div class="empty-state"><p>Please select one or more teachers to view their schedules.</p></div>';
            }
            
            if (!state.timetableData) return '<p>No timetable data.</p>';
            
            let html = '';
            teacherFilters.forEach(teacherFilter => {
                const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const teacherGrid = {};
                dayOrder.forEach(day => {
                    teacherGrid[day] = {};
                });
                
                let maxPeriods = 0;
                let hasAnyEntry = false;
                
                Object.keys(state.timetableData).forEach(className => {
                    const classData = state.timetableData[className];
                    classData.days.forEach(day => {
                        maxPeriods = Math.max(maxPeriods, day.periods.length);
                        day.periods.forEach(period => {
                            if (period.teacherName === teacherFilter) {
                                hasAnyEntry = true;
                                if (!teacherGrid[day.dayName]) teacherGrid[day.dayName] = {};
                                if (!teacherGrid[day.dayName][period.period]) teacherGrid[day.dayName][period.period] = [];
                                teacherGrid[day.dayName][period.period].push({
                                    className,
                                    subject: toCleanString(period.subject)
                                });
                            }
                        });
                    });
                });
                
                if (!hasAnyEntry) {
                    html += `<div class="empty-state"><p>No schedule found for teacher: ${teacherFilter}</p></div>`;
                    return;
                }
                
                html += `<h3 style="margin: 20px 0 10px 15px;">Schedule for ${teacherFilter}</h3>`;
                html += '<table class="timetable">';
                html += '<thead><tr><th>Day/Period</th>';
                for (let i = 1; i <= maxPeriods; i++) {
                    const headerTime = getPeriodTime(i);
                    html += `<th><div>P${i}</div><div class="period-header-time">${headerTime}</div></th>`;
                }
                
                html += '</tr></thead><tbody>';
                
                dayOrder.forEach(dayName => {
                    html += `<tr><td style="font-weight: 600; background-color: #f9f9f9;">${dayName}</td>`;
                    
                    for (let p = 1; p <= maxPeriods; p++) {
                        const entries = (teacherGrid[dayName] && teacherGrid[dayName][p]) ? teacherGrid[dayName][p] : [];
                        let periodInfo = '';
                        
                        if (entries.length > 0) {
                            const periodText = entries.map(entry =>
                                `${entry.className}: ${entry.subject || '<span class="no-subject-marker" title="No subject assigned" aria-label="No subject assigned">🟡</span>'}`
                            ).join('<br>');
                            
                            periodInfo = `
                                <div class="period-subject">${periodText}</div>
                            `;
                        }
                        
                        html += `<td class="period-cell">${periodInfo}</td>`;
                    }
                    
                    html += '</tr>';
                });
                
                html += '</tbody></table>';
            });
            
            return html;
        }
        
        // Generate subject timetable HTML
        function generateSubjectTimetableHTML(subjectFilterKeys) {
            if (!subjectFilterKeys || subjectFilterKeys.length === 0) {
                return '<div class="empty-state"><p>Please select one or more subjects to view schedules.</p></div>';
            }
            
            if (!state.timetableData) return '<p>No timetable data.</p>';
            
            let html = '';
            subjectFilterKeys.forEach(subjectFilterKey => {
                const subjectLabel = getUniqueSubjectMap().get(subjectFilterKey) || subjectFilterKey;
                
                // Find all classes where this subject is taught
                const subjectClasses = {};
                const classNames = Object.keys(state.timetableData);
                
                classNames.forEach(className => {
                    const classData = state.timetableData[className];
                    classData.days.forEach(day => {
                        day.periods.forEach(period => {
                            if (normalizeSubjectName(period.subject) === subjectFilterKey) {
                                if (!subjectClasses[className]) subjectClasses[className] = {};
                                if (!subjectClasses[className][day.dayName]) subjectClasses[className][day.dayName] = [];
                                subjectClasses[className][day.dayName].push(period);
                            }
                        });
                    });
                });
                
                if (Object.keys(subjectClasses).length === 0) {
                    html += `<div class="empty-state"><p>No schedule found for subject: ${subjectLabel}</p></div>`;
                    return;
                }
                
                html += `<h3 style="margin: 20px 0 10px 15px;">Schedule for ${subjectLabel}</h3>`;
                html += '<table class="timetable">';
                html += '<thead><tr><th>Day/Period</th>';
                
                // Get all classes where this subject is taught
                const classes = Object.keys(subjectClasses);
                
                classes.forEach(className => {
                    html += `<th>${className}</th>`;
                });
                
                html += '</tr></thead><tbody>';
                
                // Data rows
                const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                
                dayOrder.forEach(dayName => {
                    html += `<tr><td style="font-weight: 600; background-color: #f9f9f9;">${dayName}</td>`;
                    
                    classes.forEach(className => {
                        const dayPeriods = subjectClasses[className][dayName] || [];
                        let periodInfo = '';
                        
                        if (dayPeriods.length > 0) {
                            // Show all periods for this subject in this class on this day
                            const periodText = dayPeriods.map(p => 
                                `P${p.period}: ${p.teacherName}`
                            ).join('<br>');
                            
                            periodInfo = `
                                <div class="period-subject">${periodText}</div>
                            `;
                        }
                        
                        html += `<td class="period-cell">${periodInfo}</td>`;
                    });
                    
                    html += '</tr>';
                });
                
                html += '</tbody></table>';
            });
            
            return html;
        }
        
        // Check if a date is a holiday
        function isDateHoliday(dayName) {
            // Only use configured holiday data; do not auto-mark weekends.
            const normalizedDay = toCleanString(dayName).toLowerCase();
            return state.holidays.some(holiday => {
                if (!holiday) return false;
                const holidayDayName = toCleanString(holiday.dayName || holiday.weekday || '').toLowerCase();
                return holidayDayName && holidayDayName === normalizedDay;
            });
        }
        
        function updateOverlapProgress(label, percent, visible) {
            const progressWrap = document.getElementById('overlapProgress');
            const progressLabel = document.getElementById('overlapProgressLabel');
            const progressBar = document.getElementById('overlapProgressBar');
            
            if (visible) {
                progressWrap.style.display = 'block';
                progressLabel.textContent = label;
                progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
            } else {
                progressWrap.style.display = 'none';
                progressBar.style.width = '0%';
            }
        }
        
        function delayFrame() {
            return new Promise(resolve => setTimeout(resolve, 0));
        }
        
        // Check for overlaps in the timetable with visible progress
        async function checkForOverlaps() {
            if (!state.timetableData) return 0;
            
            const records = [];
            Object.keys(state.timetableData).forEach(className => {
                const classData = state.timetableData[className];
                classData.days.forEach(day => {
                    day.periods.forEach(period => {
                        records.push({
                            className,
                            dayName: day.dayName,
                            periodNumber: period.period,
                            period
                        });
                    });
                });
            });
            
            const totalRecords = records.length;
            if (totalRecords === 0) return 0;
            
            const chunkSize = 250;
            const teacherSchedule = new Map();
            
            updateOverlapProgress('Preparing overlap scan...', 0, true);
            
            for (let i = 0; i < totalRecords; i++) {
                const { period } = records[i];
                period.overlap = false;
                period.overlapInfo = '';
                
                if ((i + 1) % chunkSize === 0 || i === totalRecords - 1) {
                    const progress = ((i + 1) / totalRecords) * 35;
                    updateOverlapProgress('Preparing overlap scan...', progress, true);
                    await delayFrame();
                }
            }
            
            for (let i = 0; i < totalRecords; i++) {
                const current = records[i];
                const period = current.period;
                
                if (period.teacherName && period.teacherName !== '' && period.subject) {
                    const key = `${current.dayName}-${period.time}-${period.teacherName}`;
                    if (!teacherSchedule.has(key)) {
                        teacherSchedule.set(key, []);
                    }
                    teacherSchedule.get(key).push(current);
                }
                
                if ((i + 1) % chunkSize === 0 || i === totalRecords - 1) {
                    const progress = 35 + (((i + 1) / totalRecords) * 45);
                    updateOverlapProgress('Analyzing teacher schedules...', progress, true);
                    await delayFrame();
                }
            }
            
            const overlapGroups = Array.from(teacherSchedule.values()).filter(group => group.length > 1);
            const totalGroups = overlapGroups.length;
            let overlapCount = 0;
            
            if (totalGroups === 0) {
                updateOverlapProgress('No overlaps found.', 100, true);
                await delayFrame();
                return 0;
            }
            
            for (let i = 0; i < totalGroups; i++) {
                const group = overlapGroups[i];
                
                group.forEach(item => {
                    item.period.overlap = true;
                    overlapCount++;
                    
                    const otherConflicts = group
                        .filter(other => !(other.className === item.className && other.dayName === item.dayName && other.periodNumber === item.periodNumber))
                        .map(other => `${other.className} (${other.dayName} P${other.periodNumber})`);
                    
                    item.period.overlapInfo = `Teacher ${item.period.teacherName} also has ${otherConflicts.join(', ')} at ${item.period.time}.`;
                });
                
                if ((i + 1) % 20 === 0 || i === totalGroups - 1) {
                    const progress = 80 + (((i + 1) / totalGroups) * 20);
                    updateOverlapProgress('Marking overlaps...', progress, true);
                    await delayFrame();
                }
            }
            
            updateOverlapProgress(`Overlap scan complete. ${overlapCount} conflicting periods found.`, 100, true);
            await delayFrame();
            return overlapCount;
        }
        
        async function runOverlapCheckWithProgress() {
            if (!state.timetableData) {
                alert("No timetable data loaded.");
                return;
            }
            
            if (state.overlapCheckInProgress) return;
            state.overlapCheckInProgress = true;
            
            const checkBtn = document.getElementById('checkOverlapsBtn');
            const originalLabel = checkBtn.innerHTML;
            checkBtn.disabled = true;
            checkBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
            
            try {
                await checkForOverlaps();
                renderTimetable();
            } finally {
                checkBtn.disabled = false;
                checkBtn.innerHTML = originalLabel;
                state.overlapCheckInProgress = false;
                setTimeout(() => updateOverlapProgress('', 0, false), 900);
            }
        }
        
        function escapeCSVField(value) {
            const stringValue = String(value ?? '');
            const escapedValue = stringValue.replace(/"/g, '""');
            return `"${escapedValue}"`;
        }
        
        async function exportOverlapsCSV() {
            if (!state.timetableData) {
                alert("No timetable data loaded.");
                return;
            }
            
            if (state.overlapCheckInProgress) return;
            state.overlapCheckInProgress = true;
            
            const exportBtn = document.getElementById('exportOverlapsBtn');
            const originalLabel = exportBtn.innerHTML;
            const checkBtn = document.getElementById('checkOverlapsBtn');
            const originalCheckLabel = checkBtn.innerHTML;
            exportBtn.disabled = true;
            exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Exporting...';
            checkBtn.disabled = true;
            checkBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';
            
            try {
                await checkForOverlaps();
                renderTimetable();
                
                const overlapRows = [];
                Object.keys(state.timetableData).forEach(className => {
                    const classData = state.timetableData[className];
                    classData.days.forEach(day => {
                        day.periods.forEach(period => {
                            if (period.overlap) {
                                overlapRows.push({
                                    className,
                                    day: day.dayName,
                                    period: `P${period.period}`,
                                    teacher: period.teacherName || '',
                                    subject: period.subject || '',
                                    time: period.time || '',
                                    overlapInfo: period.overlapInfo || ''
                                });
                            }
                        });
                    });
                });
                
                if (overlapRows.length === 0) {
                    alert("No overlaps found to export.");
                    return;
                }
                
                let csv = 'Class,Day,Period,Teacher,Subject,Time,Conflict Details\n';
                overlapRows.forEach(row => {
                    csv += [
                        escapeCSVField(row.className),
                        escapeCSVField(row.day),
                        escapeCSVField(row.period),
                        escapeCSVField(row.teacher),
                        escapeCSVField(row.subject),
                        escapeCSVField(row.time),
                        escapeCSVField(row.overlapInfo)
                    ].join(',') + '\n';
                });
                
                const blob = new Blob([csv], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'timetable_overlaps.csv';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } finally {
                exportBtn.disabled = false;
                exportBtn.innerHTML = originalLabel;
                checkBtn.disabled = false;
                checkBtn.innerHTML = originalCheckLabel;
                state.overlapCheckInProgress = false;
                setTimeout(() => updateOverlapProgress('', 0, false), 900);
            }
        }
        
        // Check Teacher-Subject-Class Mappings against loaded mappings from management
        function checkMappings() {
            if (!state.timetableData) {
                alert("No timetable data loaded. Please upload a timetable first.");
                return;
            }
            
            // Get mappings and teachers from localStorage (loaded from management page)
            const mappingsJson = localStorage.getItem('teacherSubjectMappings');
            const teachersJson = localStorage.getItem('teachers');
            const selectedSchool = localStorage.getItem('selectedSchool');
            const selectedYear = localStorage.getItem('selectedAcademicYear');
            
            if (!mappingsJson) {
                alert("No teacher-subject-class mappings found. Please go to Management page and load mappings first.");
                return;
            }
            
            let mappings;
            let teachers = [];
            try {
                mappings = JSON.parse(mappingsJson);
                if (teachersJson) {
                    teachers = JSON.parse(teachersJson);
                }
            } catch (e) {
                alert("Error parsing mappings or teachers data.");
                return;
            }
            
            if (!Array.isArray(mappings) || mappings.length === 0) {
                alert("No mappings found. Please ensure mappings are loaded from the Management page.");
                return;
            }
            
            // Build teacher lookup: teacherId or name -> teacherEmail
            const teacherLookup = new Map();
            const normalizeName = (name) => name?.toLowerCase().replace(/\s+/g, ' ').trim();
            
            console.log(`[CheckMappings] Building lookup from ${teachers.length} teachers`);
            
            teachers.forEach(t => {
                if (t.email) {
                    const email = t.email.toLowerCase();
                    // Map by email itself
                    teacherLookup.set(email, email);
                    // Map by teacher code (e.g., T001)
                    if (t.teacherCode) {
                        teacherLookup.set(t.teacherCode.toLowerCase(), email);
                    }
                    // Map by name (original and normalized)
                    if (t.name) {
                        const nameOriginal = t.name.toLowerCase();
                        const nameNormalized = normalizeName(t.name);
                        const nameNoSpaces = t.name.toLowerCase().replace(/\s+/g, '');
                        
                        teacherLookup.set(nameOriginal, email);
                        if (nameNormalized !== nameOriginal) {
                            teacherLookup.set(nameNormalized, email);
                        }
                        if (nameNoSpaces !== nameOriginal && nameNoSpaces !== nameNormalized) {
                            teacherLookup.set(nameNoSpaces, email);
                        }
                        
                        // Log for debugging
                        if (t.name.toLowerCase().includes('sai')) {
                            console.log(`[CheckMappings] Teacher lookup: "${t.name}" -> "${email}" (variations: "${nameOriginal}", "${nameNormalized}", "${nameNoSpaces}")`);
                        }
                    }
                }
            });
            
            console.log(`[CheckMappings] Teacher lookup size: ${teacherLookup.size} entries`);
            
            // Build a lookup for valid mappings: teacherEmail+subject -> classSections[]
            const validMappings = new Map();
            mappings.forEach(m => {
                if (!m.teacherEmail || !m.subjectCode) return;
                const teacherEmail = m.teacherEmail.toLowerCase();
                const subjectCode = m.subjectCode.toLowerCase();
                const key = `${teacherEmail}|${subjectCode}`;
                if (!validMappings.has(key)) {
                    validMappings.set(key, new Set());
                }
                // Add all class sections for this mapping
                if (m.classSections && Array.isArray(m.classSections)) {
                    m.classSections.forEach(cs => validMappings.get(key).add(cs));
                }
            });
            
            // Check each period in timetable against valid mappings
            const issues = [];
            const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            
            Object.entries(state.timetableData).forEach(([className, classData]) => {
                if (!classData || !classData.days) return;
                
                // Find class section ID for this class name
                const classSection = findClassSectionByName(className);
                const classSectionId = classSection ? classSection.id : null;
                
                classData.days.forEach(day => {
                    if (!day.periods) return;
                    
                    day.periods.forEach((period, periodIndex) => {
                        if (!period.teacherId || !period.subject) return;
                        
                        // Look up teacher email from teacherId or teacherName
                        const teacherIdOrName = period.teacherId.toLowerCase();
                        const teacherName = (period.teacherName || '').toLowerCase();
                        
                        // Normalize lookup keys (handle extra spaces)
                        const normalizedId = normalizeName(period.teacherId);
                        const normalizedName = normalizeName(period.teacherName || '');
                        const noSpacesId = period.teacherId.toLowerCase().replace(/\s+/g, '');
                        const noSpacesName = (period.teacherName || '').toLowerCase().replace(/\s+/g, '');
                        
                        // Try to find teacher email from lookup (multiple variations)
                        let teacherEmail = teacherLookup.get(teacherIdOrName) || 
                                          teacherLookup.get(normalizedId) ||
                                          teacherLookup.get(noSpacesId) ||
                                          teacherLookup.get(teacherName) ||
                                          teacherLookup.get(normalizedName) ||
                                          teacherLookup.get(noSpacesName) ||
                                          teacherIdOrName; // fallback to ID if no match
                        
                        const subjectCode = period.subject.toLowerCase();
                        const key = `${teacherEmail}|${subjectCode}`;
                        
                        // Debug logging for Sai Priya or any unmatched teacher
                        if (period.teacherId?.toLowerCase().includes('sai') || 
                            period.teacherName?.toLowerCase().includes('sai')) {
                            console.log(`[CheckMappings] Checking: class=${className}, teacherId="${period.teacherId}", teacherName="${period.teacherName}"`);
                            console.log(`[CheckMappings]   Variations tried: id="${teacherIdOrName}", normId="${normalizedId}", noSpaceId="${noSpacesId}"`);
                            console.log(`[CheckMappings]   Found teacherEmail: "${teacherEmail}"`);
                            console.log(`[CheckMappings]   Subject: "${subjectCode}", Key: "${key}"`);
                            console.log(`[CheckMappings]   Valid mapping exists: ${validMappings.has(key)}`);
                        }
                        
                        // Check if this teacher-subject mapping exists
                        if (!validMappings.has(key)) {
                            issues.push({
                                type: 'missing_mapping',
                                className,
                                day: day.dayName,
                                period: `P${periodIndex + 1}`,
                                teacherId: period.teacherId,
                                teacherName: period.teacherName,
                                subject: period.subject,
                                message: `Teacher "${period.teacherName || period.teacherId}" teaching "${period.subject}" has no valid mapping`
                            });
                        } else if (classSectionId) {
                            // Check if this class section is in the allowed list
                            const allowedClasses = validMappings.get(key);
                            if (!allowedClasses.has(classSectionId)) {
                                issues.push({
                                    type: 'invalid_class',
                                    className,
                                    day: day.dayName,
                                    period: `P${periodIndex + 1}`,
                                    teacherId: period.teacherId,
                                    teacherName: period.teacherName,
                                    subject: period.subject,
                                    message: `Teacher "${period.teacherName || period.teacherId}" is not mapped to teach "${period.subject}" in ${className}`
                                });
                            }
                        }
                    });
                });
            });
            
            // Show results
            if (issues.length === 0) {
                alert(`✅ All timetable entries match valid teacher-subject-class mappings!\n\nChecked against ${mappings.length} mapping(s) for ${selectedYear || 'current year'}.`);
            } else {
                // Store issues and show modal
                state.mappingIssues = issues;
                state.mappingIssuesPage = 1;
                state.mappingIssuesSort = { column: 'className', direction: 'asc' };
                showMappingIssuesModal();
            }
        }
        
        // Show mapping issues modal
        function showMappingIssuesModal() {
            const issues = state.mappingIssues || [];
            
            // Update summary
            const missingMappings = issues.filter(i => i.type === 'missing_mapping').length;
            const invalidClasses = issues.filter(i => i.type === 'invalid_class').length;
            
            document.getElementById('mappingIssuesSummary').innerHTML = `
                <strong>Found ${issues.length} mapping issue(s)</strong><br>
                <span style="color: #856404;">
                    ${missingMappings > 0 ? `• ${missingMappings} teacher(s) without valid mapping<br>` : ''}
                    ${invalidClasses > 0 ? `• ${invalidClasses} class(es) where teacher is not authorized to teach the subject` : ''}
                </span>
            `;
            
            // Populate periods dropdown
            const periodsSelect = document.getElementById('filterExcludePeriods');
            const allPeriods = [...new Set(issues.map(i => i.period))].sort();
            periodsSelect.innerHTML = allPeriods.map(p => `<option value="${p}">${p}</option>`).join('');
            
            // Reset to page 1
            state.mappingIssuesPage = 1;
            
            // Render table
            renderMappingIssuesTable();
            
            // Show modal
            document.getElementById('mappingIssuesModal').classList.add('active');
        }
        
        // Close mapping issues modal
        function closeMappingIssuesModal() {
            document.getElementById('mappingIssuesModal').classList.remove('active');
        }
        
        // Clear all filters
        function clearMappingIssueFilters() {
            document.getElementById('filterIssueClass').value = '';
            document.getElementById('filterIssueTeacher').value = '';
            document.getElementById('filterIssueSubject').value = '';
            document.getElementById('filterIssueType').value = '';
            document.getElementById('filterExcludePeriods').selectedIndex = -1;
            state.mappingIssuesPage = 1;
            renderMappingIssuesTable();
        }
        
        // Filter and render mapping issues table
        function renderMappingIssuesTable() {
            let issues = state.mappingIssues || [];
            
            // Apply filters
            const filterClass = document.getElementById('filterIssueClass').value.toLowerCase();
            const filterTeacher = document.getElementById('filterIssueTeacher').value.toLowerCase();
            const filterSubject = document.getElementById('filterIssueSubject').value.toLowerCase();
            const filterType = document.getElementById('filterIssueType').value;
            
            // Get excluded periods
            const excludePeriodsSelect = document.getElementById('filterExcludePeriods');
            const excludedPeriods = Array.from(excludePeriodsSelect.selectedOptions).map(opt => opt.value);
            
            issues = issues.filter(issue => {
                if (filterClass && !issue.className.toLowerCase().includes(filterClass)) return false;
                if (filterTeacher && !(issue.teacherName || issue.teacherId).toLowerCase().includes(filterTeacher)) return false;
                if (filterSubject && !issue.subject.toLowerCase().includes(filterSubject)) return false;
                if (filterType && issue.type !== filterType) return false;
                if (excludedPeriods.includes(issue.period)) return false;
                return true;
            });
            
            // Sort
            const sort = state.mappingIssuesSort || { column: 'className', direction: 'asc' };
            issues.sort((a, b) => {
                let valA = a[sort.column] || '';
                let valB = b[sort.column] || '';
                valA = valA.toString().toLowerCase();
                valB = valB.toString().toLowerCase();
                
                if (valA < valB) return sort.direction === 'asc' ? -1 : 1;
                if (valA > valB) return sort.direction === 'asc' ? 1 : -1;
                return 0;
            });
            
            // Store filtered issues for pagination
            state.filteredMappingIssues = issues;
            
            // Pagination
            const pageSize = 20;
            const page = state.mappingIssuesPage || 1;
            const totalPages = Math.ceil(issues.length / pageSize) || 1;
            const start = (page - 1) * pageSize;
            const end = start + pageSize;
            const pageIssues = issues.slice(start, end);
            
            // Update pagination controls
            document.getElementById('mappingIssuesPaginationInfo').textContent = 
                `Showing ${Math.min(start + 1, issues.length)}-${Math.min(end, issues.length)} of ${issues.length} issues`;
            document.getElementById('mappingIssuesPageInfo').textContent = `Page ${page} of ${totalPages}`;
            document.getElementById('prevMappingIssuesPage').disabled = page <= 1;
            document.getElementById('nextMappingIssuesPage').disabled = page >= totalPages;
            
            // Render table body
            const tbody = document.getElementById('mappingIssuesTableBody');
            if (pageIssues.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #6c757d;">No issues match the filters</td></tr>';
                return;
            }
            
            tbody.innerHTML = pageIssues.map(issue => {
                const typeLabel = issue.type === 'missing_mapping' 
                    ? '<span style="color: #dc3545; font-weight: 600;">Missing Mapping</span>'
                    : '<span style="color: #fd7e14; font-weight: 600;">Invalid Class</span>';
                
                return `
                    <tr style="border-bottom: 1px solid #dee2e6;">
                        <td style="padding: 8px;">${issue.className}</td>
                        <td style="padding: 8px;">${issue.day}</td>
                        <td style="padding: 8px;">${issue.period}</td>
                        <td style="padding: 8px;">${issue.teacherName || issue.teacherId}</td>
                        <td style="padding: 8px;">${issue.subject}</td>
                        <td style="padding: 8px;">${typeLabel}</td>
                        <td style="padding: 8px; max-width: 300px;">${issue.message}</td>
                    </tr>
                `;
            }).join('');
        }
        
        // Sort mapping issues
        function sortMappingIssues(column) {
            const currentSort = state.mappingIssuesSort || { column: 'className', direction: 'asc' };
            
            if (currentSort.column === column) {
                // Toggle direction
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                // New column, default to asc
                currentSort.column = column;
                currentSort.direction = 'asc';
            }
            
            state.mappingIssuesSort = currentSort;
            renderMappingIssuesTable();
        }
        
        // Change page
        function changeMappingIssuesPage(delta) {
            const issues = state.filteredMappingIssues || state.mappingIssues || [];
            const pageSize = 20;
            const totalPages = Math.ceil(issues.length / pageSize) || 1;
            const currentPage = state.mappingIssuesPage || 1;
            const newPage = currentPage + delta;
            
            if (newPage >= 1 && newPage <= totalPages) {
                state.mappingIssuesPage = newPage;
                renderMappingIssuesTable();
            }
        }
        
        // Export mapping issues to CSV
        function exportMappingIssuesCSV() {
            let issues = state.filteredMappingIssues || state.mappingIssues || [];
            
            if (issues.length === 0) {
                alert('No issues to export');
                return;
            }
            
            const headers = ['Class', 'Day', 'Period', 'Teacher ID', 'Teacher Name', 'Subject', 'Issue Type', 'Message'];
            const rows = issues.map(issue => [
                issue.className,
                issue.day,
                issue.period,
                issue.teacherId,
                issue.teacherName || '',
                issue.subject,
                issue.type === 'missing_mapping' ? 'Missing Mapping' : 'Invalid Class',
                issue.message
            ]);
            
            // Create CSV
            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            ].join('\n');
            
            // Download
            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'mapping_issues.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        
        // Helper function to find class section by name
        function findClassSectionByName(className) {
            // Try to get class sections from localStorage
            const classSectionsJson = localStorage.getItem('classSections');
            if (!classSectionsJson) return null;
            
            try {
                const classSections = JSON.parse(classSectionsJson);
                if (!Array.isArray(classSections)) return null;
                
                // Try exact match first
                let match = classSections.find(cs => cs.fullName === className);
                if (match) return match;
                
                // Try grade-section match
                const parts = className.split('-');
                if (parts.length >= 2) {
                    const grade = parts[0];
                    const section = parts[1];
                    match = classSections.find(cs => 
                        cs.grade === grade && 
                        cs.section?.toUpperCase() === section.toUpperCase()
                    );
                    if (match) return match;
                }
                
                return null;
            } catch (e) {
                console.error('Error finding class section:', e);
                return null;
            }
        }
        
        // Export timetable - show column selection modal
        function exportTimetable() {
            if (!state.timetableData) {
                alert("No timetable data to export.");
                return;
            }
            
            // Get number of periods from first class
            const firstClass = Object.keys(state.timetableData)[0];
            if (!firstClass) {
                alert("No timetable data available.");
                return;
            }
            const numPeriods = state.timetableData[firstClass].days[0].periods.length;
            
            // Populate column checkboxes
            const container = document.getElementById('timetableColumnList');
            let checkboxes = `
                <div class="form-check mb-2">
                    <input class="form-check-input timetable-col-check" type="checkbox" id="col_class" value="class" checked disabled>
                    <label class="form-check-label" for="col_class">Class-Section (required)</label>
                </div>
                <div class="form-check mb-2">
                    <input class="form-check-input timetable-col-check" type="checkbox" id="col_day" value="day" checked disabled>
                    <label class="form-check-label" for="col_day">Day (required)</label>
                </div>
                <hr class="my-2">
                <p class="text-muted small mb-2">Select periods to include:</p>
            `;
            
            for (let i = 1; i <= numPeriods; i++) {
                checkboxes += `
                    <div class="form-check mb-2">
                        <input class="form-check-input timetable-col-check" type="checkbox" id="col_p${i}" value="P${i}" checked>
                        <label class="form-check-label" for="col_p${i}">Period ${i} (P${i})</label>
                    </div>
                `;
            }
            
            container.innerHTML = checkboxes;
            
            // Hide error message
            document.getElementById('timetableExportError').style.display = 'none';
            
            // Show modal
            document.getElementById('timetableExportModal').classList.add('active');
        }
        
        // Select or deselect all period columns
        function selectAllTimetableColumns(select) {
            document.querySelectorAll('.timetable-col-check:not([disabled])').forEach(cb => {
                cb.checked = select;
            });
        }
        
        // Confirm and execute timetable export
        function confirmTimetableExport() {
            // Get selected periods (excluding required class and day columns)
            const selectedPeriods = Array.from(document.querySelectorAll('.timetable-col-check:checked:not([disabled])'))
                .map(cb => cb.value);
            
            // Validate at least one period is selected
            if (selectedPeriods.length === 0) {
                document.getElementById('timetableExportError').style.display = 'block';
                return;
            }
            
            // Hide error
            document.getElementById('timetableExportError').style.display = 'none';
            
            // Get format
            const format = document.getElementById('timetableExportFormat').value;
            
            // Close modal
            closeTimetableExportModal();
            
            // Export based on format
            if (format === 'excel') {
                exportToExcel(selectedPeriods);
            } else {
                exportToCSV(selectedPeriods);
            }
        }
        
        // Close timetable export modal
        function closeTimetableExportModal() {
            document.getElementById('timetableExportModal').classList.remove('active');
        }
        
        // Export to Excel
        function exportToExcel(selectedPeriods = null) {
            // Create a new workbook
            const wb = XLSX.utils.book_new();
            
            // Determine which periods to export
            const firstClass = Object.keys(state.timetableData)[0];
            const totalPeriods = state.timetableData[firstClass].days[0].periods.length;
            const periodsToExport = selectedPeriods || Array.from({length: totalPeriods}, (_, i) => `P${i+1}`);
            const periodIndices = periodsToExport.map(p => parseInt(p.replace('P', '')) - 1);
            
            // Add each class as a sheet
            Object.keys(state.timetableData).forEach(className => {
                const classData = state.timetableData[className];
                
                // Create header row with only selected periods
                const header = ['Day'];
                periodIndices.forEach(idx => {
                    const periodNum = idx + 1;
                    header.push(`P${periodNum} Subject`, `P${periodNum} Teacher Name`, `P${periodNum} Teacher ID`, `P${periodNum} Time`, `P${periodNum} Type`);
                });
                
                const data = [header];
                
                // Add each day's data
                const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                
                dayOrder.forEach(dayName => {
                    const dayData = classData.days.find(d => d.dayName === dayName);
                    if (!dayData) return;
                    
                    const row = [dayName];
                    
                    // Only add selected periods
                    periodIndices.forEach(idx => {
                        const period = dayData.periods[idx] || {};
                        row.push(period.subject || '');
                        row.push(period.teacherName || '');
                        row.push(period.teacherId || '');
                        row.push(period.time || '');
                        row.push(period.type || 'Regular');
                    });
                    
                    data.push(row);
                });
                
                // Create worksheet
                const ws = XLSX.utils.aoa_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, className);
            });
            
            // Generate and download file
            XLSX.writeFile(wb, 'school_timetable_export.xlsx');
        }
        
        // Export to CSV (new format)
        function exportToCSV(selectedPeriods = null) {
            // Determine which periods to export
            const firstClass = Object.keys(state.timetableData)[0];
            if (!firstClass) return;
            
            const totalPeriods = state.timetableData[firstClass].days[0].periods.length;
            const periodsToExport = selectedPeriods || Array.from({length: totalPeriods}, (_, i) => `P${i+1}`);
            const periodIndices = periodsToExport.map(p => parseInt(p.replace('P', '')) - 1);
            
            let csv = 'Class-Section,Day';
            
            // Add selected period headers only
            periodsToExport.forEach(p => {
                csv += `,${p}`;
            });
            csv += '\n';
            
            // Add data for each class
            Object.keys(state.timetableData).forEach(className => {
                const classData = state.timetableData[className];
                
                const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                
                dayOrder.forEach(dayName => {
                    const dayData = classData.days.find(d => d.dayName === dayName);
                    if (!dayData) return;
                    
                    csv += `${className},${dayName}`;
                    
                    // Only add selected periods
                    periodIndices.forEach(idx => {
                        const period = dayData.periods[idx] || {};
                        if (period.subject || period.teacherName || period.teacherId) {
                            csv += `,${period.teacherId || ''}:${period.teacherName}:${period.subject}`;
                        } else {
                            csv += ',';
                        }
                    });
                    
                    csv += '\n';
                });
            });
            
            // Create download link
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'school_timetable.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        
        // Download template
        function downloadTemplate() {
            if (state.fileType === 'excel') {
                downloadExcelTemplate();
            } else {
                downloadCSVTemplate();
            }
        }
        
        // Download Excel template
        function downloadExcelTemplate() {
            // Create a simple template with sample data
            const wb = XLSX.utils.book_new();
            
            // Sample classes
            const classes = ['Class1A', 'Class1B', 'Class2A', 'Class2B'];
            
            classes.forEach(className => {
                // Create header row
                const header = [
                    'Day', 'P1 Subject', 'P1 Teacher Name', 'P1 Teacher ID', 'P1 Time', 'P1 Type',
                    'P2 Subject', 'P2 Teacher Name', 'P2 Teacher ID', 'P2 Time', 'P2 Type',
                    'P3 Subject', 'P3 Teacher Name', 'P3 Teacher ID', 'P3 Time', 'P3 Type',
                    'P4 Subject', 'P4 Teacher Name', 'P4 Teacher ID', 'P4 Time', 'P4 Type',
                    'P5 Subject', 'P5 Teacher Name', 'P5 Teacher ID', 'P5 Time', 'P5 Type',
                    'P6 Subject', 'P6 Teacher Name', 'P6 Teacher ID', 'P6 Time', 'P6 Type',
                    'P7 Subject', 'P7 Teacher Name', 'P7 Teacher ID', 'P7 Time', 'P7 Type',
                    'P8 Subject', 'P8 Teacher Name', 'P8 Teacher ID', 'P8 Time', 'P8 Type'
                ];
                
                const data = [header];
                
                // Add days
                const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                
                days.forEach(day => {
                    const row = [day];
                    
                    // Add sample periods
                    for (let i = 1; i <= 8; i++) {
                        if (i === 4) {
                            // Break period
                            row.push('BREAK', '', '', '11:00-11:30', 'Regular');
                        } else {
                            row.push('Mathematics', 'John Doe', '17PVSS0001', `${8+i}:00-${8+i}:45`, 'Regular');
                        }
                    }
                    
                    data.push(row);
                });
                
                // Create worksheet
                const ws = XLSX.utils.aoa_to_sheet(data);
                XLSX.utils.book_append_sheet(wb, ws, className);
            });
            
            // Generate and download file
            XLSX.writeFile(wb, 'timetable_template.xlsx');
        }
        
        // Download CSV template
        function downloadCSVTemplate() {
            // Create CSV template with sample data
            let csv = 'Class-Section,Day,P1,P2,P3,P4,P5,P6,P7,P8,P9,P10\n';
            csv += 'Grade-I-A,Monday,T001:Indira:MATHS,T001:Indira:ENGLISH,T002:Sai Priya:EVS,T003:Uma Rani:Hindi,T004:Pravalika:Maths,,,,,\n';
            csv += 'Grade-I-A,Tuesday,T001:Indira:ENGLISH,T001:Indira:ENGLISH,T002:Sai Priya:EVS,T003:Uma Rani:Hindi,T004:Pravalika:Maths,,,,,\n';
            csv += 'Grade-I-A,Wednesday,T001:Indira:Telugu,T001:Indira:ENGLISH,T007:Suresh:Games,T003:Uma Rani:Hindi,T008:Adiba:EVS,,,,,\n';
            
            // Create download link
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'timetable_template.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
        
        // Toggle reschedule mode
        function toggleRescheduleMode() {
            state.rescheduleMode = !state.rescheduleMode;
            state.selectedPeriods = [];
            
            const rescheduleControls = document.getElementById('rescheduleControls');
            const rescheduleBtn = document.getElementById('rescheduleModeBtn');
            
            if (state.rescheduleMode) {
                rescheduleControls.style.display = 'flex';
                rescheduleBtn.innerHTML = '<i class="fas fa-times"></i> Exit Reschedule Mode';
                rescheduleBtn.classList.add('btn-danger');
                rescheduleBtn.classList.remove('btn-primary');
                
                // Add click listeners to timetable cells
                addRescheduleListeners();
            } else {
                rescheduleControls.style.display = 'none';
                rescheduleBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> Reschedule Mode';
                rescheduleBtn.classList.remove('btn-danger');
                rescheduleBtn.classList.add('btn-primary');
                
                // Remove highlight from selected cells
                document.querySelectorAll('.swap-highlight').forEach(cell => {
                    cell.classList.remove('swap-highlight');
                });
                
                // Remove click listeners
                removeRescheduleListeners();
            }
        }
        
        // Add reschedule listeners
        function addRescheduleListeners() {
            const cells = document.querySelectorAll('.period-cell');
            cells.forEach(cell => {
                cell.addEventListener('click', handlePeriodSelection);
            });
        }
        
        // Remove reschedule listeners
        function removeRescheduleListeners() {
            const cells = document.querySelectorAll('.period-cell');
            cells.forEach(cell => {
                cell.removeEventListener('click', handlePeriodSelection);
            });
        }
        
        // Handle period selection for rescheduling
        function handlePeriodSelection(event) {
            const cell = event.currentTarget;
            const className = cell.getAttribute('data-class');
            const dayName = cell.getAttribute('data-day');
            const periodNum = parseInt(cell.getAttribute('data-period'));
            
            // Check if already selected
            const isSelected = state.selectedPeriods.some(p => 
                p.className === className && p.dayName === dayName && p.period === periodNum
            );
            
            if (isSelected) {
                // Deselect
                cell.classList.remove('swap-highlight');
                state.selectedPeriods = state.selectedPeriods.filter(p => 
                    !(p.className === className && p.dayName === dayName && p.period === periodNum)
                );
            } else {
                // Select (max 2 periods)
                if (state.selectedPeriods.length < 2) {
                    cell.classList.add('swap-highlight');
                    state.selectedPeriods.push({
                        className,
                        dayName,
                        period: periodNum
                    });
                    
                    // If 2 periods selected, enable swap button
                    if (state.selectedPeriods.length === 2) {
                        document.getElementById('confirmSwapBtn').disabled = false;
                    }
                }
            }
        }
        
        // Load timetable for modification
        function loadTimetableForModification() {
            const classFilter = document.getElementById('modifyClassFilter').value;
            
            if (!classFilter) {
                alert("Please select a class to load.");
                return;
            }
            
            if (!state.timetableData || !state.timetableData[classFilter]) {
                alert("No timetable data found for this class.");
                return;
            }
            
            const modifyTimetableDisplay = document.getElementById('modifyTimetableDisplay');
            const classData = state.timetableData[classFilter];
            
            modifyTimetableDisplay.innerHTML = `
                <h3 style="margin: 20px 0 10px 15px;">${classData.className}</h3>
                ${generateTimetableHTML(classData)}
            `;
            
            // Add click listeners if in reschedule mode
            if (state.rescheduleMode) {
                addRescheduleListeners();
            }
        }
        
        // Load teacher schedule
        function loadTeacherSchedule() {
            const teacherFilter = document.getElementById('teacherScheduleFilter').value;
            
            if (!teacherFilter) {
                alert("Please select a teacher to load schedule.");
                return;
            }
            
            const teacherScheduleDisplay = document.getElementById('teacherScheduleDisplay');
            teacherScheduleDisplay.innerHTML = generateTeacherTimetableHTML([teacherFilter]);
        }
        
        // Export teacher schedule
        function exportTeacherSchedule() {
            const teacherFilter = document.getElementById('teacherScheduleFilter').value;
            
            if (!teacherFilter) {
                alert("Please select a teacher to export schedule.");
                return;
            }
            
            alert(`Exporting schedule for ${teacherFilter}...`);
            // In a real app, this would generate an Excel or PDF file
        }
        
        // Open reschedule modal
        function openRescheduleModal() {
            if (state.selectedPeriods.length !== 2) {
                alert("Please select exactly two periods to swap.");
                return;
            }
            
            // Get period details
            const period1 = getPeriodDetails(state.selectedPeriods[0]);
            const period2 = getPeriodDetails(state.selectedPeriods[1]);
            
            document.getElementById('period1Info').innerHTML = `
                <strong>${period1.className} - ${period1.dayName} - Period ${period1.period}</strong><br>
                Subject: ${period1.subject}<br>
                Teacher: ${period1.teacherName}<br>
                Time: ${period1.time}
            `;
            
            document.getElementById('period2Info').innerHTML = `
                <strong>${period2.className} - ${period2.dayName} - Period ${period2.period}</strong><br>
                Subject: ${period2.subject}<br>
                Teacher: ${period2.teacherName}<br>
                Time: ${period2.time}
            `;
            
            document.getElementById('rescheduleModal').classList.add('active');
        }
        
        // Close reschedule modal
        function closeRescheduleModal() {
            document.getElementById('rescheduleModal').classList.remove('active');
        }
        
        // Confirm reschedule
        function confirmReschedule() {
            if (state.selectedPeriods.length !== 2) {
                alert("Please select exactly two periods to swap.");
                return;
            }
            
            const period1 = state.selectedPeriods[0];
            const period2 = state.selectedPeriods[1];
            
            // Swap the periods
            swapPeriods(period1, period2);
            
            // Save to storage
            saveTimetableToStorage();
            
            // Update UI
            loadTimetableForModification();
            closeRescheduleModal();
            
            // Reset selection
            state.selectedPeriods = [];
            document.querySelectorAll('.swap-highlight').forEach(cell => {
                cell.classList.remove('swap-highlight');
            });
            
            alert("Periods swapped successfully!");
        }
        
        // Open copy year modal
        function openCopyYearModal() {
            const selectedSchool = localStorage.getItem('selectedSchool');
            if (!selectedSchool) {
                alert('Please select a school first');
                return;
            }
            
            // Pre-fill source year with current selection
            const currentYear = localStorage.getItem('selectedAcademicYear');
            const sourceSelect = document.getElementById('copySourceYear');
            if (sourceSelect && currentYear) {
                sourceSelect.value = currentYear;
            }
            
            // Clear any previous errors
            const errorDiv = document.getElementById('copyYearError');
            if (errorDiv) {
                errorDiv.style.display = 'none';
                errorDiv.textContent = '';
            }
            
            document.getElementById('copyYearModal').classList.add('active');
        }
        
        // Close copy year modal
        function closeCopyYearModal() {
            document.getElementById('copyYearModal').classList.remove('active');
        }
        
        // Confirm copy year
        async function confirmCopyYear() {
            const selectedSchool = localStorage.getItem('selectedSchool');
            const sourceYear = document.getElementById('copySourceYear').value;
            const targetYear = document.getElementById('copyTargetYear').value;
            const errorDiv = document.getElementById('copyYearError');
            
            // Validate
            if (!sourceYear || !targetYear) {
                errorDiv.textContent = 'Please select both source and target years';
                errorDiv.style.display = 'block';
                return;
            }
            
            if (sourceYear === targetYear) {
                errorDiv.textContent = 'Source and target years cannot be the same';
                errorDiv.style.display = 'block';
                return;
            }
            
            errorDiv.style.display = 'none';
            
            try {
                // Load source data from Firestore
                const sourceDoc = await firestore.collection('timetables')
                    .doc(selectedSchool)
                    .collection('years')
                    .doc(sourceYear)
                    .get();
                
                if (!sourceDoc.exists) {
                    // Try to load from localStorage if not in Firestore
                    const localYear = localStorage.getItem('timetableAcademicYear');
                    const hasLocalData = !!localStorage.getItem('schoolTimetable');
                    
                    if (hasLocalData && localYear === sourceYear) {
                        // Use local data
                        const dataToCopy = {
                            timetableData: state.timetableData,
                            holidays: state.holidays,
                            periodTimes: state.periodTimes,
                            teacherSubjectMap: state.teacherSubjectMap,
                            currentYear: state.currentYear,
                            schoolId: selectedSchool,
                            academicYear: targetYear,
                            copiedFrom: sourceYear,
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                            updatedBy: currentUser ? currentUser.email : 'unknown'
                        };
                        
                        await firestore.collection('timetables')
                            .doc(selectedSchool)
                            .collection('years')
                            .doc(targetYear)
                            .set(dataToCopy);
                        
                        alert(`Timetable copied from ${sourceYear} to ${targetYear} successfully!`);
                        closeCopyYearModal();
                        
                        // Switch to the new year
                        localStorage.setItem('selectedAcademicYear', targetYear);
                        const navYearSelect = document.getElementById('nav-year-select');
                        if (navYearSelect) navYearSelect.value = targetYear;
                        await reloadForSchoolAndYear();
                    } else {
                        errorDiv.textContent = `No timetable found for ${sourceYear}. Please upload or push data first.`;
                        errorDiv.style.display = 'block';
                        return;
                    }
                } else {
                    // Copy from Firestore source to target
                    const sourceData = sourceDoc.data();
                    const dataToCopy = {
                        ...sourceData,
                        academicYear: targetYear,
                        copiedFrom: sourceYear,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedBy: currentUser ? currentUser.email : 'unknown'
                    };
                    
                    await firestore.collection('timetables')
                        .doc(selectedSchool)
                        .collection('years')
                        .doc(targetYear)
                        .set(dataToCopy);
                    
                    alert(`Timetable copied from ${sourceYear} to ${targetYear} successfully!`);
                    closeCopyYearModal();
                    
                    // Switch to the new year
                    localStorage.setItem('selectedAcademicYear', targetYear);
                    const navYearSelect = document.getElementById('nav-year-select');
                    if (navYearSelect) navYearSelect.value = targetYear;
                    await reloadForSchoolAndYear();
                }
            } catch (error) {
                console.error('Error copying timetable:', error);
                errorDiv.textContent = 'Error copying timetable: ' + error.message;
                errorDiv.style.display = 'block';
            }
        }
        
        // Get period details
        function getPeriodDetails(periodInfo) {
            const classData = state.timetableData[periodInfo.className];
            const dayData = classData.days.find(d => d.dayName === periodInfo.dayName);
            const periodData = dayData.periods.find(p => p.period === periodInfo.period);
            
            return {
                className: periodInfo.className,
                dayName: periodInfo.dayName,
                period: periodInfo.period,
                subject: periodData.subject,
                teacherName: periodData.teacherName,
                time: periodData.time
            };
        }
        
        // Swap periods
        function swapPeriods(period1, period2) {
            const classData1 = state.timetableData[period1.className];
            const dayData1 = classData1.days.find(d => d.dayName === period1.dayName);
            const periodData1 = dayData1.periods.find(p => p.period === period1.period);
            
            const classData2 = state.timetableData[period2.className];
            const dayData2 = classData2.days.find(d => d.dayName === period2.dayName);
            const periodData2 = dayData2.periods.find(p => p.period === period2.period);
            
            // Swap the subject, teacher, and ID (keep time and type)
            const tempSubject = periodData1.subject;
            const tempTeacherName = periodData1.teacherName;
            const tempTeacherId = periodData1.teacherId;
            
            periodData1.subject = periodData2.subject;
            periodData1.teacherName = periodData2.teacherName;
            periodData1.teacherId = periodData2.teacherId;
            
            periodData2.subject = tempSubject;
            periodData2.teacherName = tempTeacherName;
            periodData2.teacherId = tempTeacherId;
        }
        
        // Set up reschedule controls
        document.getElementById('confirmSwapBtn').addEventListener('click', openRescheduleModal);
        document.getElementById('cancelSwapBtn').addEventListener('click', function() {
            toggleRescheduleMode();
        });
