const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const connectDB = require('./config/db');
const User = require('./models/User');
const Complaint = require('./models/Complaint');
const Hostel = require('./models/Hostel');

// Connect to DB
connectDB();

const importData = async () => {
    try {
        // Clear existing data
        await User.deleteMany();
        await Complaint.deleteMany();
        await Hostel.deleteMany();
        console.log('Data Cleared...');

        // Read JSON files
        const users = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/users.json'), 'utf-8'));
        const complaints = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/complaints.json'), 'utf-8'));

        // 1. Import Hostels (Extract unique hostels from data)
        const hostelNames = new Set();
        users.forEach(u => { if (u.hostel) hostelNames.add(u.hostel); });
        complaints.forEach(c => { if (c.hostel) hostelNames.add(c.hostel); });

        const hostelMap = {}; // Name -> ObjectId

        for (const name of hostelNames) {
            const newHostel = await Hostel.create({ hostel_name: name });
            hostelMap[name] = newHostel._id;
        }
        console.log('Hostels Imported!');

        // 2. Import Users (Resolve Hostel ID)
        const usersToImport = users.map(u => ({
            ...u,
            hostel: u.hostel ? hostelMap[u.hostel] : undefined
        }));

        await User.insertMany(usersToImport);
        console.log('Users Imported!');

        // 3. Import Complaints (Resolve Hostel ID)
        // Need to check if any complaint has a hostel not in map (shouldn't happen if extracted correctly)
        // Also map comments user_id if possible? 
        // For now, comments schema just has user_id as ObjectId, but legacy data implies just username/role string matching.
        // We will leave comment user_id null for legacy comments or mock it if strictly required. 
        // Schema definition for comments: user_id is ref 'User'.

        const complaintsToImport = complaints.map(c => ({
            ...c,
            hostel: hostelMap[c.hostel],
            // comments: c.comments // Comments array structure in JSON matches Schema roughly, except user_id would be missing/null, which is fine.
        }));

        await Complaint.insertMany(complaintsToImport);
        console.log('Complaints Imported!');

        console.log('Data Migration Completed!');
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

importData();
