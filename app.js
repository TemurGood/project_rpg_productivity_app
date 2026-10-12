/**
 * CYBERQUEST - Fullstack RPG Habit Tracker
 * Architecture: Supabase Auth/DB <-> Storage <-> RPGSystem <-> UIController
 */

// ==========================================
// 1. SUPABASE CLIENT CONFIGURATION
// ==========================================
const SUPABASE_URL = "https://fkgtxmqymhcyhuivctfc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_j9M9R-fUI6Y6nqWUqW7Z-g_0FF3j1vb";

// Initialize Supabase client
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

// ==========================================
// 2. STATE MODULE (gameState)
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
      createdAt: Date.now()
    },
    {
      id: "demo-quest-2",
      title: "Physical Conditioning (30m Workout)",
      difficulty: "medium",
      category: "fitness",
      xpReward: 50,
      goldReward: 25,
      completed: false,
      createdAt: Date.now()
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
      desc: "Voucher: 1 Guilt-free coffee break",
      price: 30,
      type: "reward",
      effect: "voucher"
    },
    {
      id: "holonet-pass",
      name: "HOLONET ACCESS (1 HR)",
      desc: "Voucher: 1 Hour gaming or leisure",
      price: 90,
      type: "reward",
      effect: "voucher"
    }
  ],
  inventory: []
};

let gameState = JSON.parse(JSON.stringify(DEFAULT_STATE));
let currentUser = null;

// ==========================================
// 3. STORAGE & CLOUD MODULE (Storage)
// ==========================================
const Storage = {
  LOCAL_KEY: "CYBERQUEST_PROGRESS_DATA_V1",

  // Save to LocalStorage AND Cloud (if logged in)
  async save() {
    // 1. Always save locally for instant offline performance
    try {
      localStorage.setItem(this.LOCAL_KEY, JSON.stringify(gameState));
    } catch (e) {
      console.warn("Local storage write error:", e);
    }

    // 2. If logged in to Supabase, sync to cloud database
    if (currentUser && supabaseClient) {
      try {
        const { error } = await supabaseClient
          .from("player_saves")
          .upsert({
            user_id: currentUser.id,
            game_data: gameState,
            updated_at: new Date().toISOString()
          });

        if (error) console.error("Cloud sync error:", error);
      } catch (err) {
        console.error("Cloud sync network error:", err);
      }
    }
  },

  // Load from Cloud if logged in, otherwise load from LocalStorage
  async load() {
    if (currentUser && supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from("player_saves")
          .select("game_data")
          .eq("user_id", currentUser.id)
          .single();

        if (data && data.game_data) {
          gameState = {
            ...DEFAULT_STATE,
            ...data.game_data,
            shopItems: DEFAULT_STATE.shopItems
          };
          return true;
        }
      } catch (err) {
        console.warn("No remote save found, using default or local.");
      }
    }

    // Fallback: LocalStorage
    try {
      const serialized = localStorage.getItem(this.LOCAL_KEY);
      if (!serialized) return false;

      const loaded = JSON.parse(serialized);
      gameState = {
        ...DEFAULT_STATE,
        ...loaded,
        shopItems: DEFAULT_STATE.shopItems
      };
      return true;
    } catch (err) {
      gameState = JSON.parse(JSON.stringify(DEFAULT_STATE));
      return false;
    }
  },

  async reset() {
    localStorage.removeItem(this.LOCAL_KEY);
    gameState = JSON.parse(JSON.stringify(DEFAULT_STATE));

    if (currentUser && supabaseClient) {
      await supabaseClient.from("player_saves").delete().eq("user_id", currentUser.id);
    }
  }
};

// ==========================================
// 4. AUTH MODULE (AuthService)
// ==========================================
const AuthService = {
  async init() {
    if (!supabaseClient) return;

    // Check existing active session
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session?.user) {
      currentUser = session.user;
      await Storage.load();
    }

    // Listen for auth state changes (login, logout)
    supabaseClient.auth.onAuthStateChange(async (event, session) => {
      currentUser = session?.user || null;
      UIController.updateAuthUI();
      if (currentUser) {
        await Storage.load();
        UIController.renderAll();
      }
    });

    UIController.updateAuthUI();
  },

  async signUp(email, password) {
    if (!supabaseClient) return { error: { message: "Supabase client uninitialized." } };
    return await supabaseClient.auth.signUp({ email, password });
  },

  async signIn(email, password) {
    if (!supabaseClient) return { error: { message: "Supabase client uninitialized." } };
    return await supabaseClient.auth.signInWithPassword({ email, password });
  },

  async signOut() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
    currentUser = null;
    gameState = JSON.parse(JSON.stringify(DEFAULT_STATE));
    Storage.load(); // Load local save
    UIController.renderAll();
    UIController.showToast("LOGGED OUT: Switched to Guest Protocol.");
  }
};

