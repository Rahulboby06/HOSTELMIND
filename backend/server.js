const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const { predictUrgency, predictDepartment, detectDuplicates } = require('./ai_logic');

// Import Models
const User = require('./models/User');
const Complaint = require('./models/Complaint');
const Hostel = require('./models/Hostel');
const StudentComplaint = require('./models/StudentComplaint');

const app = express();
const PORT = 3000;

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
        const user = await User.findOne({ username, password, role }).populate('hostel');

        if (user) {
            // Check for additional role-based validations
            if (role === 'Warden' && !user.hostel) {
                return res.json({ success: false, message: 'Warden not assigned to a hostel.' });
            }

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
    const { username, role, hostel, name } = req.body;
    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'Username already exists' });
        }

        let hostelId = undefined;
        if (hostel) {
            let hostelDoc = await Hostel.findOne({ hostel_name: hostel });
            if (!hostelDoc) {
                hostelDoc = await Hostel.create({ hostel_name: hostel });
            }
            hostelId = hostelDoc._id;
        }

        const newUser = new User({
            username,
            password: 'password', // Default
            role,
            hostel: hostelId,
            name
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

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Frontend accessible via http://localhost:${PORT}/index.html`);
});
