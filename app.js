const BASE_URL = (window.location.origin.startsWith('http') ? window.location.origin : 'http://localhost:5000') + '/api';

// Global Socket and Call Handling
let socket;
if (typeof io !== 'undefined') {
    socket = io();

    // Check if donor is logged in and should be online
    const donorInfo = JSON.parse(localStorage.getItem('donorInfo'));
    const onlineStatus = localStorage.getItem('isOnline') === 'true';

    if (donorInfo && onlineStatus) {
        socket.emit('donorOnline', donorInfo.phone);
    }

    // Global Stats Updates
    socket.on('globalStatsUpdate', (stats) => {
        if (stats.bloodRequests !== undefined) {
            const el = document.getElementById('bloodRequestCount');
            if (el) el.innerText = stats.bloodRequests;
        }
        if (stats.livesSaved !== undefined) {
            const el = document.getElementById('livesSavedCount');
            if (el) el.innerText = stats.livesSaved;
        }
    });

    socket.on('donorCountUpdate', (count) => {
        const el = document.getElementById('donorCountDisplay');
        if (el) el.innerText = count;
    });

    // Global Incoming Call Handler (Premium Red Theme)
    socket.on('incomingCall', (data) => {
        showIncomingCallModal(data);
    });
}

// Fetch initial stats
fetch(`${BASE_URL}/stats`).then(res => res.json()).then(stats => {
    if (stats.activeDonors !== undefined) {
        const el = document.getElementById('donorCountDisplay');
        if (el) el.innerText = stats.activeDonors;
    }
    if (stats.bloodRequests) document.getElementById('bloodRequestCount').innerText = stats.bloodRequests;
    if (stats.livesSaved) document.getElementById('livesSavedCount').innerText = stats.livesSaved;
}).catch(() => {});


function showIncomingCallModal(data) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('globalIncomingModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'globalIncomingModal';
        modal.style = `
            position: fixed; top: 20px; right: 20px; 
            background: white; padding: 25px; border-radius: 20px;
            box-shadow: 0 15px 40px rgba(0,0,0,0.2);
            border-left: 6px solid #cc0000; z-index: 10000;
            width: 320px; font-family: 'Segoe UI', sans-serif;
            animation: slideIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        `;
        document.body.appendChild(modal);

        const style = document.createElement('style');
        style.innerHTML = `
            @keyframes slideIn { from { transform: translateX(120%); } to { transform: translateX(0); } }
            .incoming-btn { cursor: pointer; transition: 0.2s; font-weight: bold; }
            .incoming-btn:hover { transform: scale(1.05); opacity: 0.9; }
        `;
        document.head.appendChild(style);
    }

    modal.style.display = 'block';
    modal.innerHTML = `
        <h3 style="color:#cc0000; margin-bottom:10px; display:flex; align-items:center; gap:10px;">
            <span style="font-size:24px;">📞</span> Incoming Request
        </h3>
        <p style="margin-bottom:20px; color:#444;"><strong>${data.from}</strong> needs blood assistance.</p>
        <div style="display:flex; gap:12px;">
            <button id="acceptCallBtn" class="incoming-btn" style="flex:1; background:#28a745; color:white; border:none; padding:12px; border-radius:10px;">Accept</button>
            <button id="declineCallBtn" class="incoming-btn" style="flex:1; background:#666; color:white; border:none; padding:12px; border-radius:10px;">Decline</button>
        </div>
    `;

    document.getElementById('acceptCallBtn').onclick = () => {
        localStorage.setItem('pendingCall', JSON.stringify(data));
        window.location.href = 'donor-dashboard.html?answer=true';
    };

    document.getElementById('declineCallBtn').onclick = () => {
        modal.style.display = 'none';
    };
}

// Handle Donor Registration (STF2.html) - Optimized
const donorForm = document.getElementById('donorForm');
if (donorForm) {
    donorForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const submitBtn = donorForm.querySelector('button');
        submitBtn.disabled = true;
        
        const data = {
            bloodGroup: document.getElementById('regBloodGroup').value,
            fullName: document.getElementById('regFullName').value,
            phone: document.getElementById('regPhone').value,
            password: document.getElementById('regPassword').value,
            city: document.getElementById('regCity').value,
            state: document.getElementById('regState').value,
            zipCode: document.getElementById('regZip').value
        };


        const msgEl = document.getElementById('regMessage');
        msgEl.innerText = 'Registering...';

        try {
            const response = await fetch(`${BASE_URL}/donors`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                msgEl.style.color = 'green';
                msgEl.innerText = 'Registration successful!';
                donorForm.reset();
            } else {
                msgEl.style.color = 'red';
                msgEl.innerText = 'Error registering donor.';
            }
        } catch (error) {
            msgEl.innerText = 'Network error.';
        } finally {
            submitBtn.disabled = false;
        }
    });
}

