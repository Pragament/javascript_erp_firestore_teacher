# Teacher App - Code Obfuscation

## Quick Start

### 1. Edit Source Code

```bash
# Edit the readable source file
vim app.js
```

### 2. Run Obfuscation

**Windows:**

```cmd
obfuscate.bat simple
```

**Linux/Mac:**

```bash
chmod +x obfuscate.sh
./obfuscate.sh simple
```

### 3. Deploy

```bash
# Copy obfuscated file to public repo
cp app.obfuscated.js ../public-repo/javascript_erp_firestore_teacher/
```

## Files

| File                | Purpose                      | Location          |
| ------------------- | ---------------------------- | ----------------- |
| `app.js`            | Readable source code         | Private repo only |
| `app.obfuscated.js` | Obfuscated code              | Public repo       |
| `report.js`         | Report generation            | Both repos        |
| `obfuscate.bat`     | Windows obfuscation script   | Both repos        |
| `obfuscate.sh`      | Linux/Mac obfuscation script | Both repos        |

## Obfuscation Command

### Simple Mode (No Dependencies)

```bash
# Windows
./obfuscate.bat simple

# Linux/Mac
./obfuscate.sh simple
```

### Full Mode (Requires javascript-obfuscator)

```bash
# Install first
npm install -g javascript-obfuscator

# Then run
obfuscate.bat        # Windows
./obfuscate.sh       # Linux/Mac
```

## What Gets Obfuscated?

- `firebaseConfigParts` → `_0x4a`
- `firebaseConfig` → `_c`
- `firestore` → `_d`
- `auth` → `_a`
- `currentUser` → `_u`
- `initializeApp` → `_i`
- `getAssignedSection` → Function name obfuscated
- `loadTests` → Function name obfuscated
- `viewStudentResults` → Function name obfuscated
- All comments removed
- Proper formatting maintained

## Important Rules

✅ **DO:**

- Edit `app.js` only
- Run obfuscation before deploying
- Deploy `app.obfuscated.js` to public
- Keep `app.js` in private repo

❌ **DON'T:**

- Never commit `app.js` to public repo
- Never edit `app.obfuscated.js` directly
- Never skip obfuscation step

## Example Workflow

```bash
# 1. Make changes
vim app.js

# 2. Test locally
python -m http.server 8000

# 3. Obfuscate
./obfuscate.sh simple

# 4. Deploy
cp app.obfuscated.js ../public-repo/javascript_erp_firestore_teacher/
cd ../public-repo
git add app.obfuscated.js
git commit -m "Update teacher app"
git push
```

## Troubleshooting

### "Permission denied" on Linux/Mac

```bash
chmod +x obfuscate.sh
```

### "javascript-obfuscator not found"

Use simple mode:

```bash
./obfuscate.sh simple
```

Or install:

```bash
npm install -g javascript-obfuscator
```

## Features

- Google Authentication
- View Assigned Section
- View Student Test Results
- Generate Detailed Reports
- Share Reports via WhatsApp
- Automatic Score Calculation
