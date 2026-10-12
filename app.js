/**
 * CYBERQUEST - RPG Habit Tracker
 * Architecture: gameState -> Storage -> RPGSystem -> UIController
 */

// ==========================================
// DEFAULT STATE TEMPLATE
// ==========================================
const DEFAULT_STATE = {
  hero: {
    name: "V_OPERATIVE",
    class: "CYBER_MERCENARY",
    level: 1,
    currentXP: 0,
    maxXP: 100,
    currentHP: 100,
    maxHP: 100,
    gold: 50,
    statPoints: 3,
    stats: {
      str: 10,
      int: 10,
      agi: 10
    }
  },
  quests: [
    {
      id: "demo-quest-1",
      title: "Run Neural Diagnostics (Drink 2L Water)",
      difficulty: "easy",
      category: "routine",
      xpReward: 25,
      goldReward: 10,
      completed: false,
      createdAt: 1700000000000
    },
    {
      id: "demo-quest-2",
      title: "Physical Conditioning (30m Workout)",
      difficulty: "medium",
      category: "fitness",
      xpReward: 50,
      goldReward: 25,
      completed: false,
      createdAt: 1700000000001
    }
  ],
  shopItems: [
    {
      id: "synth-stim",
      name: "SYNTH-STIM VIAL",
      desc: "Restores +30 HP to vitals",
      price: 20,
      type: "consumable",
      effect: "heal",
      amount: 30
    },
    {
      id: "neural-overclock",
      name: "NEURAL OVERCLOCK",
      desc: "+1 Stat Point permanently",
      price: 75,
      type: "consumable",
      effect: "statPoint",
      amount: 1
    },
    {
      id: "coffee-ration",
      name: "ESPRESSO RATION",
      desc: "Voucher: 1 Guilt-free artisanal coffee break",
      price: 30,
      type: "reward",
      effect: "voucher"
    },
    {
      id: "holonet-pass",
      name: "HOLONET ACCESS (1 HR)",
      desc: "Voucher: 1 Hour of gaming or leisure",
      price: 90,
      type: "reward",
      effect: "voucher"
    }
  ],
  inventory: []
};

// ==========================================
// 1. STATE CONTAINER (gameState)
// ==========================================
let gameState = JSON.parse(JSON.stringify(DEFAULT_STATE));

// ==========================================
// 2. STORAGE MODULE (Storage)
// ==========================================
const Storage = {
  KEY: "CYBERQUEST_PROGRESS_DATA_V1",

  save() {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(gameState));
      return true;
    } catch (err) {
      console.error("Storage save failed:", err);
      return false;
    }
  },

  load() {
    try {
      const serialized = localStorage.getItem(this.KEY);
      if (!serialized) return false;

      const loaded = JSON.parse(serialized);
      // Merge with default state structure to prevent missing properties
      gameState = {
        ...DEFAULT_STATE,
        ...loaded,
        hero: { ...DEFAULT_STATE.hero, ...loaded.hero },
        quests: loaded.quests || [],
        inventory: loaded.inventory || [],
        shopItems: DEFAULT_STATE.shopItems
      };
      return true;
    } catch (err) {
      console.error("Storage load failed, reverting to default:", err);
      gameState = JSON.parse(JSON.stringify(DEFAULT_STATE));
      return false;
    }
  },

  reset() {
    try {
      localStorage.removeItem(this.KEY);
      gameState = JSON.parse(JSON.stringify(DEFAULT_STATE));
      return true;
    } catch (err) {
      console.error("Storage reset failed:", err);
      return false;
    }
  }
};

