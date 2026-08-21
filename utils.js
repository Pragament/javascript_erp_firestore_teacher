// Calculate score from result data
function calculateScoreDetails(result) {
    let correct = 0;
    let total = 0;
    
    for (let key in result) {
        if (key.includes('_Q')) {
            total++;
            if (/^r(?:_[a-z0-9]+)?$/i.test(String(result[key] || '').trim())) {
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

function getAnalyticsElementLabel(element) {
    const label = (
        element.getAttribute('aria-label') ||
        element.getAttribute('title') ||
        element.innerText ||
        element.textContent ||
        element.id ||
        element.className ||
        element.tagName
    );
    return String(label || '').replace(/\s+/g, ' ').trim().slice(0, 120);
}

function trackAppEvent(eventName, params = {}) {
    if (typeof window.gtag !== 'function') return;

    window.gtag('event', eventName, {
        page_path: window.location.pathname,
        page_location: window.location.href,
        ...params,
    });
}

window.trackAppEvent = trackAppEvent;

document.addEventListener('click', (event) => {
    const clickable = event.target.closest('button, a.btn, [role="button"]');
    if (!clickable) return;

    const isPromptCopy = clickable.classList.contains('ai-copy-prompt-btn');
    const label = getAnalyticsElementLabel(clickable);
    const params = {
        button_label: label,
        button_id: clickable.id || '',
        button_classes: String(clickable.className || '').slice(0, 160),
        button_type: clickable.tagName.toLowerCase(),
        button_href: clickable.getAttribute('href') || '',
        copy_target: clickable.dataset?.copyTarget || '',
    };

    if (isPromptCopy) {
        trackAppEvent('ai_prompt_copy', {
            ...params,
            prompt_target: clickable.dataset?.copyTarget || '',
        });
    }

    trackAppEvent('button_click', params);
}, true);
