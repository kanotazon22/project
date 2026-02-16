// ═══════════════════════════════════════════════════════════════════════════
// Gathering & Processing Module  
// - Gathering: Mining, Woodcutting, Fishing (single task only)
// - Processing: Cooking, Smithing, Crafting (multi-task support with quantity input)
// All config from server, client only renders UI
// ═══════════════════════════════════════════════════════════════════════════

const Gather = {
    // ══════════ STATE ══════════
    isActive: false,
    currentSkill: null,
    currentResource: null,
    currentType: null, // 'gather' or 'process'
    activeTimer: null,
    startTime: null,
    totalDelay: null,
    progressInterval: null,
    quantities: {}, // Store quantity for each recipe {itemName: quantity}

    // ══════════ RENDER NPCs ══════════
    renderNPCsTab() {
        if (!Game.player || !Game.config.npcs) return;

        const npcsGrid = document.getElementById('npcs-grid');
        if (!npcsGrid) return;

        const npcs = Game.config.npcs[Game.currentMap] || [];

        if (npcs.length === 0) {
            npcsGrid.innerHTML = '<p class="empty">— No NPCs in this area —</p>';
            return;
        }

        npcsGrid.innerHTML = npcs.map(npc => `
            <div class="npc-card" onclick="Gather.openNPC('${npc.id}', '${npc.type}')">
                <div class="npc-icon">${npc.icon}</div>
                <div class="npc-name">${npc.name}</div>
                <div class="npc-desc">${npc.description}</div>
            </div>
        `).join('');
    },

    // ══════════ OPEN NPC INTERFACE ══════════
    openNPC(npcId, skillType) {
        this.currentSkill = skillType;
        
        // Determine if this is gathering or processing
        const gatheringSkills = ['mining', 'woodcutting', 'fishing'];
        const processingSkills = ['cooking', 'smithing', 'crafting'];
        
        if (gatheringSkills.includes(skillType)) {
            this.showGatheringInterface(skillType);
        } else if (processingSkills.includes(skillType)) {
            this.showProcessingInterface(skillType);
        }
    },

    // ══════════ GATHERING INTERFACE ══════════
    async showGatheringInterface(skill) {
        // Get resources for this skill from gatheringResources object
        const resourceNames = Game.config.gatheringResources?.[skill] || [];
        const resources = [];
        
        // Build resource list with data from items config
        for (const resourceName of resourceNames) {
            const itemData = Game.config.items[resourceName];
            if (itemData && itemData.gatherable && itemData.skill === skill) {
                resources.push({
                    name: resourceName,
                    level_required: itemData.level_required || 1,
                    exp: itemData.exp_reward || 10,
                    icon: itemData.icon || '📦'
                });
            }
        }

        const skillLevel = this.getSkillLevel(skill);
        const skillExp = this.getSkillExp(skill);
        const expNeeded = 100 + skillLevel * 15;

        const npcsGrid = document.getElementById('npcs-grid');
        if (!npcsGrid) return;

        const skillIcon = Game.config.skillIcons?.[skill] || '📦';

        npcsGrid.innerHTML = `
            <div class="gathering-interface">
                <div class="gathering-header">
                    <div class="gathering-title">
                        <span class="gathering-icon">${skillIcon}</span>
                        <span>${this.capitalize(skill)}</span>
                    </div>
                    <button onclick="Gather.backToNPCs()" class="btn-back">← BACK</button>
                </div>
                <div class="gathering-stats">
                    <div>Level: ${skillLevel}</div>
                    <div>EXP: ${skillExp} / ${expNeeded}</div>
                </div>
                <div class="gather-resources-list">
                    ${resources.map(r => this.renderResourceOption(r, skillLevel, skill)).join('')}
                </div>
            </div>
        `;
    },

    renderResourceOption(resource, playerLevel, skill) {
        const isLocked = playerLevel < resource.level_required;
        const icon = resource.icon || '📦';
        const isActive = this.isActive && this.currentResource === resource.name && this.currentSkill === skill;

        let actionText = isLocked ? '🔒 LOCKED' : (isActive ? 'GATHERING...' : 'GATHER');

        return `
            <div class="gather-resource ${isLocked ? 'locked' : ''} ${isActive ? 'gathering' : ''}" 
                 id="resource-${resource.name.replace(/\s+/g, '-')}"
                 ${!isLocked && !isActive ? `onclick="Gather.startGathering('${resource.name}')"` : ''}>
                <div class="gather-resource-header">
                    <div class="gather-resource-icon">${icon}</div>
                    <div class="gather-resource-info">
                        <div class="gather-resource-name">${resource.name}</div>
                        <div class="gather-resource-meta">
                            <span>Lv ${resource.level_required}</span>
                            <span>+${resource.exp} EXP</span>
                        </div>
                    </div>
                    <button class="gather-resource-action" 
                            ${isLocked || isActive ? 'disabled' : ''}
                            ${!isLocked && !isActive ? `onclick="event.stopPropagation(); Gather.startGathering('${resource.name}')"` : ''}>
                        ${actionText}
                    </button>
                </div>
                ${isActive ? `
                    <div class="gather-resource-progress">
                        <div class="gather-resource-progress-fill" id="progress-fill-${resource.name.replace(/\s+/g, '-')}"></div>
                        <div class="gather-resource-time" id="progress-time-${resource.name.replace(/\s+/g, '-')}">...</div>
                    </div>
                ` : ''}
            </div>
        `;
    },

    // ══════════ PROCESSING INTERFACE ══════════
    async showProcessingInterface(skill) {
        const skillLevel = this.getSkillLevel(skill);
        const skillExp = this.getSkillExp(skill);
        const expNeeded = 100 + skillLevel * 15;

        const npcsGrid = document.getElementById('npcs-grid');
        if (!npcsGrid) return;

        const skillIcon = Game.config.skillIcons?.[skill] || '📦';

        // Get processable/craftable items for this skill
        const recipes = this.getRecipesForSkill(skill);

        npcsGrid.innerHTML = `
            <div class="gathering-interface">
                <div class="gathering-header">
                    <div class="gathering-title">
                        <span class="gathering-icon">${skillIcon}</span>
                        <span>${this.capitalize(skill)}</span>
                    </div>
                    <button onclick="Gather.backToNPCs()" class="btn-back">← BACK</button>
                </div>
                <div class="gathering-stats">
                    <div>Level: ${skillLevel}</div>
                    <div>EXP: ${skillExp} / ${expNeeded}</div>
                </div>
                <div class="gather-resources-list">
                    ${recipes.map(r => this.renderRecipeOption(r, skillLevel, skill)).join('')}
                </div>
            </div>
        `;
    },

    getRecipesForSkill(skill) {
        const recipes = [];
        const processingResources = Game.config.processingResources?.[skill] || [];
        
        for (const itemName of processingResources) {
            const itemData = Game.config.items[itemName];
            if (!itemData) continue;
            
            if (skill === 'crafting') {
                // Crafting uses recipes from config
                const recipe = Game.config.craftingRecipes?.[itemName];
                if (recipe) {
                    recipes.push({
                        name: itemName,
                        level_required: recipe.level_required || 1,
                        exp: recipe.exp_reward || 10,
                        icon: itemData.icon || '📦',
                        requires: recipe.requires || {},
                        produces: recipe.produces || 1
                    });
                }
            } else {
                // Cooking and smithing use processable items
                if (itemData.processable && itemData.skill === skill) {
                    recipes.push({
                        name: itemName,
                        level_required: itemData.level_required || 1,
                        exp: itemData.exp_reward || 10,
                        icon: itemData.icon || '📦',
                        requires: itemData.requires || {},
                        produces: itemData.produces || 1
                    });
                }
            }
        }
        
        return recipes;
    },

    renderRecipeOption(recipe, playerLevel, skill) {
        const isLocked = playerLevel < recipe.level_required;
        const icon = recipe.icon || '📦';
        const isActive = this.isActive && this.currentResource === recipe.name && this.currentSkill === skill;

        // Get current quantity for this recipe (default 1)
        const quantity = this.quantities[recipe.name] || 1;
        
        // Check materials for current quantity
        const hasMaterials = this.checkMaterials(recipe.requires, quantity);
        const maxQuantity = this.getMaxQuantity(recipe.requires);
        
        let actionText = isLocked ? '🔒 LOCKED' : (isActive ? 'PROCESSING...' : (hasMaterials ? 'PROCESS' : 'NO MATERIALS'));
        const canProcess = !isLocked && hasMaterials && !isActive;

        // Build materials display with quantity multiplier
        const materialsHTML = Object.entries(recipe.requires).map(([mat, qtyPerCraft]) => {
            const needed = qtyPerCraft * quantity;
            const owned = this.getItemQuantity(mat);
            const hasEnough = owned >= needed;
            return `<span class="${hasEnough ? 'has-material' : 'missing-material'}">${needed}x ${mat} (${owned})</span>`;
        }).join(', ');

        const totalExp = recipe.exp * quantity;
        const totalTime = 5 * quantity;

        return `
            <div class="gather-resource ${isLocked ? 'locked' : ''} ${!hasMaterials ? 'no-materials' : ''} ${isActive ? 'gathering' : ''}" 
                 id="resource-${recipe.name.replace(/\s+/g, '-')}"
                 ${canProcess ? `onclick="Gather.startProcessing('${recipe.name}')"` : ''}>
                <div class="gather-resource-header">
                    <div class="gather-resource-icon">${icon}</div>
                    <div class="gather-resource-info">
                        <div class="gather-resource-name">${recipe.name}</div>
                        <div class="gather-resource-meta">
                            <span>Lv ${recipe.level_required}</span>
                            <span>+${totalExp} EXP ⏱ ${totalTime}s</span>
                            <span>
                        </div>
                        <div class="gather-resource-materials">${materialsHTML}</div>
                        ${!isActive ? `
                        <div class="gather-quantity-control">
                            <div class="gather-quantity-row">
                                <button class="qty-btn" onclick="event.stopPropagation(); Gather.decreaseQuantity('${recipe.name}')" ${quantity <= 1 ? 'disabled' : ''}>−</button>
                                <input type="number" class="qty-input" value="${quantity}" min="1" max="${maxQuantity}" 
                                       onchange="Gather.setQuantity('${recipe.name}', this.value)" 
                                       onclick="event.stopPropagation()">
                                <button class="qty-btn" onclick="event.stopPropagation(); Gather.increaseQuantity('${recipe.name}')" ${quantity >= maxQuantity ? 'disabled' : ''}>+</button>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                    <button class="gather-resource-action" 
                            ${!canProcess ? 'disabled' : ''}
                            ${canProcess ? `onclick="event.stopPropagation(); Gather.startProcessing('${recipe.name}')"` : ''}>
                        ${actionText}
                    </button>
                </div>
                ${isActive ? `
                    <div class="gather-resource-progress">
                        <div class="gather-resource-progress-fill" id="progress-fill-${recipe.name.replace(/\s+/g, '-')}"></div>
                        <div class="gather-resource-time" id="progress-time-${recipe.name.replace(/\s+/g, '-')}">${totalTime.toFixed(1)}s</div>
                    </div>
                ` : ''}
            </div>
        `;
    },

    // ══════════ QUANTITY CONTROLS ══════════
    increaseQuantity(itemName) {
        const current = this.quantities[itemName] || 1;
        const recipes = this.getRecipesForSkill(this.currentSkill);
        const recipe = recipes.find(r => r.name === itemName);
        if (!recipe) return;
        
        const maxQty = this.getMaxQuantity(recipe.requires);
        if (current < maxQty) {
            this.quantities[itemName] = current + 1;
            this.showProcessingInterface(this.currentSkill);
        }
    },

    decreaseQuantity(itemName) {
        const current = this.quantities[itemName] || 1;
        if (current > 1) {
            this.quantities[itemName] = current - 1;
            this.showProcessingInterface(this.currentSkill);
        }
    },

    setQuantity(itemName, value) {
        const qty = parseInt(value);
        if (isNaN(qty) || qty < 1) {
            this.quantities[itemName] = 1;
        } else {
            const recipes = this.getRecipesForSkill(this.currentSkill);
            const recipe = recipes.find(r => r.name === itemName);
            if (!recipe) return;
            
            const maxQty = this.getMaxQuantity(recipe.requires);
            this.quantities[itemName] = Math.min(qty, maxQty);
        }
        this.showProcessingInterface(this.currentSkill);
    },

    getMaxQuantity(requires) {
        let maxQty = 100; // Hard limit
        for (const [material, qtyPerCraft] of Object.entries(requires)) {
            const owned = this.getItemQuantity(material);
            const possible = Math.floor(owned / qtyPerCraft);
            maxQty = Math.min(maxQty, possible);
        }
        return Math.max(1, maxQty);
    },

    checkMaterials(requires, quantity = 1) {
        for (const [material, qtyPerCraft] of Object.entries(requires)) {
            const needed = qtyPerCraft * quantity;
            if (this.getItemQuantity(material) < needed) {
                return false;
            }
        }
        return true;
    },

    getItemQuantity(itemName) {
        if (!Game.player?.inventory) return 0;
        const item = Game.player.inventory.find(i => i.name === itemName);
        return item ? (item.quantity || 1) : 0;
    },

    backToNPCs() {
        if (this.isActive) {
            this.cancelSession();
        }
        this.renderNPCsTab();
    },

    // ══════════ GATHERING ACTIONS ══════════
    async startGathering(resourceName) {
        if (this.isActive) return;

        try {
            const response = await wsManager.send({
                type: 'gather',
                action: 'start',
                token: Auth.token,
                skill: this.currentSkill,
                resource: resourceName
            });

            if (response.success) {
                this.isActive = true;
                this.currentResource = resourceName;
                this.currentType = 'gather';
                this.startTime = Date.now();
                this.totalDelay = response.delay;
                
                // Refresh UI
                this.showGatheringInterface(this.currentSkill);
                
                // Animate progress
                setTimeout(() => {
                    const fill = document.getElementById(`progress-fill-${resourceName.replace(/\s+/g, '-')}`);
                    if (fill) {
                        fill.style.transition = `width ${response.delay}s linear`;
                        fill.style.width = '100%';
                    }
                    this.updateProgressTime();
                }, 50);

                // Auto-complete
                this.activeTimer = setTimeout(() => {
                    this.completeSession();
                }, response.delay * 1000);
            } else {
                Game.addLog(`❌ ${response.error || 'Failed to start gathering'}`);
            }
        } catch (error) {
            console.error('Gathering error:', error);
            Game.addLog('Error: ' + error.message);
        }
    },

    // ══════════ PROCESSING ACTIONS ══════════
    async startProcessing(itemName) {
        if (this.isActive) return;

        const quantity = this.quantities[itemName] || 1;

        try {
            const response = await wsManager.send({
                type: 'process',
                action: 'start',
                token: Auth.token,
                skill: this.currentSkill,
                item: itemName,
                quantity: quantity
            });

            if (response.success) {
                this.isActive = true;
                this.currentResource = itemName;
                this.currentType = 'process';
                this.startTime = Date.now();
                this.totalDelay = response.delay;
                
                // Refresh UI
                this.showProcessingInterface(this.currentSkill);
                
                // Animate progress
                setTimeout(() => {
                    const fill = document.getElementById(`progress-fill-${itemName.replace(/\s+/g, '-')}`);
                    if (fill) {
                        fill.style.transition = `width ${response.delay}s linear`;
                        fill.style.width = '100%';
                    }
                    this.updateProgressTime();
                }, 50);

                // Auto-complete
                this.activeTimer = setTimeout(() => {
                    this.completeSession();
                }, response.delay * 1000);
            } else {
                Game.addLog(`❌ ${response.error || 'Failed to start processing'}`);
            }
        } catch (error) {
            console.error('Processing error:', error);
            Game.addLog('Error: ' + error.message);
        }
    },

    updateProgressTime() {
        if (!this.isActive || !this.currentResource) return;

        const timeDisplay = document.getElementById(`progress-time-${this.currentResource.replace(/\s+/g, '-')}`);
        if (!timeDisplay) return;

        const elapsed = (Date.now() - this.startTime) / 1000;
        const remaining = Math.max(0, this.totalDelay - elapsed);

        timeDisplay.textContent = remaining.toFixed(1) + 's';

        if (remaining > 0) {
            this.progressInterval = setTimeout(() => this.updateProgressTime(), 100);
        }
    },

    async completeSession() {
        if (!this.isActive) return;

        try {
            let response;
            if (this.currentType === 'gather') {
                response = await wsManager.send({
                    type: 'gather',
                    action: 'complete',
                    token: Auth.token
                });
            } else {
                response = await wsManager.send({
                    type: 'process',
                    action: 'complete',
                    token: Auth.token
                });
            }

            if (response.success) {
                Game.player = response.player;
                Game.updateUI();
                
                // Show success message
                if (this.currentType === 'gather') {
                    const itemData = Game.config.items[response.resource];
                    const icon = itemData?.icon || '📦';
                    Game.addLog(`${icon} Gathered ${response.resource}! +${response.exp_gained} EXP`, 'exp');
                } else {
                    const itemData = Game.config.items[response.item];
                    const icon = itemData?.icon || '📦';
                    Game.addLog(`${icon} Created ${response.produced}x ${response.item}! +${response.exp_gained} EXP`, 'exp');
                }
                
                if (response.level_up) {
                    Game.addLog(`🎉 ${this.capitalize(response.skill)} leveled up to ${response.new_level}!`, 'levelup');
                }
            }
        } catch (error) {
            console.error('Complete session error:', error);
        } finally {
            this.resetState();
            
            // Refresh the interface
            if (this.currentSkill) {
                if (['mining', 'woodcutting', 'fishing'].includes(this.currentSkill)) {
                    this.showGatheringInterface(this.currentSkill);
                } else {
                    this.showProcessingInterface(this.currentSkill);
                }
            }
        }
    },

    async cancelSession() {
        if (!this.isActive) return;

        try {
            if (this.currentType === 'gather') {
                await wsManager.send({
                    type: 'gather',
                    action: 'cancel',
                    token: Auth.token
                });
            } else {
                await wsManager.send({
                    type: 'process',
                    action: 'cancel',
                    token: Auth.token
                });
            }
        } catch (error) {
            console.error('Cancel error:', error);
        } finally {
            this.resetState();
            if (this.currentSkill) {
                if (['mining', 'woodcutting', 'fishing'].includes(this.currentSkill)) {
                    this.showGatheringInterface(this.currentSkill);
                } else {
                    this.showProcessingInterface(this.currentSkill);
                }
            }
        }
    },

    resetState() {
        this.isActive = false;
        this.currentResource = null;
        this.currentType = null;
        this.startTime = null;
        this.totalDelay = null;
        
        if (this.progressInterval) {
            clearTimeout(this.progressInterval);
            this.progressInterval = null;
        }
        if (this.activeTimer) {
            clearTimeout(this.activeTimer);
            this.activeTimer = null;
        }
    },

    // ══════════ HELPERS ══════════
    getSkillLevel(skill) {
        if (!Game.player) return 1;
        return Game.player[`${skill}_level`] || 1;
    },

    getSkillExp(skill) {
        if (!Game.player) return 0;
        return Game.player[`${skill}_exp`] || 0;
    },

    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
};
