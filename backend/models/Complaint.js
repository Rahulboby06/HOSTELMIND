const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    user_name: String,
    role: String,
    comment_text: String,
    created_at: {
        type: Date,
        default: Date.now
    }
});

const complaintSchema = new mongoose.Schema({
    studentName: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    originalCategory: {
        type: String
    },
    hostel: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hostel',
        required: true
    },
    floor: {
        type: Number,
        required: true
    },
    roomNumber: {
        type: String
    },
    type: {
        type: String,
        required: true
    },
    status: {
        type: String,
        default: 'Open',
        enum: ['Open', 'In Progress', 'Pending Confirmation', 'Resolved']
    },
    wardenResolved: {
        type: Boolean,
        default: false
    },
    studentResolved: {
        type: Boolean,
        default: false
    },
    studentCount: {
        type: Number,
        default: 1
    },
    urgency: {
        type: String,
        enum: ['High', 'Medium', 'Low'],
        default: 'Low'
    },
    urgencyReason: String,
    aiConfidence: Number,
    isAutoCorrected: {
        type: Boolean,
        default: false
    },
    autoCorrectReason: String,
    similarTo: String,
    dueDate: {
        type: Date
    },
    targetStudentId: {
        type: String
    },
    targetStudentName: {
        type: String
    },
    comments: [commentSchema]
}, {
    timestamps: true,
    toJSON: {
        virtuals: true,
        transform: function (doc, ret) {
            ret.id = ret._id;
            delete ret._id;
            delete ret.__v;
        }
    },
    toObject: { virtuals: true }
});

module.exports = mongoose.model('Complaint', complaintSchema);