// Handle Login (STF login.html) - Optimized
const loginForm = document.querySelector('form');
if (loginForm && window.location.pathname.includes('login')) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const phone = loginForm.querySelector('input[type="text"]').value;
        const password = loginForm.querySelector('input[type="password"]').value;

        try {
            const response = await fetch(`${BASE_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, password })
            });
            const result = await response.json();
            if (result.success) {
                localStorage.setItem('donorInfo', JSON.stringify(result.donor));
                localStorage.setItem('isOnline', 'true'); // Auto-online for speed
                window.location.href = 'donor-dashboard.html';
            } else {
                alert('Invalid credentials');
            }
        } catch (err) {
            alert('Server error');
        }
    });
}

// Handle Blood Search (STF3.html) - FAST SEARCH
const searchForm = document.getElementById('searchForm');
if (searchForm) {
    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const resultsEl = document.getElementById('searchResults');
        resultsEl.innerHTML = '<div style="text-align:center; padding:20px;">🔍 Searching for matching donors...</div>';

        const bloodGroup = document.getElementById('searchBloodGroup').value;
        const city = document.getElementById('searchCity').value;
        const state = document.getElementById('searchState').value;
        const zipCode = document.getElementById('searchZip').value;

        try {
            const query = new URLSearchParams({ bloodGroup, city, state, zipCode }).toString();
            const response = await fetch(`${BASE_URL}/donors/search?${query}`);

            const donors = await response.json();

            if (donors.length === 0) {
                resultsEl.innerHTML = '<p style="color:red; text-align:center; padding:20px;">No matching donors found in this area.</p>';
                return;
            }

            // High Performance Fragment Rendering
            const fragment = document.createDocumentFragment();
            const title = document.createElement('h3');
            title.innerText = `Found ${donors.length} Matching Donors:`;
            title.style.marginBottom = '15px';
            fragment.appendChild(title);

            donors.forEach(donor => {
                const card = document.createElement('div');
                card.className = 'donor-card';
                card.style = 'display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid #eee;';
                card.innerHTML = `
                    <div class="donor-info">
                        <h4>${donor.fullName} <span style="font-size:12px; background:#ffe5e5; padding:2px 6px; border-radius:4px;">${donor.bloodGroup}</span></h4>
                        <p>📍 ${donor.city}, ${donor.state}</p>
                    </div>
                    <div style="display:flex; gap:10px;">
                        <button class="call-btn" style="background:#cc0000; color:white; border:none; padding:8px 15px; border-radius:8px; cursor:pointer;" 
                                onclick="window.open('call.html?phone=${donor.phone}&name=${donor.fullName}', 'STF_Call', 'width=400,height=600')">📞 Call</button>
                        <button class="msg-btn" style="background:#333; color:white; border:none; padding:8px 15px; border-radius:8px; cursor:pointer;" 
                                onclick="openChat('${donor.phone}', '${donor.fullName}')">💬 Message</button>
                    </div>
                `;
                fragment.appendChild(card);
            });


            resultsEl.innerHTML = '';
            resultsEl.appendChild(fragment);
        } catch (error) {
            resultsEl.innerHTML = '<p style="color:red;">Error connecting to server.</p>';
        }
    });
}
// Chat System
function openChat(phone, name) {
    let chatBox = document.getElementById('globalChatBox');
    if (!chatBox) {
        chatBox = document.createElement('div');
        chatBox.id = 'globalChatBox';
        chatBox.style = `
            position: fixed; bottom: 20px; right: 20px; 
            background: white; width: 300px; border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3); z-index: 10001;
            display: flex; flex-direction: column; overflow: hidden;
            font-family: sans-serif; border: 1px solid #cc0000;
        `;
        document.body.appendChild(chatBox);
    }
    
    chatBox.style.display = 'flex';
    chatBox.innerHTML = `
        <div style="background:#cc0000; color:white; padding:15px; display:flex; justify-content:space-between; align-items:center;">
            <span>SMS Writer: ${name}</span>
            <button onclick="document.getElementById('globalChatBox').style.display='none'" style="background:none; border:none; color:white; cursor:pointer; font-size:18px;">✕</button>
        </div>
        <div id="chatMessages" style="height:200px; overflow-y:auto; padding:15px; font-size:14px; background:#f9f9f9;">
            <p style="color:#666; font-size:12px; text-align:center;">Messages are sent as SMS directly to the donor's phone.</p>
        </div>
        <div style="padding:10px; background:#eee; display:flex; gap:5px; overflow-x:auto; white-space:nowrap;">
            <button onclick="document.getElementById('chatInput').value='URGENT: I need blood!'" style="padding:5px 10px; border-radius:15px; border:1px solid #ccc; background:white; font-size:12px; cursor:pointer;">Urgent Need</button>
            <button onclick="document.getElementById('chatInput').value='Are you available to donate today?'" style="padding:5px 10px; border-radius:15px; border:1px solid #ccc; background:white; font-size:12px; cursor:pointer;">Availability</button>
            <button onclick="document.getElementById('chatInput').value='Please call me back ASAP.'" style="padding:5px 10px; border-radius:15px; border:1px solid #ccc; background:white; font-size:12px; cursor:pointer;">Call me</button>
        </div>
        <div style="padding:10px; display:flex; gap:5px; background:white;">
            <input type="text" id="chatInput" placeholder="Write SMS..." style="flex:1; padding:8px; border:1px solid #ddd; border-radius:5px;">
            <button onclick="sendChatMessage('${phone}')" style="background:#cc0000; color:white; border:none; padding:8px 12px; border-radius:5px; cursor:pointer;">Send</button>
        </div>
    `;
}


async function sendChatMessage(phone) {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    if (!message) return;

    const chatMessages = document.getElementById('chatMessages');
    const myMsg = document.createElement('p');
    myMsg.innerHTML = `<strong>You:</strong> ${message}`;
    chatMessages.appendChild(myMsg);
    input.value = '';

    try {
        const res = await fetch(`${BASE_URL}/messages/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                donorPhone: phone,
                message: message,
                senderName: 'Recipient'
            })
        });
        
        if (res.ok) {
            const systemMsg = document.createElement('p');
            systemMsg.style.color = 'green';
            systemMsg.style.fontSize = '12px';
            systemMsg.innerHTML = `✓ Message sent to donor via SMS.`;
            chatMessages.appendChild(systemMsg);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
    } catch (err) {
        console.error('Error sending SMS:', err);
    }
}
