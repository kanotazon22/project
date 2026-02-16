// ═══════════════════════════════════════════════════════════════════════════
// Game Module - UPDATED WITH HOTBAR AND STAT ALLOCATION
// Client chỉ render UI, mọi data và logic từ server
// ═══════════════════════════════════════════════════════════════════════════

const Game = {
    // ══════════ STATE (chỉ dữ liệu từ server) ══════════
    player: null,
    currentMap: 1,
    currentEnemy: null,
    inBattle: false,
    
    // Game config (từ server)
    config: {
        maps: [],
        items: {},
        gatheringResources: {},
        npcs: {},
        skillIcons: {}
    },

    // ══════════ INITIALIZATION ══════════
    async init() {
        this.setupNavigation();
        await this.loadGameConfig();
        await this.loadPlayerData();
        this.renderMapsTab();
        this.updateCurrentMapBar();
        this.updateUI();
    },

    async loadGameConfig() {
        try {
            const response = await wsManager.send({
                type: 'game',
                action: 'get_config',
                token: Auth.token
            });
            
            console.log('Config response:', response);
            
            if (response.success && response.config) {
                this.config = response.config;
                console.log('Config loaded:', this.config);
            }
        } catch (error) {
            console.error('Error loading config:', error);
        }
    },

    async loadPlayerData() {
        try {
            const response = await wsManager.send({
                type: 'game',
                action: 'player',
                token: Auth.token
            });
            
            if (response.success && response.player) {
                this.player = response.player;
                this.currentMap = this.player.current_map || 1;
                console.log('Player loaded:', this.player);
            }
        } catch (error) {
            console.error('Error loading player:', error);
        }
    },

    // ══════════ NAVIGATION ══════════
    setupNavigation() {
        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');

                if (tab.dataset.tab === 'chat') {
                    document.getElementById('chat-unread-badge').style.display = 'none';
                    if (typeof Chat !== 'undefined') Chat.onTabOpen();
                }
                
                if (tab.dataset.tab === 'npcs') {
                    if (typeof Gather !== 'undefined') Gather.renderNPCsTab();
                }
                if (tab.dataset.tab === 'shop') {
                    if (typeof Shop !== 'undefined') Shop.renderShopTab();
                }
                if (tab.dataset.tab === 'guild') {
                    if (typeof Guild !== 'undefined') Guild.renderGuildTab();
                }
            });
        });
    },

    goToMaps() {
        document.querySelector('[data-tab="maps"]')?.click();
    },

    // ══════════ MAPS ══════════
    renderMapsTab() {
        const grid = document.getElementById('maps-grid');
        if (!grid || !this.player || !this.config.maps) return;

        grid.innerHTML = this.config.maps.map(map => {
            const isLocked = this.player.level < map.minLevel;
            const isActive = this.currentMap === map.id;
            let cls = 'map-card';
            if (isLocked) cls += ' locked';
            if (isActive) cls += ' active';

            return `
            <div class="${cls}" ${!isLocked ? `onclick="Game.selectMap(${map.id})"` : ''}>
                <div class="map-card-icon">${map.icon}</div>
                <div class="map-card-body">
                    <div class="map-card-name">${map.name}</div>
                    <div class="map-card-range">Lv ${map.minLevel}${map.maxLevel > map.minLevel ? ` – ${map.maxLevel}` : ''}</div>
                    <div class="map-card-desc">${map.desc}</div>
                </div>
                ${isActive ? '<div class="map-card-badge active-badge">CURRENT LOCATION</div>' : ''}
                ${isLocked ? `<div class="map-card-badge lock-badge">🔒 Lv ${map.minLevel}</div>` : ''}
            </div>`;
        }).join('');
    },

    updateCurrentMapBar() {
        const map = this.config.maps?.find(m => m.id === this.currentMap);
        const el = document.getElementById('current-map-name');
        if (el && map) el.textContent = `${map.icon} ${map.name}`;
    },

    selectMap(mapId) {
        if (this.inBattle) {
            this.addLog('You are currently in battle!');
            document.querySelector('[data-tab="main"]')?.click();
            return;
        }

        this.currentMap = mapId;
        this.renderMapsTab();
        this.updateCurrentMapBar();

        const map = this.config.maps?.find(m => m.id === mapId);
        this.addLog(`✈ Traveled to ${map ? map.name : 'map ' + mapId}`);

        setTimeout(() => document.querySelector('[data-tab="main"]')?.click(), 300);
    },

    // ══════════ COMBAT ══════════
    async findMonster() {
        if (this.inBattle) {
            this.addLog('You are currently in battle!');
            return;
        }
        
        try {
            const response = await wsManager.send({
                type: 'game',
                action: 'find_monster',
                token: Auth.token,
                map: this.currentMap
            });
            
            if (response.success && response.monster) {
                this.currentEnemy = response.monster;
                this.inBattle = true;
                this.showBattle();
                this.addLog(`You encountered ${this.currentEnemy.name} (Lv ${this.currentEnemy.level})!`);
            } else {
                this.addLog('No monsters found');
            }
        } catch (error) {
            console.error('Error finding monster:', error);
            this.addLog('Error: ' + error.message);
        }
    },

    async attack() {
        if (!this.inBattle || !this.currentEnemy) return;
        
        try {
            const response = await wsManager.send({
                type: 'game',
                action: 'attack',
                token: Auth.token
            });
            
            if (response.success) {
                this.handleAttackResult(response);
            } else {
                this.addLog('Error: ' + (response.error || 'Attack failed'));
            }
        } catch (error) {
            console.error('Error attacking:', error);
            this.addLog('Error: ' + error.message);
        }
    },

    handleAttackResult(result) {
        if (result.player) this.player = result.player;

        this.addLog(`You attack ${this.currentEnemy.name} dealing ${result.playerDamage} damage`, 'damage');
        
        this.currentEnemy.hp = Math.max(0, this.currentEnemy.hp - result.playerDamage);
        this.updateEnemyHP();

        if (result.enemyDefeated) {
            this.addLog(`${this.currentEnemy.name} has been defeated!`, 'levelup');
            
            // Display exp with bonus breakdown
            if (result.expGained) {
                if (result.bonusExp && result.bonusExp > 0) {
                    this.addLog(`+${result.expGained} EXP (+${result.bonusExp} guild bonus)`, 'exp');
                } else {
                    this.addLog(`+${result.expGained} EXP`, 'exp');
                }
            }
            
            if (result.goldGained) this.addLog(`+${result.goldGained} Gold`, 'exp');
            
            if (result.droppedItems?.length > 0) {
                result.droppedItems.forEach(itemName => {
                    this.addLog(`📦 Dropped: ${itemName}`, 'exp');
                });
            }

            if (result.levelUp) {
                this.addLog('🎉 LEVEL UP! You reached level ' + this.player.level + '!', 'levelup');
                this.addLog('💫 You gained 3 stat points!', 'levelup');
                this.renderMapsTab();
            }
            
            this.endBattle();
        } else {
            this.addLog(`${this.currentEnemy.name} counterattacks dealing ${result.enemyDamage} damage`, 'damage');
            this.updatePlayerHP();

            if (result.playerDefeated) {
                this.addLog('💀 You have been defeated! HP restored.', 'damage');
                this.endBattle();
            }
        }
        
        this.updateUI();
    },

    // ══════════ HOTBAR SYSTEM ══════════
    async useHotbar() {
        if (!this.player?.hotbar_slot) {
            this.addLog('❌ No item in hotbar! Click an item in inventory to assign it.');
            return;
        }

        try {
            const response = await wsManager.send({
                type: 'game',
                action: 'use_hotbar',
                token: Auth.token
            });
            
            if (response.success) {
                this.player = response.player;
                const itemData = this.config.items[response.player.hotbar_slot || this.player.hotbar_slot];
                const icon = itemData?.icon || '💊';
                this.addLog(`${icon} Used ${this.player.hotbar_slot || 'item'}! Restored ${response.healed || 0} HP`, 'exp');
                this.updateUI();
            } else {
                this.addLog(`❌ ${response.error || 'Failed to use hotbar item'}`);
                // If item no longer exists, update UI
                if (response.error && response.error.includes('not found')) {
                    this.updateUI();
                }
            }
        } catch (error) {
            console.error('Error using hotbar:', error);
            this.addLog('Error: ' + error.message);
        }
    },

    async setHotbar(itemName) {
        try {
            const response = await wsManager.send({
                type: 'game',
                action: 'set_hotbar',
                token: Auth.token,
                item: itemName
            });
            
            if (response.success) {
                this.player = response.player;
                this.updateUI();
                if (itemName) {
                    this.addLog(`📌 Assigned ${itemName} to hotbar`, 'exp');
                } else {
                    this.addLog(`📌 Cleared hotbar`, 'exp');
                }
            } else {
                this.addLog(`❌ ${response.error || 'Failed to set hotbar'}`);
            }
        } catch (error) {
            console.error('Error setting hotbar:', error);
            this.addLog('Error: ' + error.message);
        }
    },

    // ══════════ STAT ALLOCATION ══════════
    async allocateStat(statType) {
        if (!this.player || this.player.stat_points <= 0) {
            this.addLog('❌ No stat points available!');
            return;
        }

        try {
            const response = await wsManager.send({
                type: 'game',
                action: 'allocate_stat',
                token: Auth.token,
                stat: statType
            });
            
            if (response.success) {
                this.player = response.player;
                this.updateUI();
                
                const gain = statType === 'dmg' ? '+1 DMG' : '+2 MAX HP';
                this.addLog(`💪 Allocated 1 stat point to ${statType.toUpperCase()} (${gain})`, 'levelup');
            } else {
                this.addLog(`❌ ${response.error || 'Failed to allocate stat'}`);
            }
        } catch (error) {
            console.error('Error allocating stat:', error);
            this.addLog('Error: ' + error.message);
        }
    },

    async flee() {
        if (!this.inBattle) return;
        
        try {
            await wsManager.send({
                type: 'game',
                action: 'flee',
                token: Auth.token
            });
            
            this.addLog('You fled from battle!');
            this.endBattle();
        } catch (error) {
            console.error('Error fleeing:', error);
            this.endBattle();
        }
    },

    showBattle() {
        document.getElementById('enemy-info').style.display = 'flex';
        document.getElementById('find-monster-btn').style.display = 'none';
        document.getElementById('attack-btn').style.display = 'inline-block';
        document.getElementById('hotbar-btn').style.display = 'inline-block';
        document.getElementById('flee-btn').style.display = 'inline-block';

        document.getElementById('enemy-name').textContent = this.currentEnemy.name;
        document.getElementById('enemy-level').textContent = this.currentEnemy.level;
        document.getElementById('enemy-dmg').textContent = this.currentEnemy.dmg;
        this.updateEnemyHP();
    },

    endBattle() {
        this.inBattle = false;
        this.currentEnemy = null;

        document.getElementById('enemy-info').style.display = 'none';
        document.getElementById('find-monster-btn').style.display = 'inline-block';
        document.getElementById('attack-btn').style.display = 'none';
        document.getElementById('hotbar-btn').style.display = 'none';
        document.getElementById('flee-btn').style.display = 'none';

        this.renderMapsTab();
    },

    // ══════════ HP BARS ══════════
    updateEnemyHP() {
        if (!this.currentEnemy) return;
        
        const hp = Math.max(0, this.currentEnemy.hp);
        const pct = (hp / this.currentEnemy.max_hp) * 100;
        
        document.getElementById('enemy-hp-bar').style.width = pct + '%';
        document.getElementById('enemy-hp-text').textContent = `${hp}/${this.currentEnemy.max_hp}`;
    },

    updatePlayerHP() {
        if (!this.player) return;
        
        const pct = (this.player.hp / this.player.max_hp) * 100;
        document.getElementById('player-hp-bar').style.width = pct + '%';
        document.getElementById('player-hp-text').textContent = `${this.player.hp}/${this.player.max_hp}`;
    },

    // ══════════ UI UPDATE ══════════
    updateUI() {
        if (!this.player) return;

        document.getElementById('player-name').textContent = this.player.username || 'Player';
        
        // Total damage từ server
        const totalDmg = this.player.total_dmg || this.player.dmg;
        
        document.getElementById('player-level-main').textContent = this.player.level;
        document.getElementById('player-dmg-main').textContent = totalDmg;
        this.updatePlayerHP();

        document.getElementById('player-level').textContent = this.player.level;
        
        // Combined HP display (current/max)
        document.getElementById('player-hp-combined').textContent = `${this.player.hp}/${this.player.max_hp}`;
        
        document.getElementById('player-dmg').textContent = totalDmg;

        const expNeeded = this.player.exp_needed || 100;
        document.getElementById('player-exp').textContent = `${this.player.exp}/${expNeeded}`;
        document.getElementById('exp-bar-fill').style.width = Math.min((this.player.exp / expNeeded * 100), 100) + '%';
        document.getElementById('player-gold').textContent = this.player.gold;

        // Update stat points display and buttons
        const statPoints = this.player.stat_points || 0;
        const statPointsRow = document.getElementById('stat-points-row');
        const statPointsEl = document.getElementById('stat-points-available');
        const statBtnDmg = document.getElementById('stat-btn-dmg');
        const statBtnHp = document.getElementById('stat-btn-hp');
        
        if (statPoints > 0) {
            statPointsRow.style.display = '';
            statPointsEl.textContent = statPoints;
            statBtnHp.style.display = 'flex';
            statBtnDmg.style.display = 'flex';
        } else {
            statPointsRow.style.display = 'none';
            statBtnHp.style.display = 'none';
            statBtnDmg.style.display = 'none';
        }

        // Update hotbar button
        this.updateHotbarUI();
        
        this.updateEquipmentSlots();
        this.updateInventory();
    },

    updateHotbarUI() {
        const hotbarItem = this.player?.hotbar_slot;
        const hotbarBtn = document.getElementById('hotbar-btn');
        const hotbarIcon = document.getElementById('hotbar-icon');
        const hotbarLabel = document.getElementById('hotbar-label');
        
        if (hotbarItem && this.config.items[hotbarItem]) {
            const itemData = this.config.items[hotbarItem];
            hotbarIcon.textContent = itemData.icon || '📦';
            hotbarLabel.textContent = this.shortenItemName(hotbarItem);
            hotbarBtn.title = `Use ${hotbarItem} (Right-click inventory to change)`;
        } else {
            hotbarIcon.textContent = '📦';
            hotbarLabel.textContent = 'HOTBAR';
            hotbarBtn.title = 'Click inventory item to assign to hotbar';
        }
    },

    // ══════════ EQUIPMENT ══════════
    updateEquipmentSlots() {
        const equipped = this.player.equipped || {};
        
        ['weapon', 'armor', 'helmet', 'boots'].forEach(slot => {
            const el = document.getElementById(`equipped-${slot}`);
            const gridSlot = el?.closest('.grid-slot');
            
            if (el) {
                const itemName = equipped[slot];
                if (itemName) {
                    const itemData = this.config.items[itemName];
                    if (gridSlot) gridSlot.setAttribute('data-has-item', 'true');
                    
                    el.innerHTML = `
                        <div class="slot-item-name">${itemName}</div>
                        <div class="slot-item-stat">${itemData?.description || ''}</div>
                    `;
                    
                    if (gridSlot) {
                        gridSlot.style.cursor = 'pointer';
                        gridSlot.onclick = () => this.unequipItem(slot);
                    }
                } else {
                    if (gridSlot) {
                        gridSlot.removeAttribute('data-has-item');
                        gridSlot.onclick = null;
                    }
                    el.innerHTML = '<div class="slot-empty">EMPTY</div>';
                }
            }
        });
    },

    // ══════════ INVENTORY ══════════
    updateInventory() {
        const grid = document.getElementById('inventory-grid');
        if (!grid) return;
        
        if (!this.player.inventory?.length) {
            grid.innerHTML = '<p class="empty">— no items yet —</p>';
            return;
        }

        const equipped = this.player.equipped || {};
        const equippedItems = Object.values(equipped);
        const hotbarItem = this.player.hotbar_slot;
        
        grid.innerHTML = this.player.inventory.map(item => {
            if (!item?.name) return '';
            
            const itemData = this.config.items[item.name];
            const isEquipped = equippedItems.includes(item.name);
            const isHotbar = hotbarItem === item.name;
            const icon = itemData?.icon || '📦';
            
            return `
            <div class="inv-slot" 
                 onclick="Game.handleInventoryClick('${item.name}')"
                 oncontextmenu="Game.handleInventoryRightClick(event, '${item.name}')"
                 data-tooltip="${itemData?.description || item.name}">
                ${isEquipped ? '<div class="inv-slot-equipped"></div>' : ''}
                ${isHotbar ? '<div class="inv-slot-hotbar">H</div>' : ''}
                <div class="inv-slot-icon">${icon}</div>
                <div class="inv-slot-name">${this.shortenItemName(item.name)}</div>
                <div class="inv-slot-qty">×${item.quantity || 1}</div>
            </div>
            `;
        }).join('');
    },

    shortenItemName(name) {
        if (!name) return '';
        return name.replace('Adamantine', 'Adam.')
                   .replace('Mithril', 'Mith.')
                   .replace('Bronze', 'Brz.')
                   .replace('Steel', 'Stl.')
                   .replace('Iron', 'Irn.')
                   .replace('Health', 'HP')
                   .replace('Potion', 'Pot.')
                   .replace('Copper', 'Cu.')
                   .replace('Cooked', 'Ckd')
                   .replace(' Ore', '')
                   .replace(' Log', '');
    },

    handleInventoryClick(itemName) {
        const itemData = this.config.items[itemName];
        if (!itemData) return;
        
        if (itemData.type === 'consumable') {
            // Left click on consumable: use it immediately (outside combat) or show message
            if (!this.inBattle) {
                this.useConsumable(itemName);
            } else {
                this.addLog('💡 Right-click to assign to hotbar, or use hotbar button in combat');
            }
        } else if (itemData.type === 'resource') {
            this.addLog('📦 Materials are used for crafting');
        } else {
            const isEquipped = Object.values(this.player.equipped || {}).includes(itemName);
            
            if (isEquipped) {
                const slot = Object.keys(this.player.equipped).find(s => this.player.equipped[s] === itemName);
                if (slot) this.unequipItem(slot);
            } else {
                this.equipItem(itemName);
            }
        }
    },

    handleInventoryRightClick(event, itemName) {
        event.preventDefault();
        const itemData = this.config.items[itemName];
        if (!itemData) return;
        
        // Right click: assign to hotbar if consumable
        if (itemData.type === 'consumable') {
            const currentHotbar = this.player.hotbar_slot;
            if (currentHotbar === itemName) {
                // Clear hotbar if same item
                this.setHotbar(null);
            } else {
                // Set to hotbar
                this.setHotbar(itemName);
            }
        }
    },

    async equipItem(itemName) {
        try {
            const response = await wsManager.send({
                type: 'game',
                action: 'equip',
                token: Auth.token,
                item: itemName
            });
            
            if (response.success) {
                this.player = response.player;
                this.updateUI();
                this.addLog(`⚔ Equipped ${itemName}`, 'exp');
            } else {
                this.addLog(`❌ ${response.error || 'Failed to equip'}`);
            }
        } catch (error) {
            console.error('Error equipping:', error);
            this.addLog('Error: ' + error.message);
        }
    },

    async unequipItem(slot) {
        try {
            const response = await wsManager.send({
                type: 'game',
                action: 'unequip',
                token: Auth.token,
                slot: slot
            });
            
            if (response.success) {
                this.player = response.player;
                this.updateUI();
                this.addLog(`⚔ Unequipped from ${slot}`, 'exp');
            } else {
                this.addLog(`❌ ${response.error || 'Failed to unequip'}`);
            }
        } catch (error) {
            console.error('Error unequipping:', error);
            this.addLog('Error: ' + error.message);
        }
    },

    async useConsumable(itemName) {
        if (this.player?.hp >= this.player?.max_hp) {
            this.addLog('❌ HP is already full!');
            return;
        }

        try {
            const response = await wsManager.send({
                type: 'game',
                action: 'use_potion',
                token: Auth.token,
                item: itemName
            });
            
            if (response.success) {
                this.player = response.player;
                const itemData = this.config.items[itemName];
                const icon = itemData?.icon || '💊';
                this.addLog(`${icon} Used ${itemName}! Restored ${response.healed || 0} HP`, 'exp');
                this.updateUI();
            } else {
                this.addLog(`❌ ${response.error || 'Failed to use item'}`);
            }
        } catch (error) {
            console.error('Error using consumable:', error);
            this.addLog('Error: ' + error.message);
        }
    },

    // ══════════ BATTLE LOG ══════════
    addLog(message, type = '') {
        const log = document.getElementById('battle-log');
        if (!log) return;
        
        const p = document.createElement('p');
        p.textContent = message;
        if (type) p.classList.add(type);
        log.appendChild(p);
        log.scrollTop = log.scrollHeight;
        
        while (log.children.length > 50) {
            log.removeChild(log.firstChild);
        }
    }
};
