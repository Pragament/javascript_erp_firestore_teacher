// Calculate score from result data
function calculateScoreDetails(result) {
    let correct = 0;
    let total = 0;
    
    for (let key in result) {
        if (key.includes('_Q')) {
            total++;
            if (result[key] === 'R') {
                correct++;
            }
        }
    }
    
    return {
        correct,
        total,
        percent: total > 0 ? Math.round((correct / total) * 100) : 0
    };
}

function calculateScore(result) {
    return calculateScoreDetails(result).percent;
}
