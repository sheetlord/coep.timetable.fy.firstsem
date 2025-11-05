// --- Helper Functions (Unchanged) ---
function getTomorrowMidnight() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0); 
    return tomorrow;
}
function formatDateForInput(date) {
    if (!date) return '';
    const localISOString = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
    return localISOString;
}
function formatReadableDate(timestamp) {
    if (!timestamp) return 'N/A';
    return timestamp.toDate().toLocaleString('en-US', {
        month: 'short', 
        day: 'numeric', 
        hour: 'numeric', 
        minute: '2-digit'
    });
}
// --- End Helper Functions ---


// --- 1. GET ALL ELEMENTS ---
// (Login, Panel, Nav, Notice elements unchanged...)
const loginContainer = document.getElementById('login-container');
const loginForm = document.getElementById('login-form');
const loginMisInput = document.getElementById('login-mis');
const loginPassword = document.getElementById('login-password');
const loginError = document.getElementById('login-error');
const adminPanel = document.getElementById('admin-panel');
const logoutButton = document.getElementById('logout-button');
const panelTitle = document.getElementById('panel-title');
const navNoticesBtn = document.getElementById('nav-notices');
const navClassesBtn = document.getElementById('nav-classes');
const noticePanel = document.getElementById('notice-manager-panel');
const classPanel = document.getElementById('extra-class-panel');
const noticeForm = document.getElementById('notice-form');
const noticeMessage = document.getElementById('notice-message');
const noticeExpiry = document.getElementById('notice-expiry');
const publishStatus = document.getElementById('publish-status');
const currentNoticesList = document.getElementById('current-notices-list');
const noNoticesMsg = document.getElementById('no-notices-msg');

// --- UPDATED: Extra Class elements ---
const extraClassForm = document.getElementById('extra-class-form');
const ecSubject = document.getElementById('ec-subject');
const ecDivision = document.getElementById('ec-division');
const ecDate = document.getElementById('ec-date');
const ecStartTime = document.getElementById('ec-start-time'); // Now a <select>
const ecEndTime = document.getElementById('ec-end-time');     // Now a <select>
const ecRoom = document.getElementById('ec-room');
const ecPublishStatus = document.getElementById('ec-publish-status');
const currentClassesList = document.getElementById('current-classes-list');
const noClassesMsg = document.getElementById('no-classes-msg');

// (Firestore/Global vars unchanged)
const noticesCollection = db.collection('notices');
const extraClassesCollection = db.collection('extraClasses'); 
let noticeListener = null;
let classListener = null; 
let subjectDivisionMap = {};

// --- 2. AUTHENTICATION LOGIC (Unchanged) ---
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    loginError.textContent = ''; 
    const misNumberInput = loginMisInput.value.trim(); 
    const password = loginPassword.value;
    if (misNumberInput === "" || password === "") {
        loginError.textContent = 'Please enter MIS and password.';
        return; 
    }
    let email = misNumberInput.includes('@admin.local') ? misNumberInput : `${misNumberInput}@admin.local`;

    auth.setPersistence(firebase.auth.Auth.Persistence.SESSION)
      .then(() => auth.signInWithEmailAndPassword(email, password))
      .then((userCredential) => console.log('Login successful', userCredential.user))
      .catch((error) => {
          console.error('Login Error', error);
          loginError.textContent = 'Invalid MIS number or password.';
      });
});
logoutButton.addEventListener('click', () => {
    auth.signOut().catch((error) => console.error('Logout Error', error));
});

auth.onAuthStateChanged((user) => {
    if (user) {
        loginContainer.classList.add('hidden');
        adminPanel.classList.remove('hidden'); 
        showNoticePanel(); 
        loadAdminData(); 
        populateTimeDropdowns(); // <-- NEW: Populate time dropdowns
        listenForActiveNotices(); 
        listenForExtraClasses(); 
        noticeExpiry.value = formatDateForInput(getTomorrowMidnight());
    } else {
        loginContainer.classList.remove('hidden');
        adminPanel.classList.add('hidden');
        if (noticeListener) noticeListener();
        if (classListener) classListener(); 
    }
});


// --- 3. TAB NAVIGATION LOGIC (Unchanged) ---
navNoticesBtn.addEventListener('click', showNoticePanel);
navClassesBtn.addEventListener('click', showClassPanel);
function showNoticePanel() {
    panelTitle.textContent = 'Notice Manager';
    navNoticesBtn.classList.add('active');
    navClassesBtn.classList.remove('active');
    noticePanel.classList.remove('hidden');
    classPanel.classList.add('hidden');
}
function showClassPanel() {
    panelTitle.textContent = 'Extra Class Manager';
    navNoticesBtn.classList.remove('active');
    navClassesBtn.classList.add('active');
    noticePanel.classList.add('hidden');
    classPanel.classList.remove('hidden');
}


