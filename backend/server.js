const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const connectDB = require('./config/db');
const { predictUrgency, predictDepartment, detectDuplicates } = require('./ai_logic');

// Import Models
const User = require('./models/User');
const Complaint = require('./models/Complaint');
const Hostel = require('./models/Hostel');
const StudentComplaint = require('./models/StudentComplaint');
const PasswordResetOTP = require('./models/PasswordResetOTP');

const app = express();
let PORT = process.env.PORT || 3000;

// ============================================================
// 2FA: In-memory OTP store (Admin & Warden)
// Admin key  : "<adminId>"        (bare MongoDB ObjectId string)
// Warden key : "warden_<userId>"  (prefixed to avoid collisions)
// Value: { otp, expiresAt }
// OTPs are cleared after use or on expiry.
// ============================================================
const otpStore = new Map();

// Connect to MongoDB
connectDB();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// --- Helper for sorting ---
const urgencyOrder = { 'High': 1, 'Medium': 2, 'Low': 3 };

// --- Auth Route ---
app.post('/api/login', async (req, res) => {
    const { username, password, role } = req.body;
    try {
        const user = await User.findOne({ username, role }).populate('hostel');

        if (user) {
            // Support both bcrypt hashes and legacy plain text passwords
            let isMatch = false;
            // bcrypt hashes start with $2a$, $2b$, or $2y$
            if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$') || user.password.startsWith('$2y$')) {
                isMatch = await bcrypt.compare(password, user.password);
            } else {
                // Fallback for existing plaintext passwords
                isMatch = (user.password === password);
            }

            if (!isMatch) {
                return res.json({ success: false, message: 'Invalid credentials' });
            }

            // Check for additional role-based validations
            if (role === 'Warden' && !user.hostel) {
                return res.json({ success: false, message: 'Warden not assigned to a hostel.' });
            }

            // ── 2FA: Admin and Warden login require OTP verification ────
            if (role === 'Admin' || role === 'Warden') {
                // Generate a shared 6-digit OTP helper (same logic for both roles)
                const otp = Math.floor(100000 + Math.random() * 900000).toString();
                const expiresAt = Date.now() + 5 * 60 * 1000; // expires in 5 minutes
                const userId = user._id.toString();

                // Key scheme: Admin → bare userId, Warden → "warden_<userId>"
                // This prevents key collisions between the two roles.
                const storeKey = role === 'Warden' ? `warden_${userId}` : userId;
                otpStore.set(storeKey, { otp, expiresAt });

                // For demo: print OTP in console instead of sending email/SMS
                console.log(`\n[2FA] ==============================`);
                console.log(`[2FA] ${role} OTP for '${username}': ${otp}`);
                console.log(`[2FA] Expires in 5 minutes.`);
                console.log(`[2FA] ==============================\n`);

                // Return a signal to the frontend to show the OTP step.
                // Do NOT return user data until OTP is verified!
                // userId and role are passed back so the frontend can send them in /verify-otp.
                // ALSO return faceData details for optional face recognition
                return res.json({ 
                    success: true, 
                    otpRequired: true, 
                    userId, 
                    role,
                    faceDataExists: !!user.faceDescriptor && user.faceDescriptor.length > 0,
                    faceData: user.faceDescriptor || null
                });
            }
            // ────────────────────────────────────────────────────────────

            // Flatten hostel object to name string for frontend compatibility
            const userObj = user.toObject();
            if (userObj.hostel && typeof userObj.hostel === 'object') {
                userObj.hostel = userObj.hostel.hostel_name;
            }

            res.json({ success: true, user: userObj });
        } else {
            res.json({ success: false, message: 'Invalid credentials' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================================
// 2FA: UNIFIED OTP Verification Route
// POST /verify-otp
// Body: { userId, role, otp }
//   role must be 'Admin' or 'Warden'
// Returns: { success: true, user } on valid OTP
//          { success: false, message } on failure
// ============================================================
app.post('/verify-otp', async (req, res) => {
    const { userId, role, otp } = req.body;

    if (!userId || !role || !otp) {
        return res.status(400).json({ success: false, message: 'userId, role, and otp are required.' });
    }

    // Validate that only privileged roles use this route (students never have 2FA)
    if (role !== 'Admin' && role !== 'Warden') {
        return res.status(403).json({ success: false, message: 'OTP verification is only for Admin and Warden roles.' });
    }

    // Derive the correct store key based on role:
    //   Admin  → bare userId
    //   Warden → "warden_<userId>"
    const storeKey = role === 'Warden' ? `warden_${userId}` : userId;
    const stored = otpStore.get(storeKey);

    if (!stored) {
        return res.json({ success: false, message: 'No OTP found. Please login again.' });
    }

    // Check expiry
    if (Date.now() > stored.expiresAt) {
        otpStore.delete(storeKey); // Clean up expired OTP
        return res.json({ success: false, message: 'OTP has expired. Please login again.' });
    }

    // Check OTP matches
    if (otp.trim() !== stored.otp) {
        return res.json({ success: false, message: 'Invalid OTP. Please try again.' });
    }

    // ── OTP is valid: delete it (one-time use) and complete login ──
    otpStore.delete(storeKey);

    try {
        const user = await User.findById(userId).populate('hostel');
        if (!user) {
            return res.status(404).json({ success: false, message: `${role} account not found.` });
        }

        // Flatten hostel object to name string for frontend compatibility
        const userObj = user.toObject();
        if (userObj.hostel && typeof userObj.hostel === 'object') {
            userObj.hostel = userObj.hostel.hostel_name;
        }

        console.log(`[2FA] OTP verified successfully for ${role}: ${user.username}`);
        res.json({ success: true, user: userObj });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error during OTP verification.' });
    }
});

// ============================================================
// 2FA: LEGACY Admin-only OTP Route (kept for backward compat)
// POST /admin/verify-otp — delegates to the same store logic
// Body: { adminId, otp }
// ============================================================
app.post('/admin/verify-otp', async (req, res) => {
    const { adminId, otp } = req.body;
    // Re-use unified route logic by injecting role = 'Admin'
    req.body.userId = adminId;
    req.body.role = 'Admin';
    // Forward to /verify-otp handler by calling the same logic inline
    if (!adminId || !otp) {
        return res.status(400).json({ success: false, message: 'adminId and otp are required.' });
    }
    const stored = otpStore.get(adminId);
    if (!stored) return res.json({ success: false, message: 'No OTP found. Please login again.' });
    if (Date.now() > stored.expiresAt) {
        otpStore.delete(adminId);
        return res.json({ success: false, message: 'OTP has expired. Please login again.' });
    }
    if (otp.trim() !== stored.otp) return res.json({ success: false, message: 'Invalid OTP. Please try again.' });
    otpStore.delete(adminId);
    try {
        const user = await User.findById(adminId).populate('hostel');
        if (!user) return res.status(404).json({ success: false, message: 'Admin account not found.' });
        const userObj = user.toObject();
        if (userObj.hostel && typeof userObj.hostel === 'object') userObj.hostel = userObj.hostel.hostel_name;
        console.log(`[2FA] OTP verified successfully for admin: ${user.username}`);
        res.json({ success: true, user: userObj });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error during OTP verification.' });
    }
});

// ============================================================
// FORGOT PASSWORD PROCESS
// ============================================================

// POST /auth/forgot-password
app.post('/auth/forgot-password', async (req, res) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ success: false, message: 'Username is required.' });
    }

    try {
        const user = await User.findOne({ username });
        if (!user) {
            // Return generic success to avoid username enumeration
            return res.json({ success: true, message: 'If the username exists, an OTP has been generated.' });
        }

        // Generate a 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry

        // Remove any existing OTP for this user
        await PasswordResetOTP.deleteMany({ userId: user._id });

        // Save new OTP
        const newOtp = new PasswordResetOTP({
            userId: user._id,
            otp,
            expiresAt
        });
        await newOtp.save();

        // For demo: print OTP in console
        console.log(`\n[PASSWORD RESET] ========================`);
        console.log(`[PASSWORD RESET] OTP for '${username}': ${otp}`);
        console.log(`[PASSWORD RESET] Expires in 5 minutes.`);
        console.log(`[PASSWORD RESET] ========================\n`);

        res.json({ success: true, message: 'OTP generated successfully.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error during forgot password.' });
    }
});

// POST /auth/reset-password
app.post('/auth/reset-password', async (req, res) => {
    const { username, otp, newPassword } = req.body;

    if (!username || !otp || !newPassword) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ success: false, message: 'Invalid request.' });
        }

        const otpRecord = await PasswordResetOTP.findOne({ userId: user._id, otp: otp.trim() });
        if (!otpRecord) {
            return res.status(400).json({ success: false, message: 'Invalid OTP.' });
        }

        if (new Date() > otpRecord.expiresAt) {
            await PasswordResetOTP.deleteMany({ userId: user._id });
            return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
        }

        // Hash new password using bcrypt
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update user's password
        user.password = hashedPassword;
        await user.save();

        // Delete OTP after successful use
        await PasswordResetOTP.deleteMany({ userId: user._id });

        console.log(`[PASSWORD RESET] Password successfully reset for user: ${username}`);
        res.json({ success: true, message: 'Password has been safely reset. You can now log in.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error during password reset.' });
    }
});

