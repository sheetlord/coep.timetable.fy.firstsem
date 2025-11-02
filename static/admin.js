// --- Helper Functions ---
function getTomorrowMidnight() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0); 
    return tomorrow;
}
function formatDateForInput(date) {
    const localISOString = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    return localISOString;
}
// --- End Helper Functions ---

// Get references to all our HTML elements
const loginContainer = document.getElementById('login-container');
const adminPanel = document.getElementById('admin-panel');
const loginForm = document.getElementById('login-form');
const loginMisInput = document.getElementById('login-mis');
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
    
    // Get the raw input and trim whitespace
    const misNumberInput = loginMisInput.value.trim(); 
    const password = loginPassword.value;

    // Validation
    if (misNumberInput === "") {
        loginError.textContent = 'Please enter your MIS number.';
        return; 
    }
    if (password === "") {
        loginError.textContent = 'Please enter your password.';
        return;
    }

    // --- Smart Email Logic ---
    let email;
    if (misNumberInput.includes('@admin.local')) {
        email = misNumberInput;
    } else {
        email = `${misNumberInput}@admin.local`;
    }
    // --- End Smart Email Logic ---

    console.log("Attempting to log in with email:", email);

    // --- 👇 NEW CODE TO SET 'SESSION' PERSISTENCE 👇 ---
    // This tells Firebase to only remember the login for this tab
    auth.setPersistence(firebase.auth.Auth.Persistence.SESSION)
      .then(() => {
        // Now that persistence is set, sign them in
        return auth.signInWithEmailAndPassword(email, password);
      })
    // --- 👆 END OF NEW CODE 👆 ---
      .then((userCredential) => {
            // Success!
            console.log('Login successful', userCredential.user);
            // The auth.onAuthStateChanged listener will handle showing the panel
        })
        .catch((error) => {
            console.error('Login Error', error);
            if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-email') {
                loginError.textContent = 'Invalid MIS number or password.';
            } else {
                loginError.textContent = 'An unknown error occurred. Please try again.';
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
auth.onAuthStateChanged((user) => {
    if (user) {
        // User is logged in!
        loginContainer.classList.add('hidden');
        adminPanel.classList.remove('hidden'); 
        loadCurrentNotice(); // Load the current notice data into the form
    } else {
        // User is logged out!
        loginContainer.classList.remove('hidden');
        adminPanel.classList.add('hidden');
    }
});

// --- 2. NOTICE MANAGEMENT LOGIC ---

function loadCurrentNotice() {
    publishStatus.textContent = ''; // Clear any old status messages
    
    noticeRef.get().then((doc) => {
        const now = new Date();
        const defaultExpiryDate = getTomorrowMidnight(); 
        
        if (doc.exists) {
            const data = doc.data();
            const message = data.message || '';
            const expiry = data.expiry; 
            
            noticeMessage.value = message;
            
            if (message && expiry && expiry.toDate() > now) {
                currentNoticeText.innerHTML = message.replace(/\n/g, '<br>');
                currentNoticeExpiry.textContent = `Expires: ${expiry.toDate().toLocaleString()}`;
                noticeExpiry.value = formatDateForInput(expiry.toDate()); 
            } else {
                currentNoticeText.textContent = '(No active notice is set)';
                currentNoticeExpiry.textContent = '';
                noticeExpiry.value = formatDateForInput(defaultExpiryDate); 
            }
        } else {
            currentNoticeText.textContent = 'No notice document found. Publish one!';
            currentNoticeExpiry.textContent = '';
            noticeExpiry.value = formatDateForInput(defaultExpiryDate); 
        }
    }).catch(error => {
        console.error("Error loading current notice:", error);
        currentNoticeText.textContent = 'Error loading notice.';
        noticeExpiry.value = formatDateForInput(getTomorrowMidnight());
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
    
    const expiryDate = new Date(expiryString);
    const expiryTimestamp = firebase.firestore.Timestamp.fromDate(expiryDate);

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