// ==========================================
// 5. RPG LOGIC MODULE (RPGSystem)
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
  },

  deleteQuest(questId) {
    gameState.quests = gameState.quests.filter(q => q.id !== questId);
    Storage.save();
    UIController.renderQuests();
  },

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
// 6. UI RENDERING MODULE (UIController)
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
    // System controls
    btnSave: document.getElementById("btn-save-data"),
    btnReset: document.getElementById("btn-reset-data"),
    btnAuthToggle: document.getElementById("btn-auth-toggle"),
    authStatusTag: document.getElementById("auth-status-tag"),
    // Auth Modal
    authModal: document.getElementById("auth-modal"),
    modalClose: document.getElementById("modal-close"),
    authEmail: document.getElementById("auth-email"),
    authPassword: document.getElementById("auth-password"),
    authErrorMsg: document.getElementById("auth-error-msg"),
    btnSubmitLogin: document.getElementById("btn-submit-login"),
    btnSubmitSignup: document.getElementById("btn-submit-signup")
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
    setTimeout(() => { toast.style.display = "none"; }, 3000);
  },

  updateAuthUI() {
    if (currentUser) {
      this.elements.authStatusTag.textContent = `LINKED: ${currentUser.email}`;
      this.elements.authStatusTag.style.color = "var(--accent-green)";
      this.elements.btnAuthToggle.textContent = "LOG OUT";
    } else {
      this.elements.authStatusTag.textContent = "GUEST PROTOCOL // LOCAL ONLY";
      this.elements.authStatusTag.style.color = "var(--text-muted)";
      this.elements.btnAuthToggle.textContent = "⚡ CLOUD SYNC / LOGIN";
    }
  },

  renderHeroProfile() {
    const hero = gameState.hero;
    const el = this.elements;

    el.heroName.textContent = currentUser ? currentUser.email.split("@")[0].toUpperCase() : hero.name;
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

    el.statIncButtons.forEach(btn => {
      btn.disabled = hero.statPoints <= 0;
    });
  },

  renderQuests() {
    const activeQuests = gameState.quests.filter(q => !q.completed);
    const completedQuests = gameState.quests.filter(q => q.completed);

    if (activeQuests.length === 0) {
      this.elements.activeQuestList.innerHTML = `<li class="quest-item empty-state">No active contracts found. Deploy one above.</li>`;
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
      this.elements.completedQuestList.innerHTML = `<li class="quest-item empty-state">No contracts completed yet today.</li>`;
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
            <button class="btn btn-buy" data-id="${item.id}" ${!canAfford ? "disabled" : ""}>
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
      invContainer.innerHTML = `<span class="sub-text">OPERATIVE BAG: Empty</span>`;
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
    this.updateAuthUI();
  },

  initListeners() {
    // Stat allocations
    this.elements.statIncButtons.forEach(btn => {
      btn.addEventListener("click", (e) => {
        RPGSystem.allocateStatPoint(e.currentTarget.getAttribute("data-stat"));
      });
    });

    // Add Quest
    this.elements.questForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const title = this.elements.questTitleInput.value.trim();
      if (!title) return;
      RPGSystem.createQuest(title, this.elements.questDifficultyInput.value, this.elements.questCategoryInput.value);
      this.elements.questTitleInput.value = "";
    });

    // Quest Actions
    const handleQuestAction = (e) => {
      const action = e.target.getAttribute("data-action");
      const id = e.target.getAttribute("data-id");
      if (!action || !id) return;
      if (action === "complete") RPGSystem.completeQuest(id);
      if (action === "delete") RPGSystem.deleteQuest(id);
    };
    this.elements.activeQuestList.addEventListener("click", handleQuestAction);
    this.elements.completedQuestList.addEventListener("click", handleQuestAction);

    // Shop purchase
    this.elements.shopContainer.addEventListener("click", (e) => {
      if (e.target.classList.contains("btn-buy")) {
        RPGSystem.buyItem(e.target.getAttribute("data-id"));
      }
    });

    // Save button
    this.elements.btnSave.addEventListener("click", async () => {
      await Storage.save();
      this.showToast(currentUser ? "CLOUD BACKUP: Synchronized with Supabase DB." : "LOCAL BACKUP: Saved to browser storage.");
    });

    // Reset button
    this.elements.btnReset.addEventListener("click", async () => {
      if (window.confirm("WARNING // RESET PROTOCOL: Revert all data back to factory defaults?")) {
        await Storage.reset();
        this.renderAll();
        this.showToast("SYSTEM PURGED: Reset complete.", true);
      }
    });

    // Modal Triggers
    this.elements.btnAuthToggle.addEventListener("click", () => {
      if (currentUser) {
        AuthService.signOut();
      } else {
        this.elements.authErrorMsg.textContent = "";
        this.elements.authModal.classList.add("active");
      }
    });

    this.elements.modalClose.addEventListener("click", () => {
      this.elements.authModal.classList.remove("active");
    });

    // Sign In Button
    this.elements.btnSubmitLogin.addEventListener("click", async () => {
      const email = this.elements.authEmail.value.trim();
      const password = this.elements.authPassword.value;
      if (!email || !password) return;

      this.elements.authErrorMsg.textContent = "Connecting to Neural Link...";
      const { data, error } = await AuthService.signIn(email, password);

      if (error) {
        this.elements.authErrorMsg.textContent = `ERROR: ${error.message}`;
      } else {
        this.elements.authModal.classList.remove("active");
        this.showToast(`ACCESS GRANTED: Welcome, Operative.`);
      }
    });

    // Register Button
    this.elements.btnSubmitSignup.addEventListener("click", async () => {
      const email = this.elements.authEmail.value.trim();
      const password = this.elements.authPassword.value;
      if (!email || !password) return;

      this.elements.authErrorMsg.textContent = "Registering new operative...";
      const { data, error } = await AuthService.signUp(email, password);

      if (error) {
        this.elements.authErrorMsg.textContent = `ERROR: ${error.message}`;
      } else {
        this.elements.authModal.classList.remove("active");
        this.showToast(`OPERATIVE REGISTERED: Linked to cloud.`);
      }
    });
  },

  async init() {
    this.initListeners();
    await Storage.load();
    this.renderAll();
    await AuthService.init();
    console.log("CYBERQUEST // Fullstack Operative HUD Online.");
  }
};

// Boot
document.addEventListener("DOMContentLoaded", () => {
  UIController.init();
});