// ==========================================
// 3. RPG LOGIC MODULE (RPGSystem)
// ==========================================
const RPGSystem = {
  difficultyRewards: {
    easy: { xp: 25, gold: 10 },
    medium: { xp: 50, gold: 25 },
    hard: { xp: 100, gold: 60 }
  },

  calculateMaxXP(level) {
    return Math.floor(100 * Math.pow(level, 1.4));
  },

  calculateMaxHP(level, str) {
    return 100 + (level - 1) * 20 + (str - 10) * 10;
  },

  addXP(amount) {
    const hero = gameState.hero;
    hero.currentXP += amount;

    let leveledUp = false;

    while (hero.currentXP >= hero.maxXP) {
      hero.currentXP -= hero.maxXP;
      hero.level += 1;
      hero.statPoints += 2;
      hero.maxXP = this.calculateMaxXP(hero.level);
      
      hero.maxHP = this.calculateMaxHP(hero.level, hero.stats.str);
      hero.currentHP = hero.maxHP;
      leveledUp = true;
    }

    Storage.save();
    UIController.renderAll();
    return leveledUp;
  },

  allocateStatPoint(statName) {
    const hero = gameState.hero;

    if (hero.statPoints <= 0) return false;
    if (!(statName in hero.stats)) return false;

    hero.stats[statName] += 1;
    hero.statPoints -= 1;

    if (statName === "str") {
      const oldMax = hero.maxHP;
      hero.maxHP = this.calculateMaxHP(hero.level, hero.stats.str);
      hero.currentHP += (hero.maxHP - oldMax);
    }

    Storage.save();
    UIController.renderAll();
    return true;
  },

  addGold(amount) {
    gameState.hero.gold += amount;
    Storage.save();
    UIController.renderAll();
  },

  // Quests
  createQuest(title, difficulty, category) {
    const rewards = this.difficultyRewards[difficulty] || this.difficultyRewards.medium;
    const newQuest = {
      id: "quest-" + Date.now(),
      title: title.trim(),
      difficulty,
      category,
      xpReward: rewards.xp,
      goldReward: rewards.gold,
      completed: false,
      createdAt: Date.now()
    };

    gameState.quests.push(newQuest);
    Storage.save();
    UIController.renderQuests();
  },

  completeQuest(questId) {
    const quest = gameState.quests.find(q => q.id === questId);
    if (!quest || quest.completed) return;

    quest.completed = true;
    this.addXP(quest.xpReward);
    this.addGold(quest.goldReward);
    Storage.save();
    UIController.renderQuests();
  },

  deleteQuest(questId) {
    gameState.quests = gameState.quests.filter(q => q.id !== questId);
    Storage.save();
    UIController.renderQuests();
  },

  // Shop
  buyItem(itemId) {
    const item = gameState.shopItems.find(i => i.id === itemId);
    if (!item) return;

    if (gameState.hero.gold < item.price) {
      UIController.showToast("DEPOT ERROR: Insufficient credits.", true);
      return;
    }

    gameState.hero.gold -= item.price;

    if (item.effect === "heal") {
      gameState.hero.currentHP = Math.min(gameState.hero.maxHP, gameState.hero.currentHP + item.amount);
      UIController.showToast(`ACQUIRED: ${item.name} (+${item.amount} HP)`);
    } else if (item.effect === "statPoint") {
      gameState.hero.statPoints += item.amount;
      UIController.showToast(`ACQUIRED: ${item.name} (+${item.amount} Stat Point)`);
    } else {
      gameState.inventory.push({ ...item, acquiredAt: Date.now() });
      UIController.showToast(`ACQUIRED VOUCHER: ${item.name}`);
    }

    Storage.save();
    UIController.renderAll();
  }
};

