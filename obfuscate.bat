@echo off
REM School Admin JavaScript Obfuscation Script
REM Converts app.js (source) -> app.obfuscated.js (obfuscated)

setlocal enabledelayedexpansion

echo ========================================
echo School Admin Code Obfuscation Tool
echo ========================================
echo.

if "%1"=="help" goto :help
if "%1"=="--help" goto :help
if "%1"=="-h" goto :help
if "%1"=="simple" goto :obfuscate_simple
if "%1"=="" goto :obfuscate

echo Unknown option: %1
echo Use 'obfuscate.bat help' for usage
exit /b 1

:obfuscate
echo Obfuscating JavaScript code...
echo.

if not exist "app.js" (
    echo [91mERROR: app.js not found![0m
    echo This is your source file for development.
    exit /b 1
)

REM Check if javascript-obfuscator is installed
where javascript-obfuscator >nul 2>&1
if errorlevel 1 (
    echo [91mERROR: javascript-obfuscator not found![0m
    echo.
    echo Please install it first:
    echo   npm install -g javascript-obfuscator
    echo.
    echo Or use the simple version:
    echo   obfuscate.bat simple
    exit /b 1
)

echo Source: app.js
echo Output: app.obfuscated.js
echo.
echo Applying obfuscation...

javascript-obfuscator app.js --output app.obfuscated.js --compact true --control-flow-flattening true --control-flow-flattening-threshold 0.75 --dead-code-injection true --dead-code-injection-threshold 0.4 --debug-protection false --disable-console-output false --identifier-names-generator hexadecimal --log false --rename-globals false --rotate-string-array true --self-defending true --string-array true --string-array-encoding base64 --string-array-threshold 0.75 --transform-object-keys true --unicode-escape-sequence false

if errorlevel 1 (
    echo [91mERROR: Obfuscation failed![0m
    exit /b 1
)

echo.
echo [92mObfuscation complete![0m
echo [92mapp.obfuscated.js generated from app.js[0m
echo.

if exist "app.obfuscated.js" (
    if exist "app.js" (
        for %%A in (app.js) do set source_size=%%~zA
        for %%A in (app.obfuscated.js) do set obfuscated_size=%%~zA
        echo File sizes:
        echo   Source ^(app.js^): !source_size! bytes
        echo   Obfuscated ^(app.obfuscated.js^): !obfuscated_size! bytes
        echo.
    )
)

echo [96mNext steps:[0m
echo 1. Test app.obfuscated.js to ensure it works
echo 2. Deploy app.obfuscated.js to public repo
echo 3. Keep app.js in private repo only
echo.
exit /b 0

:obfuscate_simple
echo Using simple obfuscation...
echo.

if not exist "app.js" (
    echo [91mERROR: app.js not found![0m
    exit /b 1
)

echo Applying basic transformations...

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"$content = Get-Content 'app.js' -Raw; ^
$content = $content -replace '(?m)^//.*$', ''; ^
$content = $content -replace 'firebaseConfigParts', '_0x4a'; ^
$content = $content -replace 'firebaseConfig', '_c'; ^
$content = $content -replace 'firestore', '_d'; ^
$content = $content -replace '\bauth\b', '_a'; ^
$content = $content -replace 'currentUser', '_u'; ^
$content = $content -replace 'currentSchoolId', '_s'; ^
$content = $content -replace '\belements\b', '_e'; ^
$content = $content -replace 'initializeApp', '_i'; ^
$content = $content -replace 'loadSections', '_ls'; ^
$content = $content -replace 'loadAssignments', '_la'; ^
$content = $content -replace 'editAssignment', '_ed'; ^
$content = $content -replace 'deleteAssignment', '_dl'; ^
$content = $content -replace 'authScreen', '_as'; ^
$content = $content -replace 'mainApp', '_ma'; ^
$content = $content -replace 'googleSignin', '_gs'; ^
$content = $content -replace 'signoutBtn', '_sb'; ^
$content = $content -replace 'userEmail', '_ue'; ^
$content = $content -replace 'sectionSelect', '_ss'; ^
$content = $content -replace 'teacherEmail', '_te'; ^
$content = $content -replace 'assignBtn', '_ab'; ^
$content = $content -replace 'refreshBtn', '_rb'; ^
$content = $content -replace 'assignmentsTable', '_at'; ^
$content = $content -replace '\r?\n\r?\n+', \"`n\"; ^
$content = $content -replace '    ', '  '; ^
Set-Content 'app.obfuscated.js' $content"

if errorlevel 1 (
    echo [91mERROR: Simple obfuscation failed![0m
    exit /b 1
)

echo.
echo [92mSimple obfuscation complete![0m
echo [92mapp.obfuscated.js generated from app.js[0m
echo [93mFor better security, install javascript-obfuscator[0m
echo.
exit /b 0

:help
echo.
echo ========================================
echo HELP - Code Obfuscation Tool
echo ========================================
echo.
echo This script converts app.js -^> app.obfuscated.js
echo.
echo USAGE:
echo   obfuscate.bat                 - Run obfuscation
echo   obfuscate.bat simple          - Simple obfuscation
echo   obfuscate.bat help            - Show this help
echo.
echo WORKFLOW:
echo   1. Edit app.js in private repo
echo   2. Run obfuscate.bat to generate app.obfuscated.js
echo   3. Deploy app.obfuscated.js to public repo
echo   4. NEVER commit app.js to public repo!
echo.
echo FILES:
echo   app.js              - Source code ^(PRIVATE REPO ONLY^)
echo   app.obfuscated.js   - Obfuscated output ^(PUBLIC REPO^)
echo.
echo ========================================
echo.
exit /b 0
