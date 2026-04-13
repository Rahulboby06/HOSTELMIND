const mongoose = require('mongoose');
const User = require('./backend/models/User');
const PasswordResetOTP = require('./backend/models/PasswordResetOTP');
const connectDB = require('./backend/config/db');
const bcrypt = require('bcrypt');
const http = require('http');

async function testApi(path, data) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: 3000,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(JSON.stringify(data))
            }
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => resolve(JSON.parse(body)));
        });
        req.on('error', reject);
        req.write(JSON.stringify(data));
        req.end();
    });
}

(async () => {
    try {
        await connectDB();
        
        console.log('--- Test 1: Plaintext Legacy Login ---');
        // Let's test admin login assuming 'admin' 'password' is the default plaintext
        let res = await testApi('/api/login', { username: 'admin', password: 'password', role: 'Admin' });
        console.log('Admin legacy login:', res.success ? 'Success' : 'Fail - ' + res.message);
        
        console.log('\n--- Test 2: Add New User with Bcrypt ---');
        // Add a test user
        await User.deleteOne({ username: 'testwarden' });
        res = await testApi('/api/users', { username: 'testwarden', password: 'newpassword', role: 'Warden', name: 'Test Warden', hostel: 'C1' });
        console.log('Add User:', res.success ? 'Success' : 'Fail - ' + res.message);

        console.log('\n--- Test 3: Log in with Bcrypt ---');
        res = await testApi('/api/login', { username: 'testwarden', password: 'newpassword', role: 'Warden' });
        console.log('Bcrypt Login:', res.success ? 'Success' : 'Fail - ' + res.message);

        console.log('\n--- Test 4: Forgot Password Flow ---');
        res = await testApi('/auth/forgot-password', { username: 'testwarden' });
        console.log('Request OTP:', res.success ? 'Success' : 'Fail - ' + res.message);
        
        // Fetch OTP directly from DB
        const userDoc = await User.findOne({ username: 'testwarden' });
        const otpDoc = await PasswordResetOTP.findOne({ userId: userDoc._id });
        if(!otpDoc) throw new Error("OTP not found in DB");
        console.log('OTP grabbed from DB:', otpDoc.otp);

        console.log('\n--- Test 5: Reset Password ---');
        res = await testApi('/auth/reset-password', { username: 'testwarden', otp: otpDoc.otp, newPassword: 'resetpassword' });
        console.log('Reset Password:', res.success ? 'Success' : 'Fail - ' + res.message);

        console.log('\n--- Test 6: Log in with Resetted Password ---');
        res = await testApi('/api/login', { username: 'testwarden', password: 'resetpassword', role: 'Warden' });
        console.log('Login with new pass:', res.success ? 'Success' : 'Fail - ' + res.message);

        // cleanup
        await User.deleteOne({ username: 'testwarden' });

    } catch (e) {
        console.error(e);
    } finally {
        mongoose.connection.close();
    }
})();
