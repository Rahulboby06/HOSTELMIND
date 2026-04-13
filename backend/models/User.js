const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['Student', 'Warden', 'Admin'],
        required: true
    },
    hostel: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Hostel',
        required: function () { return this.role === 'Student' || this.role === 'Warden'; }
    },
    name: {
        type: String,
        required: true
    },
    faceDescriptor: {
        type: [Number]
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('User', userSchema);
