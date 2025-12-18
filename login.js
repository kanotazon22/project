// ==================== LOGIN MODULE ====================
const LoginModule = {
    STORAGE_KEY: 'rpg_saved_accounts',
    authInProgress: false,
    pendingAuth: null,
    authTimeout: null,
    
    // ==================== STORAGE ====================
    getSavedAccounts() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (error) {
            DEBUG.error('STORAGE', 'Load failed', error);
            return [];
        }
    },
    
    saveAccount(url, username, password) {
        try {
            const accounts = this.getSavedAccounts();
            const index = accounts.findIndex(a => a.url === url && a.username === username);
            
            const account = {
                url,
                username,
                password: btoa(password),
                lastLogin: Date.now()
            };
            
            if (index >= 0) {
                accounts[index] = account;
            } else {
                accounts.push(account);
            }
            
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(accounts));
            DEBUG.info('STORAGE', 'Saved', { url, username });
        } catch (error) {
            DEBUG.error('STORAGE', 'Save failed', error);
        }
    },
    
    removeAccount(url, username) {
        try {
            const accounts = this.getSavedAccounts().filter(a => !(a.url === url && a.username === username));
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(accounts));
            this.displaySavedAccounts();
            DEBUG.info('STORAGE', 'Removed', { url, username });
        } catch (error) {
            DEBUG.error('STORAGE', 'Remove failed', error);
        }
    },
    
    displaySavedAccounts() {
        const container = document.getElementById('savedAccounts');
        if (!container) return;
        
        const accounts = this.getSavedAccounts();
        
        if (accounts.length === 0) {
            container.style.display = 'none';
            return;
        }
        
        container.style.display = 'block';
        container.innerHTML = '<div class="saved-title">💾 Tài khoản đã lưu:</div>';
        
        accounts.sort((a, b) => b.lastLogin - a.lastLogin).forEach(acc => {
            const div = document.createElement('div');
            div.className = 'saved-account';
            div.innerHTML = `
                <div class="account-info">
                    <div class="account-name">👤 ${this.escapeHtml(acc.username)}</div>
                    <div class="account-server">🌐 ${this.escapeHtml(acc.url)}</div>
                </div>
                <button class="quick-login-btn" onclick='LoginModule.quickLogin("${this.escapeHtml(acc.url)}", "${this.escapeHtml(acc.username)}", "${acc.password}")'>
                    Đăng nhập
                </button>
                <button class="remove-btn" onclick='LoginModule.removeAccount("${this.escapeHtml(acc.url)}", "${this.escapeHtml(acc.username)}")'>
                    ✕
                </button>
            `;
            container.appendChild(div);
        });
    },
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    // ==================== GMAIL LOGIN ====================
    initGoogleSignIn() {
        if (typeof google === 'undefined') {
            DEBUG.warn('AUTH', 'Google Sign-In not loaded yet');
            return;
        }
        
        try {
            google.accounts.id.initialize({
                client_id: '16750561370-qi17sin24be9ghnpa5c5uqijt5mjrp44.apps.googleusercontent.com',
                callback: (response) => this.handleGoogleCredential(response),
                auto_select: false,
            });
            DEBUG.info('AUTH', 'Google Sign-In initialized');
        } catch (error) {
            DEBUG.error('AUTH', 'Google Sign-In init failed', error);
        }
    },
    
    async handleGoogleCredential(response) {
        try {
            DEBUG.info('AUTH', 'Gmail credential received');
            
            // Decode JWT to get user info
            const base64Url = response.credential.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => 
                '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
            ).join(''));
            
            const userInfo = JSON.parse(jsonPayload);
            DEBUG.info('AUTH', 'Gmail user info', { email: userInfo.email, name: userInfo.name });
            
            // Auto-fill username as email (without @gmail.com)
            const username = userInfo.email.split('@')[0];
            document.getElementById('userName').value = username;
            
            // Generate a secure password from the Google sub (user ID)
            const autoPassword = 'gmail_' + userInfo.sub.substring(0, 16);
            document.getElementById('password').value = autoPassword;
            
            this.gmailAccessToken = response.credential;
            
            this.setAuthMessage('✅ Đã xác thực Gmail! Đang đăng nhập...', 'success');
            
            // Auto-login with generated credentials
            await this.loginUser();
            
        } catch (error) {
            DEBUG.error('AUTH', 'Gmail authentication failed', error);
            this.setAuthMessage('❌ Lỗi xác thực Gmail!', 'error');
        }
    },
    
    loginWithGmail() {
        if (typeof google === 'undefined') {
            this.setAuthMessage('⏳ Đang tải Google Sign-In...', 'info');
            setTimeout(() => {
                if (typeof google !== 'undefined') {
                    this.initGoogleSignIn();
                    google.accounts.id.prompt();
                } else {
                    this.setAuthMessage('❌ Không thể tải Google Sign-In! URL tunnel có thể đã thay đổi.', 'error');
                }
            }, 1000);
            return;
        }
        
        if (!google.accounts?.id) {
            this.initGoogleSignIn();
        }
        
        try {
            google.accounts.id.prompt((notification) => {
                if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                    const reason = notification.getNotDisplayedReason();
                    DEBUG.warn('AUTH', 'Gmail prompt not shown', reason);
                    
                    // Nếu lỗi do URL không khớp
                    if (reason === 'opt_out_or_no_session' || reason === 'browser_not_supported') {
                        this.setAuthMessage('⚠️ Gmail login có thể không khả dụng. URL tunnel đã thay đổi? Dùng đăng nhập thường.', 'warning');
                    }
                }
            });
        } catch (error) {
            DEBUG.error('AUTH', 'Gmail prompt failed', error);
            this.setAuthMessage('⚠️ Gmail login tạm thời không khả dụng. Vui lòng dùng đăng nhập thường.', 'warning');
        }
    },
    
    // ==================== UI HELPERS ====================
    getFormData() {
        return {
            url: document.getElementById('serverURL')?.value.trim() || '',
            username: document.getElementById('userName')?.value.trim() || '',
            password: document.getElementById('password')?.value || ''
        };
    },
    
    setAuthMessage(text, type = 'info') {
        const msg = document.getElementById('authMsg');
        if (!msg) return;
        
        const colors = { error: 'red', success: 'green', info: 'blue', warning: 'orange' };
        msg.style.color = colors[type];
        msg.textContent = text;
        DEBUG.debug('AUTH', `Message: ${text}`, { type });
    },
    
    validateForm(data) {
        if (!data.url) {
            this.setAuthMessage('❌ Vui lòng nhập địa chỉ server!', 'error');
            return false;
        }
        if (!data.username || !data.password) {
            this.setAuthMessage('❌ Vui lòng điền đầy đủ thông tin!', 'error');
            return false;
        }
        return true;
    },
    
    setFormEnabled(enabled) {
        ['serverURL', 'userName', 'password'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = !enabled;
        });
        
        document.querySelectorAll('.auth-buttons button').forEach(btn => {
            btn.disabled = !enabled;
        });
    },
    
    // ==================== AUTHENTICATION FLOW (FIXED) ====================
    async authenticate(action) {
        if (this.authInProgress) {
            DEBUG.warn('AUTH', 'Already in progress');
            return;
        }
        
        const data = this.getFormData();
        if (!this.validateForm(data)) return;
        
        this.authInProgress = true;
        this.setFormEnabled(false);
        
        // Clear any existing timeout
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }
        
        try {
            DEBUG.info('AUTH', `${action} started`, { url: data.url, username: data.username });
            
            // Store auth data
            this.pendingAuth = { action, data };
            
            // Step 1: Connect to WebSocket
            this.setAuthMessage('🔌 Đang kết nối server...', 'info');
            await ChatModule.connect(data.url);
            
            // Step 2: CRITICAL FIX - Verify WebSocket is OPEN
            if (ChatModule.ws?.readyState !== WebSocket.OPEN) {
                throw new Error('WebSocket not in OPEN state');
            }
            
            // Step 3: Send authentication request
            this.setAuthMessage(`⏳ Đang ${action === 'register' ? 'đăng ký' : 'đăng nhập'}...`, 'info');
            
            const payload = {
                action,
                user: data.username,
                pw: data.password
            };
            
            DEBUG.debug('AUTH', 'Sending payload', { action, user: data.username });
            ChatModule.ws.send(JSON.stringify(payload));
            
            // Step 4: Set timeout for response
            this.authTimeout = setTimeout(() => {
                if (this.authInProgress) {
                    DEBUG.error('AUTH', 'Response timeout');
                    this.setAuthMessage('❌ Server không phản hồi. Thử lại.', 'error');
                    this.resetAuth();
                    ChatModule.disconnect();
                }
            }, 10000);
            
        } catch (error) {
            DEBUG.error('AUTH', 'Failed', { error: error.message, stack: error.stack });
            
            // User-friendly error messages
            let errorMsg = '❌ Không thể kết nối.';
            if (error.message.includes('timeout')) {
                errorMsg = '❌ Server không phản hồi. Kiểm tra lại URL.';
            } else if (error.message.includes('OPEN state')) {
                errorMsg = '❌ Kết nối chưa sẵn sàng. Thử lại.';
            } else if (error.message.includes('WebSocket')) {
                errorMsg = '❌ Lỗi WebSocket. Kiểm tra địa chỉ server.';
            }
            
            this.setAuthMessage(errorMsg, 'error');
            this.resetAuth();
            ChatModule.disconnect();
        }
    },
    
    resetAuth() {
        this.authInProgress = false;
        this.pendingAuth = null;
        this.setFormEnabled(true);
        
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }
    },
    
    async registerUser() {
        await this.authenticate('register');
    },
    
    async loginUser() {
        await this.authenticate('login');
    },
    
    async quickLogin(url, username, encodedPassword) {
        try {
            document.getElementById('serverURL').value = url;
            document.getElementById('userName').value = username;
            document.getElementById('password').value = atob(encodedPassword);
            await this.loginUser();
        } catch (error) {
            DEBUG.error('AUTH', 'Quick login failed', error);
            this.setAuthMessage('❌ Lỗi đăng nhập nhanh!', 'error');
        }
    },
    
    // ==================== RESPONSE HANDLERS ====================
    handleRegisterResponse(response) {
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }
        
        this.authInProgress = false;
        this.setFormEnabled(true);
        
        DEBUG.info('AUTH', 'Register response', { ok: response.ok, msg: response.msg });
        
        if (response.ok) {
            this.setAuthMessage('✅ Đăng ký thành công! Hãy đăng nhập.', 'success');
            
            // Save account if remember me checked
            if (this.pendingAuth && document.getElementById('rememberMe')?.checked) {
                const { data } = this.pendingAuth;
                this.saveAccount(data.url, data.username, data.password);
                this.displaySavedAccounts();
            }
            
            // Clear password field
            const pwField = document.getElementById('password');
            if (pwField) pwField.value = '';
            
        } else {
            this.setAuthMessage(response.msg || '❌ Đăng ký thất bại!', 'error');
            ChatModule.disconnect();
        }
        
        this.pendingAuth = null;
    },
    
    handleLoginResponse(response) {
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }
        
        this.authInProgress = false;
        
        DEBUG.info('AUTH', 'Login response', { ok: response.ok, hasStats: !!response.stats });
        
        if (!response.ok) {
            this.setAuthMessage(response.msg || '❌ Đăng nhập thất bại!', 'error');
            this.setFormEnabled(true);
            ChatModule.disconnect();
            this.pendingAuth = null;
            return;
        }
        
        // Login successful
        const { data } = this.pendingAuth || {};
        if (!data) {
            DEBUG.error('AUTH', 'No pending auth data');
            this.resetAuth();
            return;
        }
        
        ChatModule.currentUser = data.username;
        ChatModule.userStats = response.stats;
        
        // Save account if remember me checked
        if (document.getElementById('rememberMe')?.checked) {
            this.saveAccount(data.url, data.username, data.password);
        }
        
        DEBUG.success('AUTH', 'Login successful', { username: data.username, stats: response.stats });
        
        // Switch to chat view
        this.switchToChatView(data.username, response.stats);
        
        this.pendingAuth = null;
    },
    
    switchToChatView(username, stats) {
    const login = document.getElementById('login');
    const chat = document.getElementById('chat');
    const userInfo = document.getElementById('userInfo');
    
    if (login) login.style.display = 'none';
    if (chat) {
        chat.style.display = 'flex';
        chat.classList.add('active');
    }
    if (userInfo) userInfo.textContent = `👤 ${username}`;
    
    DEBUG.info('AUTH', 'Switched to chat view');
    
    // ✅ Bilingual welcome message
    ChatModule.displayServerMsg(window.MESSAGES.welcome(username, stats), true);
    
    // Focus input
    setTimeout(() => {
        const input = document.getElementById('messageInput');
        if (input) {
            input.focus();
            DEBUG.debug('AUTH', 'Input focused');
        }
    }, 100);
    
    // Request initial messages
    if (ChatModule.ws?.readyState === WebSocket.OPEN) {
        ChatModule.ws.send(JSON.stringify({ action: 'poll' }));
        DEBUG.info('MSG', 'Requested initial messages');
    }
    
    // Re-enable form
    this.setFormEnabled(true);
},
    
    // ==================== LOGOUT ====================
    logout() {
    try {
        DEBUG.info('AUTH', 'Logging out');
        
        // ✅ Show leave notification
        if (ChatModule.currentUser) {
            window.SystemNotifications?.playerLeft(ChatModule.currentUser);
        }
        
        // Clear timeouts
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }
            
            // Disconnect
            ChatModule.disconnect();
            
            // Clear state
            ChatModule.currentUser = null;
            ChatModule.userStats = null;
            ChatModule.currentServerUrl = null;
            ChatModule.processedMessageIds.clear();
            ChatModule.hideOthersServerMsg = false;
            
            this.authInProgress = false;
            this.pendingAuth = null;
            
            // Reset UI
            const login = document.getElementById('login');
            const chat = document.getElementById('chat');
            const messages = document.getElementById('messages');
            const messageInput = document.getElementById('messageInput');
            
            if (login) login.style.display = 'block';
            if (chat) {
                chat.style.display = 'none';
                chat.classList.remove('active');
            }
            if (messages) messages.innerHTML = '';
            if (messageInput) messageInput.value = '';
            
            this.setFormEnabled(true);
            this.setAuthMessage('', 'info');
            
            DEBUG.success('AUTH', 'Logout complete');
        } catch (error) {
            DEBUG.error('AUTH', 'Logout failed', error);
        }
    }
};

// ==================== GLOBAL EXPORTS ====================
window.LoginModule = LoginModule;
window.loginUser = () => LoginModule.loginUser();
window.registerUser = () => LoginModule.registerUser();
window.quickLogin = (url, username, pwd) => LoginModule.quickLogin(url, username, pwd);
window.removeAccount = (url, username) => LoginModule.removeAccount(url, username);
window.logout = () => LoginModule.logout();