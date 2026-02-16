// ═══════════════════════════════════════════════════════════════════════════
// Guild Module - Frontend
// Manages guild UI, invitations, and member management
// FIXED: isLeader check now uses username instead of id
// ═══════════════════════════════════════════════════════════════════════════

const Guild = {
    // ══════════ STATE ══════════
    guildData: null,
    invitations: [],
    
    // ══════════ INITIALIZATION ══════════
    async init() {
        await this.loadGuildData();
    },
    
    async loadGuildData() {
        try {
            const response = await wsManager.send({
                type: 'guild',
                action: 'get_guild',
                token: Auth.token
            });
            
            if (response.success) {
                this.guildData = response.guild;
                this.invitations = response.invitations || [];
            } else {
                this.guildData = null;
                this.invitations = response.invitations || [];
            }
        } catch (error) {
            console.error('Error loading guild data:', error);
        }
    },
    
    // ══════════ RENDER MAIN TAB ══════════
    async renderGuildTab() {
        await this.loadGuildData();
        
        const container = document.getElementById('guild-tab');
        if (!container) return;
        
        // Show invitations if any
        let inviteHTML = '';
        if (this.invitations.length > 0) {
            inviteHTML = `
            <div class="guild-invitations">
                <h3>📬 Guild Invitations</h3>
                ${this.invitations.map(inv => `
                    <div class="guild-invite-card">
                        <div class="guild-invite-info">
                            <div class="guild-invite-name">[${inv.tag}] ${inv.name}</div>
                            <div class="guild-invite-from">Invited by: ${inv.invited_by_name}</div>
                        </div>
                        <div class="guild-invite-actions">
                            <button onclick="Guild.acceptInvite(${inv.id})" class="btn-accept">✓ Accept</button>
                            <button onclick="Guild.declineInvite(${inv.id})" class="btn-decline">✗ Decline</button>
                        </div>
                    </div>
                `).join('')}
            </div>
            `;
        }
        
        if (!this.guildData) {
            // No guild - show creation form
            container.innerHTML = `
                ${inviteHTML}
                <div class="guild-create-section">
                    <h2>Create a Guild</h2>
                    <p class="guild-create-desc">Start your own guild and invite other players to join!</p>
                    
                    <div class="guild-form">
                        <div class="form-group">
                            <label>Guild Name</label>
                            <input type="text" id="guild-name-input" placeholder="Enter guild name" maxlength="30" onkeypress="if(event.key==='Enter'){event.preventDefault();Guild.createGuild();}">
                        </div>
                        
                        <div class="form-group">
                            <label>Guild Tag (max 4 characters)</label>
                            <input type="text" id="guild-tag-input" placeholder="e.g. IRON" maxlength="4" onkeypress="if(event.key==='Enter'){event.preventDefault();Guild.createGuild();}">
                        </div>
                        
                        <div class="guild-cost">
                            <span>💰 Cost: <strong>1 Gold</strong></span>
                        </div>
                        
                        <button type="button" onclick="Guild.createGuild()" class="btn-primary">
                            <span>Create Guild</span>
                            <span class="btn-arrow">→</span>
                        </button>
                    </div>
                </div>
            `;
        } else {
            // Has guild - show guild info
            // CRITICAL FIX: Use username instead of id for isLeader check
            const isLeader = Game.player?.username === this.guildData.leader_id;
            const expBuff = this.guildData.exp_buff || 0;
            
            // Debug log
            console.log('Guild leader check:', {
                playerUsername: Game.player?.username,
                guildLeaderId: this.guildData.leader_id,
                isLeader: isLeader
            });
            
            container.innerHTML = `
                ${inviteHTML}
                <div class="guild-header">
                    <div class="guild-title">
                        <h2>[${this.guildData.tag}] ${this.guildData.name}</h2>
                        <div class="guild-buff">✨ EXP Buff: +${expBuff}%</div>
                    </div>
                    <div class="guild-meta">
                        <span>👥 ${this.guildData.member_count}/${this.guildData.max_members} Members</span>
                    </div>
                </div>
                
                ${isLeader ? `
                <div class="guild-leader-actions">
                    <h3>Leader Actions</h3>
                    <div class="leader-action-row">
                        <input type="text" id="invite-username-input" placeholder="Enter username to invite">
                        <button type="button" onclick="Guild.invitePlayer()" class="btn-primary">📨 Invite</button>
                    </div>
                    <div class="leader-action-row">
                        <input type="text" id="kick-username-input" placeholder="Enter username to kick">
                        <button type="button" onclick="Guild.kickMember()" class="btn-danger">🚫 Kick</button>
                    </div>
                    <button type="button" onclick="Guild.disbandGuild()" class="btn-danger-outline">💔 Disband Guild</button>
                </div>
                ` : `
                <div class="guild-member-actions">
                    <button type="button" onclick="Guild.leaveGuild()" class="btn-danger-outline">🚪 Leave Guild</button>
                </div>
                `}
                
                <div class="guild-members-section">
                    <h3>Members</h3>
                    <div class="guild-members-list">
                        ${this.guildData.members.map(member => {
                            const isLeaderBadge = member.is_leader ? '<span class="leader-badge">👑 Leader</span>' : '';
                            return `
                            <div class="guild-member-card ${member.is_leader ? 'is-leader' : ''}">
                                <div class="member-info">
                                    <div class="member-name">${member.username} ${isLeaderBadge}</div>
                                    <div class="member-level">Level ${member.level}</div>
                                </div>
                            </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }
    },
    
    // ══════════ GUILD ACTIONS ══════════
    async createGuild() {
        const nameInput = document.getElementById('guild-name-input');
        const tagInput = document.getElementById('guild-tag-input');
        
        if (!nameInput || !tagInput) return;
        
        const name = nameInput.value.trim();
        const tag = tagInput.value.trim().toUpperCase();
        
        if (!name || !tag) {
            Game.addLog('❌ Please enter both guild name and tag');
            return;
        }
        
        if (tag.length > 4) {
            Game.addLog('❌ Tag must be 4 characters or less');
            return;
        }
        
        console.log('Creating guild:', { name, tag });
        
        try {
            const response = await wsManager.send({
                type: 'guild',
                action: 'create',
                token: Auth.token,
                name: name,
                tag: tag
            });
            
            console.log('Guild creation response:', response);
            
            if (response.success) {
                this.guildData = response.guild;
                if (response.gold !== undefined && Game.player) {
                    Game.player.gold = response.gold;
                    Game.updateUI();
                }
                Game.addLog(`✨ Guild "${name}" created successfully!`, 'levelup');
                await this.renderGuildTab();
            } else {
                console.error('Guild creation failed:', response.error);
                Game.addLog(`❌ ${response.error || 'Failed to create guild'}`);
            }
        } catch (error) {
            console.error('Error creating guild:', error);
            Game.addLog('Error: ' + error.message);
        }
    },
    
    async invitePlayer() {
        const input = document.getElementById('invite-username-input');
        if (!input) return;
        
        const username = input.value.trim();
        if (!username) {
            Game.addLog('❌ Please enter a username');
            return;
        }
        
        try {
            const response = await wsManager.send({
                type: 'guild',
                action: 'invite',
                token: Auth.token,
                username: username
            });
            
            if (response.success) {
                Game.addLog(`📨 ${response.message}`, 'exp');
                input.value = '';
            } else {
                Game.addLog(`❌ ${response.error || 'Failed to invite player'}`);
            }
        } catch (error) {
            console.error('Error inviting player:', error);
            Game.addLog('Error: ' + error.message);
        }
    },
    
    async kickMember() {
        const input = document.getElementById('kick-username-input');
        if (!input) return;
        
        const username = input.value.trim();
        if (!username) {
            Game.addLog('❌ Please enter a username');
            return;
        }
        
        if (!confirm(`Are you sure you want to kick ${username}?`)) {
            return;
        }
        
        try {
            const response = await wsManager.send({
                type: 'guild',
                action: 'kick',
                token: Auth.token,
                username: username
            });
            
            if (response.success) {
                this.guildData = response.guild;
                Game.addLog(`🚫 ${response.message}`, 'exp');
                input.value = '';
                await this.renderGuildTab();
            } else {
                Game.addLog(`❌ ${response.error || 'Failed to kick member'}`);
            }
        } catch (error) {
            console.error('Error kicking member:', error);
            Game.addLog('Error: ' + error.message);
        }
    },
    
    async leaveGuild() {
        if (!confirm('Are you sure you want to leave your guild?')) {
            return;
        }
        
        try {
            const response = await wsManager.send({
                type: 'guild',
                action: 'leave',
                token: Auth.token
            });
            
            if (response.success) {
                this.guildData = null;
                Game.addLog(`🚪 ${response.message}`, 'exp');
                await this.renderGuildTab();
            } else {
                Game.addLog(`❌ ${response.error || 'Failed to leave guild'}`);
            }
        } catch (error) {
            console.error('Error leaving guild:', error);
            Game.addLog('Error: ' + error.message);
        }
    },
    
    async disbandGuild() {
        if (!confirm('Are you sure you want to disband your guild? This cannot be undone!')) {
            return;
        }
        
        try {
            const response = await wsManager.send({
                type: 'guild',
                action: 'disband',
                token: Auth.token
            });
            
            if (response.success) {
                this.guildData = null;
                Game.addLog(`💔 ${response.message}`, 'damage');
                await this.renderGuildTab();
            } else {
                Game.addLog(`❌ ${response.error || 'Failed to disband guild'}`);
            }
        } catch (error) {
            console.error('Error disbanding guild:', error);
            Game.addLog('Error: ' + error.message);
        }
    },
    
    async acceptInvite(invitationId) {
        try {
            const response = await wsManager.send({
                type: 'guild',
                action: 'accept_invite',
                token: Auth.token,
                invitation_id: invitationId
            });
            
            if (response.success) {
                this.guildData = response.guild;
                this.invitations = this.invitations.filter(i => i.id !== invitationId);
                Game.addLog(`✨ Joined guild [${response.guild.tag}] ${response.guild.name}!`, 'levelup');
                await this.renderGuildTab();
            } else {
                Game.addLog(`❌ ${response.error || 'Failed to accept invitation'}`);
                // Refresh in case invitation is no longer valid
                await this.renderGuildTab();
            }
        } catch (error) {
            console.error('Error accepting invitation:', error);
            Game.addLog('Error: ' + error.message);
        }
    },
    
    async declineInvite(invitationId) {
        try {
            const response = await wsManager.send({
                type: 'guild',
                action: 'decline_invite',
                token: Auth.token,
                invitation_id: invitationId
            });
            
            if (response.success) {
                this.invitations = this.invitations.filter(i => i.id !== invitationId);
                Game.addLog('✗ Invitation declined', 'exp');
                await this.renderGuildTab();
            } else {
                Game.addLog(`❌ ${response.error || 'Failed to decline invitation'}`);
            }
        } catch (error) {
            console.error('Error declining invitation:', error);
            Game.addLog('Error: ' + error.message);
        }
    }
};
