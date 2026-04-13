# HOSTELMIND 🏢🤖

#### An Advanced, AI-Powered Smart Hostel Management & Issue Resolution System

[Features](#features) • [Architecture](#architecture) • [Tech Stack](#tech-stack) • [Core Algorithms](#core-algorithms) • [Getting Started](#getting-started)

---

## 📖 Overview

**HOSTELMIND** is a next-generation platform designed to revolutionize hostel management. It replaces traditional, slow, and unorganized maintenance protocols with a streamlined, AI-driven, and highly secure digital ecosystem. It integrates advanced Natural Language Processing (NLP) to automate issue routing and biometric facial recognition to ensure secure access.

---

## ✨ Features

- **Biometric Facial Recognition Authentication:** Highly secure login using `face-api.js`. Validates users via 128-float facial descriptors rather than storing raw, vulnerable images.
- **Context-Aware Two-Factor Authentication (2FA):** Elevated, role-based security layers requiring OTP verification for Admin and Warden dashboards.
- **AI Smart Complaint Classification:** NLP algorithms automatically parse complaint text to determine the correct department (e.g., Electrical, Plumbing, Mess).
- **Urgency Inference Engine:** Keyword-driven NLP dynamically tags complaints as `Low`, `Medium`, or `High` priority, instantly triggering emergency alerts for critical situations like fire or medical needs.
- **Duplicate Abatement Protocol:** Employs Token Overlap and Jaccard Similarity metrics to identify overlapping issues, preventing redundant work orders.
- **Two-Way Resolution Handshake:** A transparent workflow guaranteeing that tickets are only fully closed when both the Warden and the Student confirm the resolution.
- **Role-Based Access Dashboards:** Distinct and personalized interfaces seamlessly separating Student ticketing, Warden approvals, and Admin holistic oversight.

---

## 🏗️ Architecture

The project is structured into three primary tiers:
1. **Frontend Presentation:** Robust HTML/CSS/JS architecture providing dynamically rendered portals.
2. **Node/Express Backend:** API Gateway routing requests, executing AI NLP models natively, handling token validations, and controlling business logic (`ai_logic.js`).
3. **MongoDB Data Store:** Safely securing hashes, configurations, hostel details, user arrays, and facial descriptor floating points natively.

---

## 💻 Tech Stack

- **Frontend:** HTML5, CSS3, Vanilla JavaScript, `face-api.js` (for client-side/edge facial capture).
- **Backend Analytics:** Node.js, Express.js.
- **Database:** MongoDB (via Mongoose).
- **Security & Crypto:** `bcrypt` for password hashing, Math-randomized OTP caching, Euclidean-distance thresholding for biometric matching.

---

## 🧠 Core Algorithms

The core of `HOSTELMIND` relies on proprietary programmatic logic designed for speed and scale:
- `Algorithm 1:` **Descriptor-Based Face Matching** checks live webcam captures against database descriptors using an optimized Euclidean distance formula (threshold < 0.50).
- `Algorithm 2:` **Urgency Evaluation Check** cascades priority tags dynamically scaling user sentiment parameters.
- `Algorithm 3:` **Token Overlap Duplication Filter** merges repetitive hardware/electrical complaints reported by multiple students seamlessly.

*(See `core_algorithms_pseudocode.txt` for deeper insight into the pseudo code).*

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+ recommended)
- [MongoDB](https://www.mongodb.com/try/download/community)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Rahulboby06/HOSTELMIND.git
   cd HOSTELMIND
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   - Ensure a local or remote MongoDB instance is running. 
   - Verify connection strings inside `backend/config/db.js` or through environment variables.
   
4. **Run the Application**
   ```bash
   npm start
   ```
   *(By default, the server spins up on port 3000)*

5. **Access the Project**
   Open your browser and navigate to `http://localhost:3000` to interact with the Student, Warden or Admin interfaces.

---

## 🛡️ Security Considerations

- Biometrics are never saved as `.jpg` or `.png`. They are strictly transformed into mathematical float arrays.
- Passwords (as a fallback) are salted and hashed utilizing `bcrypt`.
- Students do not have deletion permissions over authoritative resolution logs.

*Built with ❤️ for a smarter campus environment.*