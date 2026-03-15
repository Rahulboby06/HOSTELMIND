/**
 * AI Logic Module for Hostel Management System (Stable Rule-Based Version)
 * 
 * Includes:
 * 1. Keyword-based Urgency Prediction
 * 2. Keyword-based Department Classification & Auto-correction
 * 3. Simple Token Overlap for Duplicate Detection
 */

// --- 1. CONFIGURATION & KEYWORDS ---

const DEPARTMENT_KEYWORDS = {
    'Plumbing': ['water', 'leak', 'tap', 'pipe', 'sink', 'flush', 'shower', 'bathroom', 'toilet', 'overflow', 'clogged'],
    'Electrical': ['light', 'fan', 'switch', 'socket', 'power', 'shock', 'ac', 'wire', 'bulb', 'voltage', 'circuit', 'sparking', 'burning'],
    'Mess': ['food', 'breakfast', 'lunch', 'dinner', 'stale', 'insect', 'taste', 'water', 'tea', 'milk', 'dining'],
    'Cleaning': ['dust', 'broom', 'mop', 'dirty', 'trash', 'garbage', 'bin', 'smell', 'insects', 'cockroach'],
    'Other': ['wifi', 'internet', 'noise', 'furniture', 'bed', 'chair', 'table', 'door', 'lock']
};

const URGENCY_KEYWORDS = {
    'High': [
        'shock', 'fire', 'leak', 'smoke', 'emergency', 'danger',
        'burning', 'sparking', 'explosion', 'collapsed', 'blood', 'injury'
    ],
    'Medium': [
        'broken', 'working', 'stop', 'slow', 'clogged', 'overflow',
        'smell', 'stale', 'insect', 'cockroach', 'voltage'
    ],
    'Low': [
        'dirty', 'paint', 'dust', 'cleaning', 'trash', 'wifi',
        'internet', 'furniture', 'noise', 'table', 'chair'
    ]
};

/**
 * Tokenizes text into an array of words, removing punctuation and converting to lowercase.
 */
function tokenize(text) {
    if (!text) return [];
    return text.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '') // Remove punctuation
        .split(/\s+/) // Split by whitespace
        .filter(word => word.length > 2); // Filter out tiny words
}

// --- 2. AI FEATURES ---

/**
 * FEATURE A: Rule-Based Urgency Prediction
 * Scans text for high/medium/low severity keywords.
 * Returns: { level, confidence, reasoning, sentiment_score, escalation_flag }
 */
function predictUrgency(text) {
    const tokens = tokenize(text);
    let urgency = 'Low'; // Default
    let foundKeyword = null;

    // Check for High urgency keywords first
    for (const token of tokens) {
        if (URGENCY_KEYWORDS.High.includes(token)) {
            urgency = 'High';
            foundKeyword = token;
            break;
        }
    }

    if (urgency === 'Low') {
        for (const token of tokens) {
            if (URGENCY_KEYWORDS.Medium.includes(token)) {
                urgency = 'Medium';
                foundKeyword = token;
                break;
            }
        }
    }

    return {
        level: urgency,
        confidence: 1.0,
        reasoning: foundKeyword ? `Matched keyword: ${foundKeyword}` : "No specific urgency keywords found; defaulted to Low.",
        sentiment_score: urgency === 'High' ? -3 : (urgency === 'Medium' ? -1 : 0),
        escalation_flag: urgency === 'High'
    };
}

/**
 * FEATURE B: Department Prediction & Auto-Correction
 * Counts keyword matches for each department.
 */
function predictDepartment(text, selectedDept) {
    const tokens = tokenize(text);
    const scores = {};

    Object.keys(DEPARTMENT_KEYWORDS).forEach(dept => scores[dept] = 0);

    tokens.forEach(word => {
        for (const [dept, keywords] of Object.entries(DEPARTMENT_KEYWORDS)) {
            if (keywords.includes(word)) {
                scores[dept]++;
            }
        }
    });

    let bestDept = 'Other';
    let maxScore = 0;

    for (const [dept, score] of Object.entries(scores)) {
        if (score > maxScore) {
            maxScore = score;
            bestDept = dept;
        }
    }

    const confidence = maxScore > 0 ? 0.9 : 0.4;
    const shouldCorrect = (bestDept !== selectedDept && maxScore > 0);

    return {
        predicted: bestDept,
        confidence: confidence,
        shouldCorrect: shouldCorrect,
        reasoning: shouldCorrect ? `Keywords suggest "${bestDept}" due to term matches.` : "Matches description."
    };
}

/**
 * FEATURE C: Simple Token Overlap for Duplicate Detection
 */
function detectDuplicates(newComplaintText, existingComplaints, hostelFilter) {
    let relevantComplaints = existingComplaints;
    if (hostelFilter) {
        relevantComplaints = existingComplaints.filter(c => {
            const hName = (c.hostel && (c.hostel.hostel_name || c.hostel));
            return hName === hostelFilter;
        });
    }

    if (relevantComplaints.length === 0) return { isDuplicate: false };

    const newTokens = new Set(tokenize(newComplaintText));
    if (newTokens.size === 0) return { isDuplicate: false };

    let bestMatch = null;
    let highestSim = 0;

    relevantComplaints.forEach(c => {
        const existingTokens = new Set(tokenize(c.description));
        if (existingTokens.size === 0) return;

        // Intersection / Union (Jaccard Similarity)
        const intersection = new Set([...newTokens].filter(x => existingTokens.has(x)));
        const union = new Set([...newTokens, ...existingTokens]);
        const similarity = intersection.size / union.size;

        if (similarity > highestSim) {
            highestSim = similarity;
            bestMatch = c;
        }
    });

    // Threshold for duplicate
    const DUPLICATE_THRESHOLD = 0.4;

    return {
        isDuplicate: highestSim >= DUPLICATE_THRESHOLD,
        similarityScore: highestSim,
        originalId: bestMatch ? (bestMatch._id || bestMatch.id) : null,
        matchText: bestMatch ? bestMatch.description : null
    };
}

module.exports = {
    predictUrgency,
    predictDepartment,
    detectDuplicates
};
