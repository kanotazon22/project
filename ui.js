/**
 * ui.js - UI Management Module (FIXED)
 * Handles all user interface interactions and updates
 */

import { CONFIG, MESSAGES, NOTIFICATION_TYPES } from './config.js';
import { DOM, StrUtils } from './utils.js';  // ⭐ FIX: Changed from "String"

// ==================== MESSAGE DISPLAY ====================
export class MessageDisplay {
    constructor(containerId = 'messages') {
        this.container = DOM.get(containerId);
        this.autoScroll = true;
    }

    /**
     * Add player message
     */
    addPlayerMessage(sender, text, isCommand = false) {
        const isSelf = sender === window.ChatModule?.currentUser;
        const className = isSelf 
            ? `me${isCommand ? ' command' : ''}` 
            : `other${isCommand ? ' command' : ''}`;
        
        this._addMessage(className, text, isSelf ? null : sender);
    }

    /**
     * Add server message
     */
    addServerMessage(text, isForMe = false) {
        const className = isForMe ? 'server-me' : 'server-other';
        this._addMessage(className, text, 'SERVER');
    }

    /**
     * Add system notification (centered, permanent)
     */
    addSystemNotification(text, type = NOTIFICATION_TYPES.INFO) {
        if (!this.container) return;

        const wrapper = DOM.create('div', { class: 'system-message' });
        const content = DOM.create('div', { 
            class: `system-message-content ${type}` 
        });
        
        // Split text by newlines and create proper structure
        text.split('\n').forEach((line, i, arr) => {
            content.appendChild(document.createTextNode(line));
            if (i < arr.length - 1) {
                content.appendChild(DOM.create('br'));
            }
        });

        wrapper.appendChild(content);
        this.container.appendChild(wrapper);
        this._scrollToBottom();
    }

    /**
     * Internal: Add message with proper formatting
     */
    _addMessage(className, text, sender = null) {
        if (!this.container) return;

        const div = DOM.create('div', { class: `message ${className}` });

        if (sender) {
            const nameDiv = DOM.create('div', { class: 'sender-name' }, [sender]);
            div.appendChild(nameDiv);
        }

        // Handle multi-line text
        text.split('\n').forEach((line, i, arr) => {
            div.appendChild(document.createTextNode(line));
            if (i < arr.length - 1) {
                div.appendChild(DOM.create('br'));
            }
        });

        this.container.appendChild(div);
        this._scrollToBottom();
    }

    /**
     * Clear all messages
     */
    clear() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }

    /**
     * Scroll to bottom if auto-scroll enabled
     */
    _scrollToBottom() {
        if (!this.container || !this.autoScroll) return;
        
        requestAnimationFrame(() => {
            DOM.scrollToBottom(this.container, CONFIG.ui.scrollBehavior === 'smooth');
        });
    }

    /**
     * Set auto-scroll behavior
     */
    setAutoScroll(enabled) {
        this.autoScroll = enabled;
    }
}

// ==================== TOAST NOTIFICATIONS ====================
export class ToastManager {
    constructor() {
        this.toasts = [];
    }

    /**
     * Show toast notification
     */
    show(message, type = 'error', duration = CONFIG.ui.toastDuration) {
        const toast = DOM.create('div', {
            style: {
                position: 'fixed',
                top: '20px',
                right: '20px',
                background: CONFIG.debug.colors[type.toUpperCase()] || '#f44',
                color: 'white',
                padding: '15px 20px',
                borderRadius: '8px',
                zIndex: '10000',
                maxWidth: '320px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                animation: 'slideIn 0.3s ease-out',
                fontSize: '14px',
                wordWrap: 'break-word'
            }
        }, [message]);

        document.body.appendChild(toast);
        this.toasts.push(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                toast.remove();
                this.toasts = this.toasts.filter(t => t !== toast);
            }, 300);
        }, duration);
    }

    /**
     * Clear all toasts
     */
    clearAll() {
        this.toasts.forEach(toast => toast.remove());
        this.toasts = [];
    }
}

// ==================== STATUS INDICATOR ====================
export class StatusIndicator {
    constructor() {
        this.dot = document.querySelector('.status-dot');
        this.text = document.querySelector('.status-text');
    }

    /**
     * Update connection status
     */
    update(text, state = 'connecting') {
        if (this.dot) {
            this.dot.className = `status-dot ${state}`;
        }
        if (this.text) {
            this.text.textContent = text;
        }
    }

    /**
     * Set online status
     */
    setOnline() {
        this.update('Đã kết nối', 'online');
    }

    /**
     * Set offline status
     */
    setOffline() {
        this.update('Mất kết nối', 'offline');
    }

    /**
     * Set connecting status
     */
    setConnecting() {
        this.update('Đang kết nối...', 'connecting');
    }

    /**
     * Set reconnecting status
     */
    setReconnecting(attempt) {
        this.update(MESSAGES.system.reconnecting(attempt), 'connecting');
    }
}

// ==================== VIEW SWITCHER ====================
export class ViewSwitcher {
    constructor() {
        this.loginView = DOM.get('login');
        this.chatView = DOM.get('chat');
    }

    /**
     * Switch to login view
     */
    showLogin() {
        if (this.loginView) this.loginView.style.display = 'block';
        if (this.chatView) {
            this.chatView.style.display = 'none';
            this.chatView.classList.remove('active');
        }
    }

    /**
     * Switch to chat view
     */
    showChat() {
        if (this.loginView) this.loginView.style.display = 'none';
        if (this.chatView) {
            this.chatView.style.display = 'flex';
            this.chatView.classList.add('active');
        }

        // Focus message input
        setTimeout(() => {
            const input = DOM.get('messageInput');
            if (input) input.focus();
        }, 100);
    }

    /**
     * Check if chat view is visible
     */
    isChatVisible() {
        return this.chatView?.style.display === 'flex';
    }
}

// ==================== FORM MANAGER ====================
export class FormManager {
    constructor(formId) {
        this.form = DOM.get(formId);
        this.fields = {};
    }

    /**
     * Register form field
     */
    registerField(name, id) {
        this.fields[name] = DOM.get(id);
    }

    /**
     * Get field value
     */
    getValue(name) {
        return this.fields[name]?.value?.trim() || '';
    }

    /**
     * Set field value
     */
    setValue(name, value) {
        if (this.fields[name]) {
            this.fields[name].value = value;
        }
    }

    /**
     * Clear field
     */
    clearField(name) {
        this.setValue(name, '');
    }

    /**
     * Clear all fields
     */
    clearAll() {
        Object.keys(this.fields).forEach(name => this.clearField(name));
    }

    /**
     * Enable/disable all fields
     */
    setEnabled(enabled) {
        Object.values(this.fields).forEach(field => {
            if (field) field.disabled = !enabled;
        });

        // Also handle buttons
        const buttons = this.form?.querySelectorAll('button');
        buttons?.forEach(btn => btn.disabled = !enabled);
    }

    /**
     * Validate field
     */
    validate(name, validator) {
        const value = this.getValue(name);
        return validator(value);
    }
}



// ==================== EXPORTS ====================
export const UI = {
    MessageDisplay,
    ToastManager,
    StatusIndicator,
    ViewSwitcher,
    FormManager
};

export default UI;
