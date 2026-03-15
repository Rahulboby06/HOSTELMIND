const mongoose = require('mongoose');

const studentComplaintSchema = new mongoose.Schema({
    complaint_text: {
        type: String,
        required: true
    },
    student_id: {
        type: String,
        required: true,
        minLength: 11,
        maxLength: 11
    },
    student_name: {
        type: String,
        required: true
    },
    warden_id: {
        type: String,
        required: true
    },
    status: {
        type: String,
        default: 'Open',
        enum: ['Open', 'Reviewed', 'Resolved']
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('StudentComplaint', studentComplaintSchema);
