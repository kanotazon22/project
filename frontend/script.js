let serverURL;
let currentUser;
let lastMessageID = 0;
let userStats = null;
let hideOthersServerMsg = false;
let commandMode = false;
let pollTimeout = null;
let isPolling = false;
let processedMessageIds = new Set();

const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const chatDiv = document.getElementById('chat');
const authMsg = document.getElementById('authMsg');

function encryptMessage(text) {
    return [...text].map(char => 
        String.fromCharCode(char.charCodeAt(0) ^ 42)
    ).join('');
}

async function registerUser() {
    const ip = document.getElementById('serverIP').value.trim();
    const user = document.getElementById('userName').value.trim();
    const pw = document.getElementById('password').value;

    if (!user || !pw) {
        authMsg.textContent = 'Vui lòng điền đầy đủ thông tin!';
        return;
    }

    serverURL = `http://${ip}:8765`;

    try {
        const res = await fetch(`${serverURL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user, pw })
        });
        const data = await res.json();

        if (data.ok) {
            authMsg.style.color = 'green';
            authMsg.textContent = 'Đăng ký thành công! Hãy đăng nhập.';
        } else {
            authMsg.style.color = 'red';
            authMsg.textContent = data.msg;
        }
    } catch (error) {
        authMsg.textContent = 'Không thể kết nối server!';
    }
}

async function loginUser() {
    const ip = document.getElementById('serverIP').value.trim();
    const user = document.getElementById('userName').value.trim();
    const pw = document.getElementById('password').value;

    if (!user || !pw) {
        authMsg.textContent = 'Vui lòng điền đầy đủ thông tin!';
        return;
    }

    serverURL = `http://${ip}:8765`;

    try {
        const res = await fetch(`${serverURL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user, pw })
        });
        const data = await res.json();

        if (data.ok) {
            currentUser = user;
            userStats = data.stats;
            document.getElementById('login').style.display = 'none';
            chatDiv.style.display = 'flex';
            messageInput.focus();
            
            displayServerMessage(
                `🎮 Chào mừng ${user}!\n` +
                `❤️ HP: ${userStats.health}/${userStats.max_health}\n` +
                `⚔️ DMG: ${userStats.damage} | 🌟 LV: ${userStats.level}\n` +
                `Gõ /help để xem danh sách lệnh\n` +
                `Gõ /hideothers để ẩn/hiện server response của người khác`,
                true
            );
            
            // ← CHỈ SET lastMessageID, KHÔNG HIỂN THỊ
            try {
                const initData = await fetch(`${serverURL}/poll`).then(r => r.json());
                lastMessageID = initData.lastId || 0;
                
                // Mark tất cả messages cũ là đã xử lý
                if (initData.messages) {
                    initData.messages.forEach(msg => {
                        processedMessageIds.add(msg.id);
                    });
                }
            } catch (error) {
                // Nếu fail thì không sao, chỉ start polling bình thường
            }
            
            startPolling();
        } else {
            authMsg.style.color = 'red';
            authMsg.textContent = data.msg;
        }
    } catch (error) {
        authMsg.textContent = 'Không thể kết nối server!';
    }
}

async function startPolling() {
    if (isPolling) return;
    
    isPolling = true;
    
    try {
        const response = await fetch(`${serverURL}/poll`, {
            signal: AbortSignal.timeout(5000)
        });
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        const messages = data.messages || [];
        const serverLastId = data.lastId || 0;
        
        messages.forEach(msg => {
            if (processedMessageIds.has(msg.id)) return;
            if (msg.id <= lastMessageID) return;
            
            if (msg.isServer) {
                const isForMe = msg.targetUser === currentUser;
                if (hideOthersServerMsg && !isForMe) {
                    processedMessageIds.add(msg.id);
                    return;
                }
                displayServerMessage(msg.msg, isForMe);
                processedMessageIds.add(msg.id);
            } else if (msg.name !== currentUser) {
                displayPlayerMessage(msg.name, msg.msg, msg.isCommand);
                processedMessageIds.add(msg.id);
            } else {
                processedMessageIds.add(msg.id);
            }
        });

        if (serverLastId > lastMessageID) {
            lastMessageID = serverLastId;
        }
        
        if (processedMessageIds.size > 200) {
            const idsArray = Array.from(processedMessageIds).sort((a, b) => b - a);
            processedMessageIds = new Set(idsArray.slice(0, 150));
        }

    } catch (error) {
        // Silent fail
    } finally {
        isPolling = false;
        pollTimeout = setTimeout(startPolling, 300);
    }
}

function stopPolling() {
    if (pollTimeout) {
        clearTimeout(pollTimeout);
        pollTimeout = null;
    }
    isPolling = false;
}

function displayPlayerMessage(sender, text, isCommand = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message other';
    
    if (isCommand) {
        messageDiv.classList.add('command');
    }

    const nameDiv = document.createElement('div');
    nameDiv.className = 'sender-name';
    nameDiv.textContent = sender;
    messageDiv.appendChild(nameDiv);

    const textNode = document.createTextNode(text);
    messageDiv.appendChild(textNode);

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function displayServerMessage(text, isForMe) {
    const messageDiv = document.createElement('div');
    
    if (isForMe) {
        messageDiv.className = 'message server-me';
    } else {
        messageDiv.className = 'message server-other';
    }
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'sender-name';
    nameDiv.textContent = 'SERVER';
    messageDiv.appendChild(nameDiv);

    const lines = text.split('\n');
    lines.forEach((line, index) => {
        messageDiv.appendChild(document.createTextNode(line));
        if (index < lines.length - 1) {
            messageDiv.appendChild(document.createElement('br'));
        }
    });

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function displayMyMessage(text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message me';
    
    if (text.startsWith('/')) {
        messageDiv.classList.add('command');
    }
    
    messageDiv.textContent = text;

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function handleClientCommand(message) {
    if (message === '/hideothers') {
        hideOthersServerMsg = !hideOthersServerMsg;
        const status = hideOthersServerMsg ? 'ẨN' : 'HIỆN';
        displayServerMessage(
            `🔔 Đã ${status} server response của người khác`,
            true
        );
        return true;
    }
    
    return false;
}

async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    if (handleClientCommand(message)) {
        messageInput.value = '';
        if (commandMode) {
            messageInput.value = '/';
        }
        messageInput.focus();
        return;
    }

    displayMyMessage(message);
    
    const isCommand = message.startsWith('/');
    
    messageInput.value = '';
    
    if (isCommand) {
        messageInput.value = '/';
        commandMode = true;
    }
    
    messageInput.focus();

    try {
        fetch(`${serverURL}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: currentUser,
                msg: encryptMessage(message)
            })
        }).catch(error => {
            displayServerMessage('❌ Không thể gửi tin nhắn!', true);
        });
    } catch (error) {
        // Silent fail
    }
}

function handleEnter(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

messageInput.addEventListener('input', function() {
    const value = this.value;
    if (commandMode && !value.startsWith('/')) {
        commandMode = false;
    }
    if (!commandMode && value === '/') {
        commandMode = true;
    }
});

window.addEventListener('beforeunload', async () => {
    stopPolling();
    
    if (currentUser) {
        navigator.sendBeacon(`${serverURL}/logout`, 
            JSON.stringify({ user: currentUser })
        );
    }
});