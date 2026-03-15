const dataStore = require('./data_store');

console.log('Generating dummy data...');

const complaints = [
    {
        id: "101",
        studentName: "student1",
        description: "Fire sparks coming from the switch board in room 101",
        originalCategory: "Electrical",
        category: "Electrical",
        hostel: "Hostel A",
        floor: "1",
        type: "Hostel Complaint",
        timestamp: new Date().toISOString(),
        status: "Open",
        studentCount: 1,
        urgency: "High",
        urgencyReason: "Detected critical keyword: \"sparks\"",
        aiConfidence: 0.95,
        isAutoCorrected: false
    },
    {
        id: "102",
        studentName: "student2",
        description: "Wifi is very slow since yesterday",
        originalCategory: "Other",
        category: "Other",
        hostel: "Hostel A",
        floor: "2",
        type: "Hostel Complaint",
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        status: "Open",
        studentCount: 1,
        urgency: "Low",
        urgencyReason: "No critical keywords found. Routine issue.",
        aiConfidence: 0.70,
        isAutoCorrected: false
    },
    {
        id: "103",
        studentName: "student3",
        description: "Water overflowing from bathroom sink tap",
        originalCategory: "Cleaning",
        category: "Plumbing", // Auto-corrected
        hostel: "Hostel A",
        floor: "1",
        type: "Hostel Complaint",
        timestamp: new Date().toISOString(),
        status: "Open",
        studentCount: 1,
        urgency: "High",
        urgencyReason: "Detected critical keyword: \"overflowing\"",
        aiConfidence: 0.95,
        isAutoCorrected: true,
        autoCorrectReason: "Keywords suggest \"Plumbing\" due to term matches."
    },
    {
        id: "104",
        studentName: "student4",
        description: "Fan is rotating very slowly",
        originalCategory: "Electrical",
        category: "Electrical",
        hostel: "Hostel B",
        floor: "3",
        type: "Hostel Complaint",
        timestamp: new Date().toISOString(),
        status: "Open",
        studentCount: 1,
        urgency: "Medium",
        urgencyReason: "Detected maintenance keyword: \"slowly\"",
        aiConfidence: 0.85,
        isAutoCorrected: false
    },
    {
        id: "105",
        studentName: "student5",
        description: "Fan not working properly",
        originalCategory: "Electrical",
        category: "Electrical",
        hostel: "Hostel B",
        floor: "3",
        type: "Hostel Complaint",
        timestamp: new Date().toISOString(),
        status: "Open",
        studentCount: 3, // Duplicates
        urgency: "Medium",
        urgencyReason: "Detected maintenance keyword: \"fan\"",
        aiConfidence: 0.85,
        isAutoCorrected: false,
        similarTo: "Fan is rotating very slowly"
    }
];

// Write to file
dataStore.updateComplaints(complaints);
console.log('Dummy data created!');
