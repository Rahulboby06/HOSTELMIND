const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hostel_management', {
            // New Mongoose versions don't need these options, but keeping them if using older version
            // useNewUrlParser: true, 
            // useUnifiedTopology: true, 
        });
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
