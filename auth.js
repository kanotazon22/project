/**
 * auth.js - Authentication Module (Updated)
 * Handles user registration, login, and single account management
 */

import { CONFIG, MESSAGES } from './config.js';
import { Storage, Validate, DOM } from './utils.js';
import { ViewSwitcher, FormManager } from './ui.js';

// ==================== SINGLE ACCOUNT MANAGER ====================
class AccountManager {
    constructor() {
        this.storageKey = 'leafhamlet_saved_account';
    }

    /**
     * Get saved account (only one)
     */
    getAccount() {
        return Storage.get(this.storageKey, null);
    }

    /**
     * Save account (only one)
     */
    saveAccount(server, username, password) {
        const account = {
            server,
            username,
            password: btoa(password), // Base64 encode
            lastLogin: Date.now()
        };
        return Storage.set(this.storageKey, account);
    }

    /**
     * Remove saved account
     */
    removeAccount() {
        return Storage.remove(this.storageKey);
    }
}

// ==================== SAVED ACCOUNT UI ====================
class SavedAccountUI {
    constructor(containerId = 'savedAccount') {
        this.container = DOM.get(containerId);
    }

    /**
     * Display saved account
     */
    display(account, onLogin, onLogout) {
        if (!this.container) return;

        if (!account) {
            this.container.style.display = 'none';
            this._showLoginForm(true);
            return;
        }

        this.container.style.display = 'block';
        this._showLoginForm(false);

        const serverName = this._getServerName(account.server);
        
        this.container.innerHTML = `
            <div class="saved-account-header">
                <div class="saved-account-title">Saved Account</div>
                <a href="#" class="logout-link" id="logoutLink">Logout</a>
            </div>
            <div class="saved-account-content">
                <div class="account-avatar">👤</div>
                <div class="saved-account-info">
                    <div class="saved-username">${DOM.escapeHtml(account.username)}</div>
                    <div class="saved-server">${serverName}</div>
                </div>
                <button class="quick-login-button" id="quickLoginBtn">
                    Login
                </button>
            </div>
        `;

        // Attach event handlers
        const loginBtn = this.container.querySelector('#quickLoginBtn');
        const logoutLink = this.container.querySelector('#logoutLink');

        if (loginBtn) {
            loginBtn.addEventListener('click', () => onLogin(account));
        }

        if (logoutLink) {
            logoutLink.addEventListener('click', (e) => {
                e.preventDefault();
                if (confirm('Are you sure you want to logout from your account?')) {
                    onLogout();
                }
            });
        }
    }

    /**
     * Get human-readable server name
     */
    _getServerName(url) {
        if (url.includes('leafhamlet.serveousercontent.com')) {
            return 'Green Meadow';
        }
        return url;
    }

    /**
     * Show/hide login form
     */
    _showLoginForm(show) {
        const serverSelect = DOM.get('serverSelect')?.parentElement;
        const usernameInput = DOM.get('userName');
        const passwordInput = DOM.get('password');
        const loginBtn = DOM.get('loginBtn');
        const registerBtn = DOM.get('registerBtn');

        const elements = [serverSelect, usernameInput, passwordInput, loginBtn, registerBtn];
        
        elements.forEach(el => {
            if (el) {
                if (show) {
                    el.classList.remove('login-form-hidden');
                } else {
                    el.classList.add('login-form-hidden');
                }
            }
        });
    }
}

// ==================== AUTHENTICATION MANAGER ====================
export class AuthenticationManager {
    constructor(chatManager) {
        this.chatManager = chatManager;
        this.accountManager = new AccountManager();
        this.viewSwitcher = new ViewSwitcher();
        this.savedAccountUI = new SavedAccountUI();

        // Form management
        this.loginForm = new FormManager('login');
        this.loginForm.registerField('server', 'serverSelect');
        this.loginForm.registerField('username', 'userName');
        this.loginForm.registerField('password', 'password');

        // Auth state
        this.authInProgress = false;
        this.pendingAuth = null;
        this.authTimeout = null;

        // Initialize
        this._init();
    }

    /**
     * Initialize authentication manager
     */
    _init() {
        this.displaySavedAccount();
    }

    /**
     * Register new user
     */
    async register() {
        await this._authenticate('register');
    }

    /**
     * Login user
     */
    async login() {
        await this._authenticate('login');
    }

    /**
     * Quick login with saved credentials
     */
    async quickLogin(account) {
        try {
            // Set form values (for visual feedback if needed)
            this.loginForm.setValue('server', account.server);
            this.loginForm.setValue('username', account.username);
            this.loginForm.setValue('password', atob(account.password));
            
            // Perform login
            await this.login();
        } catch (error) {
            console.error('Quick login failed:', error);
            this._setMessage('❌ Quick login failed!', 'error');
        }
    }

    /**
     * Logout saved account (clear saved data)
     */
    logoutSavedAccount() {
        this.accountManager.removeAccount();
        this.displaySavedAccount();
        this._setMessage('✅ Account removed successfully', 'success');
        
        // Clear form
        this.loginForm.clearAll();
    }

    /**
     * Disconnect from chat (when user leaves)
     */
    logout() {
        try {
            // Show leave notification
            const username = this.chatManager.getUser();
            if (username) {
                const text = `🔴 ${username} left the game`;
                this.chatManager.messageDisplay.addSystemNotification(
                    text, 
                    'leave'
                );
            }

            // Disconnect from server
            this.chatManager.disconnect();

            // Reset auth state
            this._resetAuth();

            // Switch to login view
            this.viewSwitcher.showLogin();
            
            // Reset form
            this.loginForm.setEnabled(true);
            this._setMessage('', 'info');

            // Redisplay saved account if exists
            this.displaySavedAccount();

            console.log('✅ Logout complete');
        } catch (error) {
            console.error('Logout failed:', error);
        }
    }

