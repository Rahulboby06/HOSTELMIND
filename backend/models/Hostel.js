const mongoose = require('mongoose');

const hostelSchema = new mongoose.Schema({
    hostel_name: {
        type: String,
        required: true,
        unique: true
    },
    block_name: {
        type: String
    },
    total_floors: {
        type: Number,
        default: 3
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Hostel', hostelSchema);
