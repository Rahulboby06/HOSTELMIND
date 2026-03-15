const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const COMPLAINTS_FILE = path.join(DATA_DIR, 'complaints.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

// Initialize files if they don't exist
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(COMPLAINTS_FILE)) fs.writeFileSync(COMPLAINTS_FILE, JSON.stringify([], null, 2));

const readJson = (file) => {
    try {
        const data = fs.readFileSync(file, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        console.error(`Error reading ${file}:`, err);
        return [];
    }
};

const writeJson = (file, data) => {
    try {
        fs.writeFileSync(file, JSON.stringify(data, null, 2));
        return true;
    } catch (err) {
        console.error(`Error writing ${file}:`, err);
        return false;
    }
};

module.exports = {
    getUsers: () => readJson(USERS_FILE),
    getComplaints: () => readJson(COMPLAINTS_FILE),
    saveComplaint: (complaint) => {
        const complaints = readJson(COMPLAINTS_FILE);
        complaints.push(complaint);
        return writeJson(COMPLAINTS_FILE, complaints);
    },
    updateComplaints: (complaints) => writeJson(COMPLAINTS_FILE, complaints)
};