    /**
     * Core authentication flow
     */
    async _authenticate(action) {
        // Check if already authenticating
        if (this.authInProgress) {
            console.warn('Authentication already in progress');
            return;
        }

        // Validate form
        const credentials = this._getCredentials();
        if (!this._validateCredentials(credentials)) {
            return;
        }

        // Start authentication
        this.authInProgress = true;
        this.loginForm.setEnabled(false);
        this.pendingAuth = { action, credentials };

        try {
            // Step 1: Connect to WebSocket
            this._setMessage('🔌 Connecting to server...', 'info');
            await this.chatManager.connect(credentials.server);

            // Step 2: Verify connection
            if (!this.chatManager.wsManager.isConnected()) {
                throw new Error('WebSocket not in OPEN state');
            }

            // Step 3: Send auth request
            const actionText = action === 'register' ? 'Registering' : 'Logging in';
            this._setMessage(`⏳ ${actionText}...`, 'info');

            this.chatManager.wsManager.send({
                action,
                user: credentials.username,
                pw: credentials.password
            });

            // Step 4: Set timeout for response
            this.authTimeout = setTimeout(() => {
                if (this.authInProgress) {
                    console.error('Authentication timeout');
                    this._setMessage(MESSAGES.errors.connectionTimeout, 'error');
                    this._resetAuth();
                    this.chatManager.disconnect();
                }
            }, 10000);

        } catch (error) {
            console.error('Authentication failed:', error);
            
            let errorMsg = MESSAGES.errors.noConnection;
            if (error.message.includes('timeout')) {
                errorMsg = MESSAGES.errors.connectionTimeout;
            }

            this._setMessage(errorMsg, 'error');
            this._resetAuth();
            this.chatManager.disconnect();
        }
    }

    /**
     * Handle register response from server
     */
    handleRegisterResponse(response) {
        this._clearAuthTimeout();
        this.authInProgress = false;
        this.loginForm.setEnabled(true);

        if (response.ok) {
            this._setMessage(MESSAGES.success.registered, 'success');

            // Auto-save account after successful registration
            const { credentials } = this.pendingAuth;
            this.accountManager.saveAccount(
                credentials.server,
                credentials.username,
                credentials.password
            );
            this.displaySavedAccount();

            // Clear password field
            this.loginForm.clearField('password');
        } else {
            this._setMessage(response.msg || '❌ Registration failed!', 'error');
            this.chatManager.disconnect();
        }

        this.pendingAuth = null;
    }

    /**
     * Handle login response from server
     */
    handleLoginResponse(response) {
        this._clearAuthTimeout();
        this.authInProgress = false;

        if (!response.ok) {
            this._setMessage(response.msg || '❌ Login failed!', 'error');
            this.loginForm.setEnabled(true);
            this.chatManager.disconnect();
            this.pendingAuth = null;
            return;
        }

        // Login successful
        const { credentials } = this.pendingAuth || {};
        if (!credentials) {
            console.error('No pending auth credentials');
            this._resetAuth();
            return;
        }

        // Set user in chat manager
        this.chatManager.setUser(credentials.username, response.stats);

        // Save account
        this.accountManager.saveAccount(
            credentials.server,
            credentials.username,
            credentials.password
        );

        // Switch to chat view
        this._switchToChatView();
        
        this.pendingAuth = null;
    }

    /**
     * Switch to chat view after successful login
     */
    _switchToChatView() {
        // Switch view
        this.viewSwitcher.showChat();

        // Show welcome message
        this.chatManager.showWelcome();

        // Request initial messages
        this.chatManager.requestInitialMessages();

        // Re-enable form
        this.loginForm.setEnabled(true);
    }

    /**
     * Display saved account
     */
    displaySavedAccount() {
        const account = this.accountManager.getAccount();
        this.savedAccountUI.display(
            account,
            (acc) => this.quickLogin(acc),
            () => this.logoutSavedAccount()
        );

        // Pre-fill form if account exists
        if (account) {
            this.loginForm.setValue('server', account.server);
            this.loginForm.setValue('username', account.username);
            this.loginForm.setValue('password', atob(account.password));
        }
    }

    /**
     * Get form credentials
     */
    _getCredentials() {
        return {
            server: this.loginForm.getValue('server'),
            username: this.loginForm.getValue('username'),
            password: this.loginForm.getValue('password')
        };
    }

    /**
     * Validate credentials
     */
    _validateCredentials(credentials) {
        if (Validate.isEmpty(credentials.server)) {
            this._setMessage('❌ Please select a server!', 'error');
            return false;
        }

        if (Validate.isEmpty(credentials.username) || 
            Validate.isEmpty(credentials.password)) {
            this._setMessage(MESSAGES.errors.invalidCredentials, 'error');
            return false;
        }

        return true;
    }

    /**
     * Set authentication message
     */
    _setMessage(text, type = 'info') {
        const msgEl = DOM.get('authMsg');
        if (!msgEl) return;

        const colors = {
            error: 'red',
            success: 'green',
            info: 'blue',
            warning: 'orange'
        };

        msgEl.style.color = colors[type] || colors.info;
        msgEl.textContent = text;
    }

    /**
     * Reset authentication state
     */
    _resetAuth() {
        this.authInProgress = false;
        this.pendingAuth = null;
        this.loginForm.setEnabled(true);
        this._clearAuthTimeout();
    }

    /**
     * Clear authentication timeout
     */
    _clearAuthTimeout() {
        if (this.authTimeout) {
            clearTimeout(this.authTimeout);
            this.authTimeout = null;
        }
    }
}

export default AuthenticationManager;