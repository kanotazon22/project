// ═══════════════════════════════════════════════════════════════════════════
// Shop/Market Module  
// Player-to-player marketplace for buying and selling items
// Price is per item, buyer can select quantity to buy
// ═══════════════════════════════════════════════════════════════════════════

const Shop = {
    // ══════════ STATE ══════════
    currentView: 'browse', // 'browse' or 'mylistings'
    searchQuery: '',
    listings: [],
    myListings: [],
    
    // Listing form state
    selectedItem: null,
    listQuantity: 1,
    listPrice: 100,
    
    // Buy form state
    buyQuantity: 1,
    selectedListing: null,

    // ══════════ RENDER SHOP TAB ══════════
    async renderShopTab() {
        const shopContainer = document.getElementById('shop-container');
        if (!shopContainer) return;

        shopContainer.innerHTML = `
            <div class="shop-header">
                <div class="shop-tabs">
                    <button class="shop-tab ${this.currentView === 'browse' ? 'active' : ''}" onclick="Shop.switchView('browse')">
                        🏪 BROWSE MARKET
                    </button>
                    <button class="shop-tab ${this.currentView === 'mylistings' ? 'active' : ''}" onclick="Shop.switchView('mylistings')">
                        📦 MY LISTINGS
                    </button>
                    <button class="shop-tab" onclick="Shop.showListItemDialog()">
                        ➕ SELL ITEM
                    </button>
                </div>
            </div>
            <div class="shop-content">
                ${this.currentView === 'browse' ? this.renderBrowseView() : this.renderMyListingsView()}
            </div>
        `;

        // Load data
        if (this.currentView === 'browse') {
            await this.searchMarketplace();
        } else {
            await this.loadMyListings();
        }
    },

    renderBrowseView() {
        return `
            <div class="shop-search">
                <input type="text" 
                       class="shop-search-input" 
                       placeholder="🔍 Search items..." 
                       value="${this.searchQuery}"
                       onkeyup="Shop.handleSearchInput(event)"
                       oninput="Shop.searchQuery = this.value">
                <button class="shop-search-btn" onclick="Shop.searchMarketplace()">SEARCH</button>
            </div>
            <div class="shop-listings" id="shop-listings">
                <div class="shop-loading">Loading marketplace...</div>
            </div>
        `;
    },

    renderMyListingsView() {
        return `
            <div class="shop-my-header">
                <h3>Your Active Listings</h3>
            </div>
            <div class="shop-listings" id="shop-listings">
                <div class="shop-loading">Loading your listings...</div>
            </div>
        `;
    },

    // ══════════ SEARCH & BROWSE ══════════
    async searchMarketplace() {
        try {
            const response = await wsManager.send({
                type: 'shop',
                action: 'search',
                token: Auth.token,
                query: this.searchQuery
            });

            if (response.success) {
                this.listings = response.listings;
                this.renderListings(this.listings, false);
            }
        } catch (error) {
            console.error('Search error:', error);
            Game.addLog('Error loading marketplace');
        }
    },

    async loadMyListings() {
        try {
            const response = await wsManager.send({
                type: 'shop',
                action: 'my_listings',
                token: Auth.token
            });

            if (response.success) {
                this.myListings = response.listings;
                this.renderListings(this.myListings, true);
            }
        } catch (error) {
            console.error('Load listings error:', error);
            Game.addLog('Error loading your listings');
        }
    },

    renderListings(listings, isMyListings) {
        const container = document.getElementById('shop-listings');
        if (!container) return;

        if (listings.length === 0) {
            container.innerHTML = `<div class="shop-empty">
                ${isMyListings ? '📦 You have no active listings' : '🏪 No items found'}
            </div>`;
            return;
        }

        container.innerHTML = listings.map(listing => {
            const itemData = Game.config.items[listing.item_name];
            const icon = itemData?.icon || '📦';
            const isOwnListing = Game.player && listing.seller === Game.player.username;

            return `
                <div class="shop-listing ${isOwnListing ? 'own-listing' : ''}">
                    <div class="shop-listing-icon">${icon}</div>
                    <div class="shop-listing-info">
                        <div class="shop-listing-name">${listing.item_name}</div>
                        <div class="shop-listing-meta">
                            <span class="shop-listing-qty">×${listing.quantity}</span>
                        </div>
                    </div>
                    <div class="shop-listing-price">
                        <div class="shop-price-amount">${listing.price.toLocaleString()}</div>
                        <div class="shop-price-label">GOLD/EACH</div>
                    </div>
                    <div class="shop-listing-actions">
                        ${isMyListings || isOwnListing ? `
                            <button class="shop-btn shop-btn-remove" onclick="Shop.removeListing('${listing.id}')">
                                REMOVE
                            </button>
                        ` : `
                            <button class="shop-btn shop-btn-buy" onclick="Shop.showBuyDialog('${listing.id}')">
                                BUY
                            </button>
                        `}
                    </div>
                </div>
            `;
        }).join('');
    },

    handleSearchInput(event) {
        if (event.key === 'Enter') {
            this.searchMarketplace();
        }
    },

    // ══════════ LIST ITEM DIALOG ══════════
    showListItemDialog() {
        if (!Game.player || !Game.player.inventory || Game.player.inventory.length === 0) {
            Game.addLog('❌ You have no items to sell');
            return;
        }

        const dialog = document.createElement('div');
        dialog.className = 'shop-dialog-overlay';
        dialog.innerHTML = `
            <div class="shop-dialog">
                <div class="shop-dialog-header">
                    <h3>📦 List Item for Sale</h3>
                    <button class="shop-dialog-close" onclick="Shop.closeDialog()">×</button>
                </div>
                <div class="shop-dialog-content">
                    <div class="shop-form-group">
                        <label>Select Item</label>
                        <select class="shop-form-select" id="shop-item-select" onchange="Shop.handleItemSelect()">
                            <option value="">-- Choose an item --</option>
                            ${Game.player.inventory.map(item => {
                                const itemData = Game.config.items[item.name];
                                const icon = itemData?.icon || '📦';
                                return `<option value="${item.name}">${icon} ${item.name} (×${item.quantity})</option>`;
                            }).join('')}
                        </select>
                    </div>
                    <div class="shop-form-group" id="shop-quantity-group" style="display:none;">
                        <label>Quantity to Sell</label>
                        <div class="shop-quantity-control">
                            <button class="shop-qty-btn" onclick="Shop.decreaseListQuantity()">−</button>
                            <input type="number" 
                                   class="shop-qty-input" 
                                   id="shop-quantity-input"
                                   value="1" 
                                   min="1" 
                                   max="1"
                                   onchange="Shop.updateListQuantity(this.value)">
                            <button class="shop-qty-btn" onclick="Shop.increaseListQuantity()">+</button>
                        </div>
                    </div>
                    <div class="shop-form-group">
                        <label>Price per item (Gold)</label>
                        <input type="number" 
                               class="shop-form-input" 
                               id="shop-price-input"
                               value="100" 
                               min="1" 
                               max="1000000"
                               placeholder="Enter price per item..."
                               onchange="Shop.updatePrice(this.value)">
                        <div class="shop-form-hint">Max: 1,000,000 gold per item</div>
                    </div>
                    <div class="shop-form-summary" id="shop-list-summary" style="display:none;">
                        <div class="shop-summary-label">You will receive:</div>
                        <div class="shop-summary-value" id="shop-list-total">0 gold</div>
                    </div>
                </div>
                <div class="shop-dialog-footer">
                    <button class="shop-btn shop-btn-secondary" onclick="Shop.closeDialog()">CANCEL</button>
                    <button class="shop-btn shop-btn-primary" onclick="Shop.confirmListing()">LIST ITEM</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);
    },

    handleItemSelect() {
        const select = document.getElementById('shop-item-select');
        const itemName = select.value;
        
        if (!itemName) {
            document.getElementById('shop-quantity-group').style.display = 'none';
            document.getElementById('shop-list-summary').style.display = 'none';
            this.selectedItem = null;
            return;
        }

        this.selectedItem = itemName;
        
        // Get max quantity
        const item = Game.player.inventory.find(i => i.name === itemName);
        const maxQty = item ? item.quantity : 1;
        
        // Show quantity control
        const qtyGroup = document.getElementById('shop-quantity-group');
        const qtyInput = document.getElementById('shop-quantity-input');
        qtyGroup.style.display = 'block';
        qtyInput.max = maxQty;
        qtyInput.value = 1;
        this.listQuantity = 1;
        
        this.updateListSummary();
    },

    updateListQuantity(value) {
        const qty = parseInt(value);
        if (isNaN(qty) || qty < 1) {
            this.listQuantity = 1;
            document.getElementById('shop-quantity-input').value = 1;
        } else {
            const item = Game.player.inventory.find(i => i.name === this.selectedItem);
            const maxQty = item ? item.quantity : 1;
            this.listQuantity = Math.min(qty, maxQty);
            document.getElementById('shop-quantity-input').value = this.listQuantity;
        }
        this.updateListSummary();
    },

    increaseListQuantity() {
        const input = document.getElementById('shop-quantity-input');
        const max = parseInt(input.max);
        if (this.listQuantity < max) {
            this.listQuantity++;
            input.value = this.listQuantity;
            this.updateListSummary();
        }
    },

    decreaseListQuantity() {
        if (this.listQuantity > 1) {
            this.listQuantity--;
            document.getElementById('shop-quantity-input').value = this.listQuantity;
            this.updateListSummary();
        }
    },

    updatePrice(value) {
        const price = parseInt(value);
        if (isNaN(price) || price < 1) {
            this.listPrice = 1;
            document.getElementById('shop-price-input').value = 1;
        } else {
            this.listPrice = Math.min(price, 1000000);
            document.getElementById('shop-price-input').value = this.listPrice;
        }
        this.updateListSummary();
    },

    updateListSummary() {
        if (!this.selectedItem) return;
        
        const summary = document.getElementById('shop-list-summary');
        const totalValue = document.getElementById('shop-list-total');
        
        const total = this.listPrice * this.listQuantity;
        totalValue.textContent = `${total.toLocaleString()} gold (${this.listQuantity}x ${this.listPrice}/each)`;
        summary.style.display = 'block';
    },

    // ══════════ BUY DIALOG WITH QUANTITY SELECTOR ══════════
    showBuyDialog(listingId) {
        const listing = this.listings.find(l => l.id === listingId);
        if (!listing) return;

        this.selectedListing = listing;
        this.buyQuantity = 1;

        const itemData = Game.config.items[listing.item_name];
        const icon = itemData?.icon || '📦';

        const dialog = document.createElement('div');
        dialog.className = 'shop-dialog-overlay';
        dialog.innerHTML = `
            <div class="shop-dialog">
                <div class="shop-dialog-header">
                    <h3>💰 Buy ${listing.item_name}</h3>
                    <button class="shop-dialog-close" onclick="Shop.closeDialog()">×</button>
                </div>
                <div class="shop-dialog-content">
                    <div class="shop-buy-item-display">
                        <div class="shop-buy-icon">${icon}</div>
                        <div class="shop-buy-info">
                            <div class="shop-buy-name">${listing.item_name}</div>
                            <div class="shop-buy-meta">
                                <span>${listing.price.toLocaleString()} gold/each</span>
                                <span>Seller: ${listing.seller}</span>
                            </div>
                            <div class="shop-buy-stock">Available: ${listing.quantity}</div>
                        </div>
                    </div>
                    
                    <div class="shop-form-group">
                        <label>Quantity to Buy</label>
                        <div class="shop-quantity-control">
                            <button class="shop-qty-btn" onclick="Shop.decreaseBuyQuantity()">−</button>
                            <input type="number" 
                                   class="shop-qty-input" 
                                   id="shop-buy-quantity-input"
                                   value="1" 
                                   min="1" 
                                   max="${listing.quantity}"
                                   onchange="Shop.updateBuyQuantity(this.value)">
                            <button class="shop-qty-btn" onclick="Shop.increaseBuyQuantity()">+</button>
                        </div>
                    </div>
                    
                    <div class="shop-form-summary">
                        <div class="shop-summary-label">Total cost:</div>
                        <div class="shop-summary-value shop-summary-highlight" id="shop-buy-total">${listing.price.toLocaleString()} gold</div>
                    </div>
                    
                    <div class="shop-buy-gold-check">
                        Your gold: <span id="shop-player-gold">${Game.player.gold.toLocaleString()}</span>
                    </div>
                </div>
                <div class="shop-dialog-footer">
                    <button class="shop-btn shop-btn-secondary" onclick="Shop.closeDialog()">CANCEL</button>
                    <button class="shop-btn shop-btn-primary" onclick="Shop.confirmBuy()">CONFIRM PURCHASE</button>
                </div>
            </div>
        `;

        document.body.appendChild(dialog);
    },

    updateBuyQuantity(value) {
        const qty = parseInt(value);
        if (isNaN(qty) || qty < 1) {
            this.buyQuantity = 1;
            document.getElementById('shop-buy-quantity-input').value = 1;
        } else {
            this.buyQuantity = Math.min(qty, this.selectedListing.quantity);
            document.getElementById('shop-buy-quantity-input').value = this.buyQuantity;
        }
        this.updateBuySummary();
    },

    increaseBuyQuantity() {
        const input = document.getElementById('shop-buy-quantity-input');
        const max = parseInt(input.max);
        if (this.buyQuantity < max) {
            this.buyQuantity++;
            input.value = this.buyQuantity;
            this.updateBuySummary();
        }
    },

    decreaseBuyQuantity() {
        if (this.buyQuantity > 1) {
            this.buyQuantity--;
            document.getElementById('shop-buy-quantity-input').value = this.buyQuantity;
            this.updateBuySummary();
        }
    },

    updateBuySummary() {
        if (!this.selectedListing) return;
        
        const totalCost = this.selectedListing.price * this.buyQuantity;
        const totalEl = document.getElementById('shop-buy-total');
        totalEl.textContent = `${totalCost.toLocaleString()} gold (${this.buyQuantity}x ${this.selectedListing.price}/each)`;
        
        // Check if player has enough gold
        const goldCheckEl = document.querySelector('.shop-buy-gold-check');
        if (totalCost > Game.player.gold) {
            goldCheckEl.style.color = '#e74c3c';
            goldCheckEl.innerHTML = `Your gold: <span>${Game.player.gold.toLocaleString()}</span> ❌ Not enough!`;
        } else {
            goldCheckEl.style.color = 'var(--k)';
            goldCheckEl.innerHTML = `Your gold: <span id="shop-player-gold">${Game.player.gold.toLocaleString()}</span>`;
        }
    },

    closeDialog() {
        const dialog = document.querySelector('.shop-dialog-overlay');
        if (dialog) dialog.remove();
        
        // Reset state
        this.selectedItem = null;
        this.listQuantity = 1;
        this.listPrice = 100;
        this.buyQuantity = 1;
        this.selectedListing = null;
    },

    // ══════════ MARKETPLACE ACTIONS ══════════
    async confirmListing() {
        if (!this.selectedItem) {
            Game.addLog('❌ Please select an item');
            return;
        }

        try {
            const response = await wsManager.send({
                type: 'shop',
                action: 'list',
                token: Auth.token,
                item: this.selectedItem,
                quantity: this.listQuantity,
                price: this.listPrice
            });

            if (response.success) {
                Game.player = response.player;
                Game.updateUI();
                const total = this.listPrice * this.listQuantity;
                Game.addLog(`📦 Listed ${this.listQuantity}x ${this.selectedItem} (${total.toLocaleString()} gold total)`, 'exp');
                this.closeDialog();
                
                // Refresh view
                if (this.currentView === 'mylistings') {
                    await this.loadMyListings();
                }
            } else {
                Game.addLog(`❌ ${response.error || 'Failed to list item'}`);
            }
        } catch (error) {
            console.error('List item error:', error);
            Game.addLog('Error: ' + error.message);
        }
    },

    async confirmBuy() {
        if (!this.selectedListing) return;

        const totalCost = this.selectedListing.price * this.buyQuantity;
        
        if (totalCost > Game.player.gold) {
            Game.addLog('❌ Not enough gold!');
            return;
        }

        try {
            const response = await wsManager.send({
                type: 'shop',
                action: 'buy',
                token: Auth.token,
                listing_id: this.selectedListing.id,
                quantity: this.buyQuantity
            });

            if (response.success) {
                Game.player = response.player;
                Game.updateUI();
                Game.addLog(`✅ Purchased ${this.buyQuantity}x ${this.selectedListing.item_name} for ${totalCost.toLocaleString()} gold`, 'exp');
                this.closeDialog();
                
                // Refresh marketplace
                await this.searchMarketplace();
            } else {
                Game.addLog(`❌ ${response.error || 'Failed to buy item'}`);
            }
        } catch (error) {
            console.error('Buy item error:', error);
            Game.addLog('Error: ' + error.message);
        }
    },

    async removeListing(listingId) {
        if (!confirm('Remove this listing? Items will be returned to your inventory.')) {
            return;
        }

        try {
            const response = await wsManager.send({
                type: 'shop',
                action: 'remove',
                token: Auth.token,
                listing_id: listingId
            });

            if (response.success) {
                Game.player = response.player;
                Game.updateUI();
                Game.addLog(`📦 Listing removed and items returned`, 'exp');
                
                // Refresh view
                if (this.currentView === 'mylistings') {
                    await this.loadMyListings();
                } else {
                    await this.searchMarketplace();
                }
            } else {
                Game.addLog(`❌ ${response.error || 'Failed to remove listing'}`);
            }
        } catch (error) {
            console.error('Remove listing error:', error);
            Game.addLog('Error: ' + error.message);
        }
    },

    // ══════════ VIEW SWITCHING ══════════
    async switchView(view) {
        this.currentView = view;
        await this.renderShopTab();
    }
};