const mongoose = require('mongoose');
const connectDB = require('./config/db');
const Complaint = require('./models/Complaint');

const debugComments = async () => {
    try {
        await connectDB();
        console.log('--- MongoDB Comment Data Debug ---');
        const complaints = await Complaint.find({}).lean();

        complaints.forEach((c) => {
            if (c.comments && c.comments.length > 0) {
                console.log(`\nComplaint ID: ${c._id}`);
                c.comments.forEach((com) => {
                    console.log(`- Comment: "${com.comment_text}"`);
                    console.log(`  User: ${com.user_name} (${com.role})`);
                    console.log(`  user_id: ${com.user_id} (Type: ${typeof com.user_id})`);
                });
            }
        });
        process.exit(0);
    } catch (err) {
        console.error('Error during debugging:', err);
        process.exit(1);
    }
};

debugComments();