// --- 4. ADMIN DATA & TIME LOADERS (UPDATED) ---

// --- NEW: Function to populate time dropdowns ---
function populateTimeDropdowns() {
    // 08:30 AM to 05:30 PM
    const startTimes = [
        { text: "08:30 AM", value: "08:30" }, { text: "09:30 AM", value: "09:30" },
        { text: "10:30 AM", value: "10:30" }, { text: "11:30 AM", value: "11:30" },
        { text: "12:30 PM", value: "12:30" }, { text: "01:30 PM", value: "13:30" },
        { text: "02:30 PM", value: "14:30" }, { text: "03:30 PM", value: "15:30" },
        { text: "04:30 PM", value: "16:30" }, { text: "05:30 PM", value: "17:30" }
    ];
    // 09:30 AM to 06:30 PM
    const endTimes = [
        { text: "09:30 AM", value: "09:30" }, { text: "10:30 AM", value: "10:30" },
        { text: "11:30 AM", value: "11:30" }, { text: "12:30 PM", value: "12:30" },
        { text: "01:30 PM", value: "13:30" }, { text: "02:30 PM", value: "14:30" },
        { text: "03:30 PM", value: "15:30" }, { text: "04:30 PM", value: "16:30" },
        { text: "05:30 PM", value: "17:30" }, { text: "06:30 PM", value: "18:30" }
    ];

    startTimes.forEach(time => {
        ecStartTime.innerHTML += `<option value="${time.value}">${time.text}</option>`;
    });
    endTimes.forEach(time => {
        ecEndTime.innerHTML += `<option value="${time.value}">${time.text}</option>`;
    });
}

// (This function is unchanged from last time)
async function loadAdminData() {
    try {
        const response = await fetch('/get_admin_data');
        if (!response.ok) throw new Error('Failed to fetch admin data');
        const data = await response.json();
        
        subjectDivisionMap = data.subject_division_map || {}; 
        ecSubject.innerHTML = '<option value="">Select a subject</option>';
        data.subjects.forEach(subject => {
            const option = document.createElement('option');
            option.value = subject;
            option.textContent = subject;
            ecSubject.appendChild(option);
        });
        ecDivision.innerHTML = '<option value="">Select a subject first</option>';
        ecDivision.disabled = true;
    } catch (error) {
        console.error("Error loading admin data:", error);
        ecSubject.innerHTML = '<option value="">Error loading subjects</option>';
        ecDivision.innerHTML = '<option value="">Error loading divisions</option>';
    }
}

// (This is unchanged from last time)
ecSubject.addEventListener('change', () => {
    const selectedSubject = ecSubject.value;
    ecDivision.innerHTML = '';
    if (selectedSubject && subjectDivisionMap[selectedSubject]) {
        ecDivision.disabled = false;
        ecDivision.innerHTML = '<option value="">Select a division</option>';
        subjectDivisionMap[selectedSubject].forEach(division => {
            const option = document.createElement('option');
            option.value = division;
            option.textContent = division;
            ecDivision.appendChild(option);
        });
    } else {
        ecDivision.innerHTML = '<option value="">Select a subject first</option>';
        ecDivision.disabled = true;
    }
});


// --- 5. NOTICE MANAGEMENT LOGIC (Unchanged) ---
noticeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    publishStatus.textContent = 'Publishing...';
    const message = noticeMessage.value;
    const expiryString = noticeExpiry.value;
    if (!expiryString || !message || message.trim() === "") {
        publishStatus.textContent = 'Please fill in all fields.';
        publishStatus.className = 'error';
        return;
    }
    const expiryDate = new Date(expiryString);
    const expiryTimestamp = firebase.firestore.Timestamp.fromDate(expiryDate);
    noticesCollection.add({
        message: message,
        expiry: expiryTimestamp,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        author: auth.currentUser.email
    }).then(() => {
        publishStatus.textContent = 'Notice published successfully!';
        publishStatus.className = 'status';
        noticeMessage.value = '';
        noticeExpiry.value = formatDateForInput(getTomorrowMidnight());
        setTimeout(() => { publishStatus.textContent = ''; }, 3000);
    }).catch((error) => {
        console.error('Error publishing notice:', error);
        publishStatus.textContent = 'Error publishing notice.';
        publishStatus.className = 'error';
    });
});
function listenForActiveNotices() {
    const now = new Date();
    if (noticeListener) noticeListener(); 
    noticeListener = noticesCollection.where('expiry', '>', now).orderBy('expiry', 'asc')
        .onSnapshot((snapshot) => {
            currentNoticesList.innerHTML = ''; 
            if (snapshot.empty) {
                noNoticesMsg.classList.remove('hidden'); return;
            }
            noNoticesMsg.classList.add('hidden');
            snapshot.forEach(doc => renderNoticeItem(doc));
        }, (error) => console.error("Error listening for notices: ", error));
}
function renderNoticeItem(doc) {
    const data = doc.data();
    const id = doc.id;
    const item = document.createElement('div');
    item.className = 'admin-list-item';
    item.innerHTML = `
        <div class="item-content">
            <p>${data.message.replace(/\n/g, '<br>')}</p>
            <small>Expires: ${formatReadableDate(data.expiry)}</small>
            <small>By: ${data.author || 'unknown'}</small>
        </div>
        <button class="delete-button" data-id="${id}">Delete</button>
    `;
    item.querySelector('.delete-button').addEventListener('click', () => {
        if (confirm('Are you sure you want to delete this notice?')) {
            noticesCollection.doc(id).delete().catch(e => alert("Error deleting: " + e));
        }
    });
    currentNoticesList.appendChild(item);
}