// --- Get Complaints ---
app.get('/api/complaints', async (req, res) => {
    const { role, username, hostel, includeEmergency } = req.query;
    let query = {};

    try {
        if (role === 'Warden') {
            const user = await User.findOne({ username }).populate('hostel');
            if (user && user.hostel) {
                query.hostel = user.hostel._id;
            }
        }

        let complaints = await Complaint.find(query).populate('hostel').lean();

        // Sort by Urgency (High -> Medium -> Low)
        complaints.sort((a, b) => {
            return (urgencyOrder[a.urgency] || 3) - (urgencyOrder[b.urgency] || 3);
        });

        // Transform for Frontend
        complaints = complaints.map(c => ({
            ...c,
            id: c._id.toString(),
            hostel: c.hostel ? c.hostel.hostel_name : 'Unknown', // Flatten to name
            floor: c.floor,
            roomNumber: c.roomNumber || '',
            dueDate: c.dueDate || null,
            targetStudentId: c.targetStudentId || null,
            targetStudentName: c.targetStudentName || null,
            comments: c.comments || []
        }));

        if (role === 'Warden' && includeEmergency === 'true') {
            const emergencyAlerts = complaints.filter(c => c.urgency === 'High');
            return res.json({ complaints, emergencyAlerts });
        }

        res.json(complaints);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- Submit Complaint ---
app.post('/api/complaints', async (req, res) => {
    try {
        const { studentName, description, category, hostel, floor, type, roomNumber, targetStudentId, targetStudentName } = req.body;

        // resolve Hostel Name to ID
        let hostelDoc = await Hostel.findOne({ hostel_name: hostel });
        if (!hostelDoc) {
            hostelDoc = await Hostel.create({ hostel_name: hostel });
        }

        // 1. Check for Duplicates
        const existingComplaints = await Complaint.find({
            hostel: hostelDoc._id,
            category,
            status: 'Open',
            type
        }).populate('hostel');

        const duplicateCheck = detectDuplicates(description, existingComplaints);

        if (duplicateCheck.isDuplicate) {
            await Complaint.findByIdAndUpdate(duplicateCheck.originalId, {
                $inc: { studentCount: 1 }
            });
            return res.json({ success: true, isDuplicate: true, message: 'Duplicate complaint detected and merged.' });
        }

        // 2. AI Auto-Correction
        const deptPrediction = predictDepartment(description, category);
        const correction = {
            finalCategory: deptPrediction.predicted,
            isAutoCorrected: deptPrediction.shouldCorrect,
            reason: deptPrediction.reasoning,
            similarTo: null
        };

        // 3. AI Urgency Analysis
        const aiAnalysis = predictUrgency(description);

        // 4. Create New Complaint
        const createdAt = new Date();
        const dueDate = new Date(createdAt.getTime() + 2 * 24 * 60 * 60 * 1000); // +2 days

        const newComplaint = new Complaint({
            studentName,
            description,
            category: correction.finalCategory,
            originalCategory: category,
            hostel: hostelDoc._id, // Save ID
            floor: parseInt(floor),
            roomNumber,
            type,
            urgency: aiAnalysis.level,
            urgencyReason: aiAnalysis.reasoning, // Note: ai_logic returns 'reasoning', server used 'reason'
            aiConfidence: aiAnalysis.confidence,
            isAutoCorrected: correction.isAutoCorrected,
            autoCorrectReason: correction.reason,
            similarTo: correction.similarTo,
            dueDate,
            targetStudentId,
            targetStudentName,
            comments: []
        });

        if (type === 'Student Behaviour') {
            const studentReport = new StudentComplaint({
                complaint_text: description,
                student_id: targetStudentId,
                student_name: targetStudentName,
                warden_id: studentName || 'Warden', // Warden's name is in studentName field for this POST
                status: 'Open'
            });
            await studentReport.save();
            return res.json({ success: true, message: 'Behaviour complaint registered in StudentComplaint collection.' });
        }

        const savedComplaint = await newComplaint.save();

        // Response formatting
        const responseComplaint = savedComplaint.toObject();
        responseComplaint.id = responseComplaint._id;
        responseComplaint.hostel = hostel; // Return name as sent by client

        res.json({
            success: true,
            isDuplicate: false,
            aiNote: correction.isAutoCorrected ? `Category auto-corrected to ${correction.finalCategory}` : null,
            complaint: responseComplaint
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- Add Comment Route ---
app.post('/api/complaints/:id/comment', async (req, res) => {
    const { id } = req.params;
    const { username, role, comment, user_id } = req.body;

    if (!comment || !comment.trim()) {
        return res.status(400).json({ success: false, message: 'Comment cannot be empty' });
    }

    try {
        const complaint = await Complaint.findById(id);
        if (!complaint) {
            return res.status(404).json({ success: false, message: 'Complaint not found' });
        }

        const newComment = {
            user_id: user_id || req.body.userId, // Support both formats
            user_name: username,
            role: role,
            comment_text: comment,
            created_at: new Date()
        };

        complaint.comments.push(newComment);
        await complaint.save();

        // Get the newly added comment (with its generated _id)
        const savedComment = complaint.comments[complaint.comments.length - 1];

        res.json({ success: true, message: 'Comment added', comment: savedComment });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- Delete Comment Route ---
app.delete('/api/complaints/:complaintId/comment/:commentId', async (req, res) => {
    const { complaintId, commentId } = req.params;
    const { role, userId } = req.query; // Authenticating via query params for this setup

    try {
        const complaint = await Complaint.findById(complaintId);
        if (!complaint) {
            return res.status(404).json({ success: false, message: 'Complaint not found' });
        }

        // Find the specific comment using Mongoose id() helper
        const comment = complaint.comments.id(commentId);
        if (!comment) {
            return res.status(404).json({ success: false, message: 'Comment not found' });
        }

        // --- Role-Based Authorization Logic ---
        let canDelete = false;

        if (role === 'Admin') {
            // 1. Admin: Can delete ANY comment
            canDelete = true;
        } else if (role === 'Student') {
            // 2. Student: Can delete ONLY their own comment
            const requesterId = userId || req.query.id; // Handle both userId and id query params

            if (comment.user_id && requesterId && comment.user_id.toString() === requesterId.toString()) {
                canDelete = true;
            } else {
                console.log(`[Auth Failure] Student ${requesterId} attempted to delete comment owned by ${comment.user_id}`);
                return res.status(403).json({ success: false, message: 'Students can only delete their own comments.' });
            }
        } else if (role === 'Warden') {
            // 3. Warden: Cannot delete any comments
            return res.status(403).json({ success: false, message: 'Wardens do not have permission to delete comments.' });
        }

        if (!canDelete) {
            return res.status(403).json({ success: false, message: 'Unauthorized deletion attempt.' });
        }

        // Securely remove the comment
        comment.deleteOne(); // Mongoose subdoc delete method
        await complaint.save();

        res.json({ success: true, message: 'Comment deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- STATS (Admin/Warden Analytics) ---
app.get('/api/stats', async (req, res) => {
    try {
        const complaints = await Complaint.find().populate('hostel').lean();

        const stats = {
            total: complaints.length,
            byHostel: {},
            byCategory: {},
            byUrgency: { 'High': 0, 'Medium': 0, 'Low': 0 },
            systemicIssues: []
        };

        complaints.forEach(c => {
            const hostelName = c.hostel ? c.hostel.hostel_name : 'Unknown';

            // Hostel Check
            stats.byHostel[hostelName] = (stats.byHostel[hostelName] || 0) + 1;
            // Category Check
            stats.byCategory[c.category] = (stats.byCategory[c.category] || 0) + 1;
            // Urgency Check
            stats.byUrgency[c.urgency] = (stats.byUrgency[c.urgency] || 0) + 1;
        });

        // Detect Systemic Issues
        const hostelCatMap = {};
        complaints.forEach(c => {
            const hostelName = c.hostel ? c.hostel.hostel_name : 'Unknown';
            const key = `${hostelName}-${c.category}`;
            hostelCatMap[key] = (hostelCatMap[key] || 0) + 1;
        });

        Object.entries(hostelCatMap).forEach(([key, count]) => {
            if (count >= 3) {
                stats.systemicIssues.push({
                    issue: key.replace('-', ' - '),
                    count: count,
                    alert: 'High frequency of similar issues'
                });
            }
        });

        res.json(stats);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- ADMIN COMPLAINT MANAGEMENT (Update Status) ---
app.post('/api/complaints/update', async (req, res) => {
    const { id, status } = req.body;
    try {
        const updatedComplaint = await Complaint.findByIdAndUpdate(
            id,
            { status: status },
            { returnDocument: 'after' }
        );

        if (updatedComplaint) {
            res.json({ success: true, message: 'Status updated' });
        } else {
            res.status(404).json({ success: false, message: 'Complaint not found' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- ADMIN COMPLAINT MANAGEMENT (Update Priority) ---
app.patch('/api/complaints/:id/priority', async (req, res) => {
    const { id } = req.params;
    const { urgency_level, role } = req.body;

    if (role !== 'Admin') {
        return res.status(403).json({ success: false, message: 'Only admin can change priority' });
    }

    if (!['High', 'Medium', 'Low'].includes(urgency_level)) {
        return res.status(400).json({ success: false, message: 'Invalid priority level' });
    }

    try {
        const updatedComplaint = await Complaint.findByIdAndUpdate(
            id,
            { urgency: urgency_level },
            { new: true }
        );

        if (updatedComplaint) {
            res.json({ success: true, message: 'Priority updated correctly', complaint: updatedComplaint });
        } else {
            res.status(404).json({ success: false, message: 'Complaint not found' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- ADMIN USER MANAGEMENT ---
app.get('/api/users', async (req, res) => {
    try {
        const users = await User.find().populate('hostel').lean();

        // Flatten hostel for frontend
        const flatUsers = users.map(u => ({
            ...u,
            hostel: u.hostel ? u.hostel.hostel_name : u.hostel
        }));

        res.json(flatUsers);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.post('/api/users', async (req, res) => {
    const { username, password, role, hostel, name, faceData } = req.body;
    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Username already exists' });
        }

        if (!password) {
            return res.status(400).json({ success: false, message: 'Password is required' });
        }

        let hostelId = undefined;
        if (hostel) {
            let hostelDoc = await Hostel.findOne({ hostel_name: hostel });
            if (!hostelDoc) {
                hostelDoc = await Hostel.create({ hostel_name: hostel });
            }
            hostelId = hostelDoc._id;
        }

        // Securely hash the password before saving
        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new User({
            username,
            password: hashedPassword,
            role,
            hostel: hostelId,
            name,
            faceDescriptor: req.body.faceDescriptor || null
        });

        await newUser.save();
        res.json({ success: true, message: 'User added' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

app.delete('/api/users/:username', async (req, res) => {
    const { username } = req.params;
    try {
        await User.findOneAndDelete({ username });
        res.json({ success: true, message: 'User removed' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- ADMIN: EXTEND DEADLINE ROUTE ---
app.patch('/api/complaints/:id/extend-deadline', async (req, res) => {
    const { id } = req.params;
    const { dueDate, role } = req.body;

    if (role !== 'Admin') {
        return res.status(403).json({ success: false, message: 'Only Admin can extend deadlines.' });
    }

    if (!dueDate) {
        return res.status(400).json({ success: false, message: 'dueDate is required.' });
    }

    const parsedDate = new Date(dueDate);
    if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid date format.' });
    }

    try {
        const complaint = await Complaint.findById(id);
        if (!complaint) {
            return res.status(404).json({ success: false, message: 'Complaint not found.' });
        }

        complaint.dueDate = parsedDate;
        await complaint.save();

        res.json({ success: true, message: 'Deadline extended successfully.', dueDate: complaint.dueDate });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- WARDEN RESOLVE ROUTE ---
app.patch('/api/complaints/:id/warden-resolve', async (req, res) => {
    const { id } = req.params;
    const { role } = req.body;

    if (role !== 'Warden') {
        return res.status(403).json({ success: false, message: 'Only wardens can use this action.' });
    }

    try {
        const complaint = await Complaint.findById(id);
        if (!complaint) {
            return res.status(404).json({ success: false, message: 'Complaint not found.' });
        }

        complaint.wardenResolved = true;

        if (complaint.studentResolved) {
            complaint.status = 'Resolved';
        } else {
            complaint.status = 'Pending Confirmation';
        }

        await complaint.save();
        res.json({ success: true, message: 'Warden confirmation recorded.', status: complaint.status, wardenResolved: complaint.wardenResolved, studentResolved: complaint.studentResolved });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- REOPEN COMPLAINT ROUTE ---
app.patch('/api/complaints/:id/reopen', async (req, res) => {
    const { id } = req.params;
    const { role, username } = req.body;

    if (role !== 'Student' && role !== 'Admin') {
        return res.status(403).json({ success: false, message: 'Unauthorized action.' });
    }

    try {
        const complaint = await Complaint.findById(id);
        if (!complaint) {
            return res.status(404).json({ success: false, message: 'Complaint not found.' });
        }

        // Security: Ensure only the creator (or Admin) can reopen
        if (role === 'Student' && complaint.studentName !== username) {
            return res.status(403).json({ success: false, message: 'You can only reopen your own complaints.' });
        }

        complaint.studentResolved = false;
        complaint.status = 'Pending Confirmation'; // Move back from Fully Resolved or Pending

        await complaint.save();
        res.json({ success: true, message: 'Complaint reopened successfully.', status: complaint.status });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- STUDENT BEHAVIOUR VIEW ROUTES ---

// Student: See complaints filed against them
app.get('/api/student/my-behaviour-complaints', async (req, res) => {
    const { student_id } = req.query;
    if (!student_id) return res.status(400).json({ success: false, message: 'student_id is required' });

    try {
        const complaints = await StudentComplaint.find({ student_id }).sort({ createdAt: -1 });
        res.json(complaints);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Admin: See all behaviour complaints
app.get('/api/admin/student-complaints', async (req, res) => {
    try {
        const complaints = await StudentComplaint.find({}).sort({ createdAt: -1 });
        res.json(complaints);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Warden: See all behaviour complaints
app.get('/api/warden/student-complaints', async (req, res) => {
    const { role } = req.query;
    if (role !== 'Warden') {
        return res.status(403).json({ success: false, message: 'Access denied. Only Wardens can view these complaints.' });
    }

    try {
        const complaints = await StudentComplaint.find({}).sort({ createdAt: -1 });
        res.json(complaints);
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- STUDENT RESOLVE ROUTE ---
app.patch('/api/complaints/:id/student-resolve', async (req, res) => {
    const { id } = req.params;
    const { role, username } = req.body;

    if (role !== 'Student') {
        return res.status(403).json({ success: false, message: 'Only students can use this action.' });
    }

    try {
        const complaint = await Complaint.findById(id);
        if (!complaint) {
            return res.status(404).json({ success: false, message: 'Complaint not found.' });
        }

        // Ensure only the student who created the complaint can resolve it
        if (complaint.studentName !== username) {
            return res.status(403).json({ success: false, message: 'You can only resolve your own complaints.' });
        }

        complaint.studentResolved = true;

        if (complaint.wardenResolved) {
            complaint.status = 'Resolved';
        } else {
            complaint.status = 'Pending Confirmation';
        }

        await complaint.save();
        res.json({ success: true, message: 'Student confirmation recorded.', status: complaint.status, wardenResolved: complaint.wardenResolved, studentResolved: complaint.studentResolved });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// --- Robust Server Startup ---
function startServer(port) {
    const server = app.listen(port, () => {
        console.log(`\n🚀 Server is running!`);
        console.log(`🔗 Local: http://localhost:${port}`);
        console.log(`📂 Frontend: http://localhost:${port}/index.html\n`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`⚠️  Port ${port} is already in use. Trying port ${port + 1}...`);
            startServer(port + 1);
        } else {
            console.error('❌ Server error:', err);
        }
    });
}

startServer(PORT);
