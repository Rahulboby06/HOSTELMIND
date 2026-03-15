// Common utilities

function logout() {
    localStorage.clear();
    window.location.href = 'index.html';
}

function checkAuth(requiredRole) {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
        window.location.href = 'index.html';
        return null;
    }

    const user = JSON.parse(userStr);

    // Strict role check
    if (requiredRole && user.role !== requiredRole) {
        alert('Unauthorized access: ' + user.role + ' cannot access ' + requiredRole + ' page.');

        // Redirect to correct page
        if (user.role === 'Admin') window.location.href = 'admin.html';
        else if (user.role === 'Warden') window.location.href = 'warden.html';
        else window.location.href = 'student.html';

        return null;
    }
    return user;
}
