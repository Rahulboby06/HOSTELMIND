const mongoose = require('mongoose');
const connectDB = require('./config/db');
const User = require('./models/User');
const Complaint = require('./models/Complaint');
const Hostel = require('./models/Hostel');

connectDB();

const verifyData = async () => {
    try {
        const userCount = await User.countDocuments();
        const complaintCount = await Complaint.countDocuments();
        const hostelCount = await Hostel.countDocuments();

        console.log(`Users: ${userCount}`);
        console.log(`Complaints: ${complaintCount}`);
        console.log(`Hostels: ${hostelCount}`);

        // Verify References
        const user = await User.findOne({ role: 'Student' }).populate('hostel');
        if (user && user.hostel && user.hostel.hostel_name) {
            console.log(`User Verification: Success. User ${user.username} linked to ${user.hostel.hostel_name}`);
        } else {
            console.log('User Verification: Failed or No Student found.');
        }

        const complaint = await Complaint.findOne().populate('hostel');
        if (complaint && complaint.hostel && complaint.hostel.hostel_name) {
            console.log(`Complaint Verification: Success. Complaint linked to ${complaint.hostel.hostel_name}`);
        } else {
            console.log('Complaint Verification: Failed or No Complaint found.');
        }

        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

verifyData();
