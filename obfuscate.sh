#!/bin/bash

# School Admin JavaScript Obfuscation Script
# Converts app.js (source) -> app.obfuscated.js (obfuscated)

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to display header
show_header() {
    echo -e "${CYAN}========================================"
    echo -e "School Admin Code Obfuscation Tool"
    echo -e "========================================${NC}"
    echo ""
}

# Function to display help
show_help() {
    echo -e "${YELLOW}HELP - Code Obfuscation Tool${NC}"
    echo ""
    echo "This script converts app.js → app.obfuscated.js"
    echo ""
    echo -e "${GREEN}USAGE:${NC}"
    echo "  ./obfuscate.sh                 - Run obfuscation"
    echo "  ./obfuscate.sh simple          - Simple obfuscation"
    echo "  ./obfuscate.sh help            - Show this help"
    echo ""
    echo -e "${GREEN}WORKFLOW:${NC}"
    echo "  1. Edit app.js in private repo"
    echo "  2. Run ./obfuscate.sh to generate app.obfuscated.js"
    echo "  3. Deploy app.obfuscated.js to public repo"
    echo "  4. NEVER commit app.js to public repo!"
    echo ""
    echo -e "${GREEN}FILES:${NC}"
    echo "  app.js              - Source code (PRIVATE REPO ONLY)"
    echo "  app.obfuscated.js   - Obfuscated output (PUBLIC REPO)"
    echo ""
}

# Check if javascript-obfuscator is installed
check_obfuscator() {
    if ! command -v javascript-obfuscator &> /dev/null; then
        echo -e "${RED}ERROR: javascript-obfuscator not found!${NC}"
        echo ""
        echo "Please install it first:"
        echo "  npm install -g javascript-obfuscator"
        echo ""
        echo "Or use the simple version:"
        echo "  ./obfuscate.sh simple"
        return 1
    fi
    return 0
}

# Function to obfuscate code using javascript-obfuscator
obfuscate_code() {
    echo -e "${YELLOW}Obfuscating JavaScript code...${NC}"
    echo ""
    
    if [ ! -f "app.js" ]; then
        echo -e "${RED}ERROR: app.js not found!${NC}"
        echo "This is your source file for development."
        return 1
    fi
    
    # Check for obfuscator
    if ! check_obfuscator; then
        return 1
    fi
    
    echo "Source: app.js"
    echo "Output: app.obfuscated.js"
    echo ""
    echo "Applying obfuscation..."
    
    # Run javascript-obfuscator with strong settings
    javascript-obfuscator app.js \
        --output app.obfuscated.js \
        --compact true \
        --control-flow-flattening true \
        --control-flow-flattening-threshold 0.75 \
        --dead-code-injection true \
        --dead-code-injection-threshold 0.4 \
        --debug-protection false \
        --disable-console-output false \
        --identifier-names-generator hexadecimal \
        --log false \
        --rename-globals false \
        --rotate-string-array true \
        --self-defending true \
        --string-array true \
        --string-array-encoding 'base64' \
        --string-array-threshold 0.75 \
        --transform-object-keys true \
        --unicode-escape-sequence false
    
    if [ $? -eq 0 ]; then
        echo ""
        echo -e "${GREEN}✓ Obfuscation complete!${NC}"
        echo -e "${GREEN}✓ app.obfuscated.js generated from app.js${NC}"
        echo ""
        
        # Show file sizes
        if [ -f "app.obfuscated.js" ] && [ -f "app.js" ]; then
            source_size=$(wc -c < app.js)
            obfuscated_size=$(wc -c < app.obfuscated.js)
            echo "File sizes:"
            echo "  Source (app.js): $source_size bytes"
            echo "  Obfuscated (app.obfuscated.js): $obfuscated_size bytes"
            echo ""
        fi
        
        echo -e "${CYAN}Next steps:${NC}"
        echo "1. Test app.obfuscated.js to ensure it works"
        echo "2. Deploy app.obfuscated.js to public repo"
        echo "3. Keep app.js in private repo only"
    else
        echo -e "${RED}ERROR: Obfuscation failed!${NC}"
        return 1
    fi
}

# Simple obfuscation (fallback without javascript-obfuscator)
obfuscate_simple() {
    echo -e "${YELLOW}Using simple obfuscation...${NC}"
    echo ""
    
    if [ ! -f "app.js" ]; then
        echo -e "${RED}ERROR: app.js not found!${NC}"
        return 1
    fi
    
    echo "Applying basic transformations..."
    
    # Simple variable name replacement with formatting preserved
    sed 's/firebaseConfigParts/_0x4a/g' app.js | \
    sed 's/firebaseConfig/_c/g' | \
    sed 's/firestore/_d/g' | \
    sed 's/\bauth\b/_a/g' | \
    sed 's/currentUser/_u/g' | \
    sed 's/currentSchoolId/_s/g' | \
    sed 's/\belements\b/_e/g' | \
    sed 's/initializeApp/_i/g' | \
    sed 's/loadSections/_ls/g' | \
    sed 's/loadAssignments/_la/g' | \
    sed 's/editAssignment/_ed/g' | \
    sed 's/deleteAssignment/_dl/g' | \
    sed 's/authScreen/_as/g' | \
    sed 's/mainApp/_ma/g' | \
    sed 's/googleSignin/_gs/g' | \
    sed 's/signoutBtn/_sb/g' | \
    sed 's/userEmail/_ue/g' | \
    sed 's/sectionSelect/_ss/g' | \
    sed 's/teacherEmail/_te/g' | \
    sed 's/assignBtn/_ab/g' | \
    sed 's/refreshBtn/_rb/g' | \
    sed 's/assignmentsTable/_at/g' | \
    sed 's/^\/\/.*//' | \
    sed 's/    /  /g' > app.obfuscated.js
    
    echo ""
    echo -e "${GREEN}✓ Simple obfuscation complete!${NC}"
    echo -e "${GREEN}✓ app.obfuscated.js generated from app.js${NC}"
    echo -e "${YELLOW}⚠ For better security, install javascript-obfuscator${NC}"
    echo ""
}

# Main execution
show_header

# Handle command line arguments
case "$1" in
    "help"|"-h"|"--help")
        show_help
        exit 0
        ;;
    "simple")
        obfuscate_simple
        exit 0
        ;;
    "")
        # No arguments - run obfuscation directly
        obfuscate_code
        exit $?
        ;;
    *)
        echo -e "${RED}Unknown option: $1${NC}"
        echo "Use './obfuscate.sh help' for usage"
        exit 1
        ;;
esac
