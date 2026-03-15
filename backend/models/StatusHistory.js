const mongoose = require('mongoose');

const statusHistorySchema = new mongoose.Schema({
    complaint_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Complaint',
        required: true
    },
    updated_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    status_value: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('StatusHistory', statusHistorySchema);
