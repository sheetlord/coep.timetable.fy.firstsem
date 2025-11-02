// Get references to all our HTML elements
const loginContainer = document.getElementById('login-container');
const adminPanel = document.getElementById('admin-panel');
const loginForm = document.getElementById('login-form');
const loginMisInput = document.getElementById('login-mis'); // Changed from email
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const logoutButton = document.getElementById('logout-button');
const noticeForm = document.getElementById('notice-form');
const noticeMessage = document.getElementById('notice-message');
const noticeExpiry = document.getElementById('notice-expiry');
const clearButton = document.getElementById('clear-button');
const publishStatus = document.getElementById('publish-status');
const currentNoticeText = document.getElementById('current-notice-text');
const currentNoticeExpiry = document.getElementById('current-notice-expiry');

// Firestore document reference
const noticeRef = db.collection('config').doc('main_notice');

// --- 1. AUTHENTICATION LOGIC ---

// Listen for login form submission
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    loginError.textContent = ''; // Clear old errors
    
    // --- THIS IS OUR "MIS" TRICK ---
    const misNumber = loginMisInput.value;
    const email = `${misNumber}@admin.local`; // Convert MIS to the email you created
    // --- END OF TRICK ---
    
    const password = loginPassword.value;
    
    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // Success! Auth state change will handle showing the panel
            console.log('Login successful', userCredential.user);
        })
        .catch((error) => {
            console.error('Login Error', error);
            if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
                loginError.textContent = 'Invalid MIS number or password.';
            } else {
                loginError.textContent = error.message;
            }
        });
});

// Listen for logout button click
logoutButton.addEventListener('click', () => {
    auth.signOut().then(() => {
        console.log('Logout successful');
    }).catch((error) => {
        console.error('Logout Error', error);
    });
});

// Main auth state listener
// This is the most important auth function.
// It runs when the page loads and any time the login state changes.
auth.onAuthStateChanged((user) => {
    if (user) {
        // User is logged in!
        loginContainer.classList.add('hidden');
        adminPanel.classList.remove('hidden');
        // Load the current notice data into the form
        loadCurrentNotice();
    } else {
        // User is logged out!
        loginContainer.classList.remove('hidden');
        adminPanel.classList.add('hidden');
    }
});

// --- 2. NOTICE MANAGEMENT LOGIC ---

// Function to load the current notice from Firestore
function loadCurrentNotice() {
    publishStatus.textContent = ''; // Clear any old status messages
    
    noticeRef.get().then((doc) => {
        if (doc.exists) {
            const data = doc.data();
            const message = data.message || '';
            const expiry = data.expiry;
            
            // Set the form fields to match
            noticeMessage.value = message;
            
            // Update the "Current Notice" preview
            const now = new Date();
            if (message && expiry && expiry.toDate() > now) {
                currentNoticeText.innerHTML = message.replace(/\n/g, '<br>'); // Show line breaks
                currentNoticeExpiry.textContent = `Expires: ${expiry.toDate().toLocaleString()}`;
            } else {
                currentNoticeText.textContent = '(No active notice is set)';
                currentNoticeExpiry.textContent = '';
            }

            if (expiry) {
                // Convert Firebase Timestamp to a string for the <input type="datetime-local">
                const expiryDate = expiry.toDate();
                // Need to format it as YYYY-MM-DDTHH:MM
                const localISOString = new Date(expiryDate.getTime() - (expiryDate.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
                noticeExpiry.value = localISOString;
            } else {
                // Set a default expiry for 24 hours from now
                const defaultExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
                const localISOString = new Date(defaultExpiry.getTime() - (defaultExpiry.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
                noticeExpiry.value = localISOString;
            }
            
        } else {
            currentNoticeText.textContent = 'No notice document found. Publish one!';
            currentNoticeExpiry.textContent = '';
        }
    }).catch(error => {
        console.error("Error loading current notice:", error);
        currentNoticeText.textContent = 'Error loading notice.';
    });
}

// Listen for the "Publish Notice" form submission
noticeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    publishStatus.textContent = 'Publishing...';
    publishStatus.className = 'status';
    
    const message = noticeMessage.value;
    const expiryString = noticeExpiry.value;
    
    if (!expiryString) {
        publishStatus.textContent = 'Please set an expiry date and time.';
        publishStatus.className = 'error';
        return;
    }
    
    // Convert the local time string back into a JS Date, then to a Firebase Timestamp
    const expiryDate = new Date(expiryString);
    const expiryTimestamp = firebase.firestore.Timestamp.fromDate(expiryDate);

    // Set the document in Firestore
    noticeRef.set({
        message: message,
        expiry: expiryTimestamp
    })
    .then(() => {
        console.log('Notice published!');
        publishStatus.textContent = 'Notice published successfully!';
        publishStatus.className = 'status';
        loadCurrentNotice(); // Reload the preview
    })
    .catch((error) => {
        console.error('Error publishing notice:', error);
        publishStatus.textContent = 'Error publishing notice.';
        publishStatus.className = 'error';
    });
});

// Listen for the "Clear" button click
clearButton.addEventListener('click', () => {
    publishStatus.textContent = 'Clearing...';
    publishStatus.className = 'status';
    
    // We "clear" a notice by setting the message to empty
    // and setting the expiry to a time in the past.
    const pastDate = new Date(0); // The year 1970
    const pastTimestamp = firebase.firestore.Timestamp.fromDate(pastDate);

    noticeRef.set({
        message: '',
        expiry: pastTimestamp
    })
    .then(() => {
        console.log('Notice cleared!');
        publishStatus.textContent = 'Notice cleared and hidden.';
        publishStatus.className = 'status';
        loadCurrentNotice(); // Reload the form and preview
    })
    .catch((error) => {
        console.error('Error clearing notice:', error);
        publishStatus.textContent = 'Error clearing notice.';
        publishStatus.className = 'error';
    });
});