// ==========================================
// 4. UI RENDERING MODULE (UIController)
// ==========================================
const UIController = {
  elements: {
    heroName: document.getElementById("hero-name"),
    heroClass: document.getElementById("hero-class"),
    heroLevel: document.getElementById("hero-level"),
    heroXPLabel: document.getElementById("hero-xp-label"),
    heroXPBar: document.getElementById("hero-xp-bar"),
    heroHPLabel: document.getElementById("hero-hp-label"),
    heroHPBar: document.getElementById("hero-hp-bar"),
    heroGold: document.getElementById("hero-gold"),
    heroStatPoints: document.getElementById("hero-stat-points"),
    statStr: document.getElementById("stat-str"),
    statInt: document.getElementById("stat-int"),
    statAgi: document.getElementById("stat-agi"),
    statIncButtons: document.querySelectorAll(".btn-stat-inc"),
    // Quests
    questForm: document.getElementById("quest-form"),
    questTitleInput: document.getElementById("quest-title"),
    questDifficultyInput: document.getElementById("quest-difficulty"),
    questCategoryInput: document.getElementById("quest-category"),
    activeQuestList: document.getElementById("quest-list-active"),
    completedQuestList: document.getElementById("quest-list-completed"),
    // Shop
    shopContainer: document.getElementById("shop-items"),
    // System Header Buttons
    btnSave: document.getElementById("btn-save-data"),
    btnReset: document.getElementById("btn-reset-data")
  },

  showToast(message, isDanger = false) {
    let toast = document.querySelector(".system-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "system-toast";
      document.body.appendChild(toast);
    }

    toast.textContent = `// ${message}`;
    toast.className = isDanger ? "system-toast danger" : "system-toast";
    toast.style.display = "block";

    setTimeout(() => {
      toast.style.display = "none";
    }, 3000);
  },

  renderHeroProfile() {
    const hero = gameState.hero;
    const el = this.elements;

    el.heroName.textContent = hero.name;
    el.heroClass.textContent = hero.class;
    el.heroLevel.textContent = hero.level;
    
    el.heroXPLabel.textContent = `${hero.currentXP} / ${hero.maxXP} XP`;
    const xpPercent = Math.min(100, Math.floor((hero.currentXP / hero.maxXP) * 100));
    el.heroXPBar.style.width = `${xpPercent}%`;

    el.heroHPLabel.textContent = `${hero.currentHP} / ${hero.maxHP} HP`;
    const hpPercent = Math.min(100, Math.floor((hero.currentHP / hero.maxHP) * 100));
    el.heroHPBar.style.width = `${hpPercent}%`;

    el.heroGold.textContent = `⬡ ${hero.gold}`;
    el.heroStatPoints.textContent = hero.statPoints;

    el.statStr.textContent = hero.stats.str;
    el.statInt.textContent = hero.stats.int;
    el.statAgi.textContent = hero.stats.agi;

    el.statIncButtons.forEach(button => {
      button.disabled = hero.statPoints <= 0;
    });
  },

  renderQuests() {
    const activeQuests = gameState.quests.filter(q => !q.completed);
    const completedQuests = gameState.quests.filter(q => q.completed);

    if (activeQuests.length === 0) {
      this.elements.activeQuestList.innerHTML = `
        <li class="quest-item empty-state">No active contracts found. Deploy one above.</li>
      `;
    } else {
      this.elements.activeQuestList.innerHTML = activeQuests.map(q => `
        <li class="quest-item" data-id="${q.id}">
          <div class="quest-info">
            <span class="quest-name">${q.title}</span>
            <div class="quest-meta-tags">
              <span class="quest-badge badge-${q.difficulty}">Rank ${q.difficulty.toUpperCase()}</span>
              <span class="quest-badge badge-cat">${q.category}</span>
              <span class="quest-rewards">+${q.xpReward} XP / +${q.goldReward} ⬡</span>
            </div>
          </div>
          <div class="quest-actions">
            <button class="btn-quest-action btn-complete" data-action="complete" data-id="${q.id}">COMPLETE</button>
            <button class="btn-quest-action btn-delete" data-action="delete" data-id="${q.id}">✕</button>
          </div>
        </li>
      `).join("");
    }

    if (completedQuests.length === 0) {
      this.elements.completedQuestList.innerHTML = `
        <li class="quest-item empty-state">No contracts completed yet today.</li>
      `;
    } else {
      this.elements.completedQuestList.innerHTML = completedQuests.map(q => `
        <li class="quest-item" data-id="${q.id}">
          <div class="quest-info">
            <span class="quest-name">${q.title}</span>
            <div class="quest-meta-tags">
              <span class="quest-badge badge-${q.difficulty}">Rank ${q.difficulty.toUpperCase()}</span>
              <span class="quest-rewards">CLAIMED: +${q.xpReward} XP / +${q.goldReward} ⬡</span>
            </div>
          </div>
          <div class="quest-actions">
            <button class="btn-quest-action btn-delete" data-action="delete" data-id="${q.id}">DELETE</button>
          </div>
        </li>
      `).join("");
    }
  },

  renderShop() {
    const heroGold = gameState.hero.gold;

    this.elements.shopContainer.innerHTML = gameState.shopItems.map(item => {
      const canAfford = heroGold >= item.price;
      return `
        <article class="shop-card">
          <div class="shop-card-info">
            <h4>${item.name}</h4>
            <p>${item.desc}</p>
          </div>
          <div class="shop-card-action">
            <span class="price">⬡ ${item.price}</span>
            <button 
              class="btn btn-buy" 
              data-id="${item.id}"
              ${!canAfford ? "disabled" : ""}
            >
              ${canAfford ? "BUY" : "LOCKED"}
            </button>
          </div>
        </article>
      `;
    }).join("");
  },

  renderInventory() {
    let invContainer = document.getElementById("depot-inventory");
    if (!invContainer) {
      const depotSection = document.querySelector(".supply-depot");
      invContainer = document.createElement("div");
      invContainer.id = "depot-inventory";
      invContainer.className = "inventory-section";
      depotSection.appendChild(invContainer);
    }

    if (gameState.inventory.length === 0) {
      invContainer.innerHTML = `
        <span class="sub-text">OPERATIVE BAG: Empty</span>
      `;
    } else {
      invContainer.innerHTML = `
        <span class="sub-text">CLAIMED VOUCHERS (${gameState.inventory.length}):</span>
        <div class="inventory-tags">
          ${gameState.inventory.map(item => `<span class="inv-tag">🎟️ ${item.name}</span>`).join("")}
        </div>
      `;
    }
  },

  renderAll() {
    this.renderHeroProfile();
    this.renderQuests();
    this.renderShop();
    this.renderInventory();
  },

  initListeners() {
    // Stat allocations
    this.elements.statIncButtons.forEach(button => {
      button.addEventListener("click", (e) => {
        const stat = e.currentTarget.getAttribute("data-stat");
        RPGSystem.allocateStatPoint(stat);
      });
    });

    // Add Quest
    this.elements.questForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const title = this.elements.questTitleInput.value.trim();
      const difficulty = this.elements.questDifficultyInput.value;
      const category = this.elements.questCategoryInput.value;

      if (!title) return;

      RPGSystem.createQuest(title, difficulty, category);
      this.elements.questTitleInput.value = "";
    });

    // Quest actions
    const handleQuestAction = (e) => {
      const target = e.target;
      const action = target.getAttribute("data-action");
      const id = target.getAttribute("data-id");

      if (!action || !id) return;

      if (action === "complete") {
        RPGSystem.completeQuest(id);
      } else if (action === "delete") {
        RPGSystem.deleteQuest(id);
      }
    };

    this.elements.activeQuestList.addEventListener("click", handleQuestAction);
    this.elements.completedQuestList.addEventListener("click", handleQuestAction);

    // Shop Buy
    this.elements.shopContainer.addEventListener("click", (e) => {
      if (e.target.classList.contains("btn-buy")) {
        const itemId = e.target.getAttribute("data-id");
        RPGSystem.buyItem(itemId);
      }
    });

    // Manual Save Button
    this.elements.btnSave.addEventListener("click", () => {
      if (Storage.save()) {
        this.showToast("SYSTEM BACKUP: All progress saved to local storage.");
      }
    });

    // Reset System Button
    this.elements.btnReset.addEventListener("click", () => {
      const confirmReset = window.confirm(
        "WARNING // TERMINATION PROTOCOL:\nAre you sure you want to reset all operative data back to factory state?"
      );
      if (confirmReset) {
        Storage.reset();
        this.renderAll();
        this.showToast("SYSTEM PURGED: Operative profile reset to factory default.", true);
      }
    });
  },

  init() {
    // Attempt to load from storage
    const loaded = Storage.load();
    if (loaded) {
      console.log("CYBERQUEST // Existing operative save profile loaded.");
    }

    this.initListeners();
    this.renderAll();
    console.log("CYBERQUEST // System Fully Initialized.");
  }
};

// Boot application when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  UIController.init();
});