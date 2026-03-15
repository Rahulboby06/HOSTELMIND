const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
    department_name: {
        type: String,
        required: true,
        unique: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Department', departmentSchema);