// --- 6. EXTRA CLASS LOGIC (UPDATED) ---

extraClassForm.addEventListener('submit', (e) => {
    e.preventDefault();
    ecPublishStatus.textContent = 'Scheduling...';
    ecPublishStatus.className = 'status';
    
    // --- UPDATED: Read from select dropdowns ---
    const subject = ecSubject.value;
    const division = ecDivision.value;
    const date = ecDate.value;
    const startTime = ecStartTime.value; // This is now a 24-hour value (e.g., "08:30" or "13:30")
    const endTime = ecEndTime.value;     // This is now a 24-hour value
    const room = ecRoom.value.trim() || 'N/A';
    
    if (!subject || !division || !date || !startTime || !endTime) {
        ecPublishStatus.textContent = 'Please fill in all required fields.';
        ecPublishStatus.className = 'error';
        return;
    }
    
    // The 24-hour values from the dropdown work perfectly here!
    const startDateTime = new Date(`${date}T${startTime}`);
    const endDateTime = new Date(`${date}T${endTime}`);
    
    if (endDateTime <= startDateTime) {
        ecPublishStatus.textContent = 'End time must be after start time.';
        ecPublishHStatus.className = 'error';
        return;
    }

    const expiryDate = new Date(`${date}T00:00:00`);
    expiryDate.setDate(expiryDate.getDate() + 1); 
    const startTimestamp = firebase.firestore.Timestamp.fromDate(startDateTime);
    const endTimestamp = firebase.firestore.Timestamp.fromDate(endDateTime);
    const expiryTimestamp = firebase.firestore.Timestamp.fromDate(expiryDate);
    
    extraClassesCollection.add({
        subject: subject,
        division: division,
        room: room,
        startTime: startTimestamp,
        endTime: endTimestamp,
        expiry: expiryTimestamp, 
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        author: auth.currentUser.email
    })
    .then(() => {
        ecPublishStatus.textContent = 'Extra class scheduled successfully!';
        ecPublishStatus.className = 'status';
        extraClassForm.reset(); 
        ecSubject.value = ""; 
        ecDivision.innerHTML = '<option value="">Select a subject first</option>';
        ecDivision.disabled = true;
        // --- NEW: Reset time dropdowns ---
        ecStartTime.value = "";
        ecEndTime.value = "";
        setTimeout(() => { ecPublishStatus.textContent = ''; }, 3000);
    })
    .catch((error) => {
        console.error("Error scheduling class: ", error);
        ecPublishStatus.textContent = 'Error scheduling class.';
        ecPublishStatus.className = 'error';
    });
});

// (This is unchanged)
function listenForExtraClasses() {
    const now = new Date();
    if (classListener) classListener(); 
    classListener = extraClassesCollection.where('expiry', '>', now).orderBy('expiry', 'asc') 
        .onSnapshot((snapshot) => {
            currentClassesList.innerHTML = ''; 
            if (snapshot.empty) {
                noClassesMsg.classList.remove('hidden'); return;
            }
            noClassesMsg.classList.add('hidden');
            snapshot.forEach(doc => renderExtraClassItem(doc));
        }, (error) => console.error("Error listening for classes: ", error));
}
// (This is unchanged)
function renderExtraClassItem(doc) {
    const data = doc.data();
    const id = doc.id;
    const item = document.createElement('div');
    item.className = 'admin-list-item';
    const startTimeStr = formatReadableDate(data.startTime);
    const endTimeStr = data.endTime.toDate().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    item.innerHTML = `
        <div class="item-content">
            <strong>${data.subject} (Div: ${data.division})</strong>
            <p>${startTimeStr} - ${endTimeStr}</p>
            <small>Room: ${data.room}</small>
            <small>By: ${data.author || 'unknown'}</small>
        </div>
        <button class="delete-button" data-id="${id}">Delete</button>
    `;
    item.querySelector('.delete-button').addEventListener('click', () => {
        if (confirm('Are you sure you want to delete this extra class?')) {
            extraClassesCollection.doc(id).delete().catch(e => alert("Error deleting: " + e));
        }
    });
    currentClassesList.appendChild(item);
}