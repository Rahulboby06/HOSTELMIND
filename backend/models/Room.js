const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    room_number: {
        type: String,
        required: true
    },
    floor_number: {
        type: Number,
        required: true
    },
    hostel_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hostel'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Room', roomSchema);
