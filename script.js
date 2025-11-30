let serverURL;
let currentUser;
let lastMessageID = 0;
let isPolling = false;

const messagesContainer = document.getElementById('messages');
const statusBar = document.getElementById('statusBar');
const messageInput = document.getElementById('messageInput');
const chatDiv = document.getElementById('chat');

function encryptMessage(text) {
    return [...text].map(char => 
        String.fromCharCode(char.charCodeAt(0) ^ 42)
    ).join('');
}

function connectToChat() {
    const ip = document.getElementById('serverIP').value.trim();
    const name = document.getElementById('userName').value.trim();

    if (!name) {
        alert('Vui lòng nhập tên!');
        return;
    }

    currentUser = name;
    serverURL = `http://${ip}:8765`;

    document.getElementById('login').style.display = 'none';
    chatDiv.style.display = 'flex';
    messageInput.focus();

    startPolling();
}

async function startPolling() {
    if (isPolling) return;
    isPolling = true;

    try {
        const response = await fetch(`${serverURL}/poll`);
        if (!response.ok) throw new Error("Connection failed");
        const messages = await response.json();

        messages.slice(lastMessageID).forEach(msg => {
            // FIX: Chỉ hiển thị tin nhắn nếu người gửi KHÔNG phải là người dùng hiện tại
            if (msg.name !== currentUser) {
                displayMessage(msg.name, msg.msg, false); 
            }
        });

        lastMessageID = messages.length;
        updateStatus(true);

    } catch (error) {
        updateStatus(false);
    }

    isPolling = false;
    setTimeout(startPolling, 700);
}

function displayMessage(sender, text, isMe) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isMe ? 'me' : 'other'}`;

    if (!isMe) {
        const nameDiv = document.createElement('div');
        nameDiv.className = 'sender-name';
        nameDiv.textContent = sender;
        messageDiv.appendChild(nameDiv);
    }

    const textNode = document.createTextNode(text);
    messageDiv.appendChild(textNode);

    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;

    // Hiển thị ngay lập tức
    displayMessage(currentUser, message, true);
    messageInput.value = '';

    try {
        await fetch(`${serverURL}/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: currentUser,
                msg: encryptMessage(message)
            })
        });
    } catch (error) {
        alert('Không thể gửi tin nhắn. Vui lòng kiểm tra kết nối server.');
    }
}

function handleEnter(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

function updateStatus(connected) {
    if (connected) {
        statusBar.textContent = '✓ Đã kết nối';
        statusBar.style.color = '#000000';
    } else {
        statusBar.textContent = '✗ Mất kết nối';
        statusBar.style.color = '#ff0000';
    }
}
