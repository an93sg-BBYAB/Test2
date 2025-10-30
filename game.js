// game.js (v8.10 - 모든 오타 및 쓰레기 문자 제거)

// --- 데이터 정의 ---
const ItemData = {
    'sword':    { name: '검', type: 'weapon', color: 0x8B4513 }, 'shield':   { name: '방패', type: 'shield', color: 0x8B4513 },
    'helmet':   { name: '투구', type: 'helmet', color: 0x8B4513 }, 'armor':    { name: '갑옷', type: 'armor', color: 0x8B4513 },
    'gloves':   { name: '장갑', type: 'gloves', color: 0x8B4513 }, 'belt':     { name: '허리띠', type: 'belt',   color: 0x8B4513 },
    'boots':    { name: '장화', type: 'boots',  color: 0x8B4513 }
};
const ALL_ITEM_KEYS = Object.keys(ItemData);
const EnemyData = {
    'goblin':   { name: '고블린', hp: 30, atk: 5, color: 0x00aa00, dropRate: 0.10, illustKey: 'goblin_illust', attackTime: 1.0 },
    'skeleton': { name: '해골',   hp: 50, atk: 3, color: 0xeeeeee, dropRate: 0.15, illustKey: 'skeleton_illust', attackTime: 1.0 },
    'orc':      { name: '오크',   hp: 80, atk: 8, color: 0x008800, dropRate: 0.20, illustKey: 'orc_illust',    attackTime: 1.0 },
    'demon':    { name: '악마',   hp: 40, atk: 12, color: 0xcc0000, dropRate: 0.25, illustKey: 'demon_illust',  attackTime: 1.0 },
    'slime':    { name: '슬라임', hp: 20, atk: 2, color: 0x00ffff, dropRate: 0.05, illustKey: 'slime_illust',    attackTime: 1.0 }
};
const SPAWNABLE_ENEMY_KEYS = ['goblin', 'skeleton', 'orc', 'slime'];
const TILE_TYPE_EMPTY = 0; const TILE_TYPE_PATH = 1; const TILE_TYPE_ENEMY2 = 2;
const TILE_TYPE_ENEMY3 = 3; const TILE_TYPE_ENEMY5 = 5; const TILE_TYPE_START = 6;

// --- 1. 메인 게임 씬 (필드 탐험) ---
// game.js (v8.11 - onCombatComplete의 'hasListeners' 오류 수정)
// [ ... GameScene의 constructor, preload, create, shutdown, togglePause, redraw ... 등은 v8.10과 동일 ... ]

// --- 1. 메인 게임 씬 (v8.10 코드를 이 아래 코드로 교체) ---
class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.TILE_SIZE = 48; this.TOP_UI_HEIGHT = 50; this.RIGHT_UI_WIDTH = 190;
        this.GRID_WIDTH = 25; this.GRID_HEIGHT = 18;
        this.MAP_OFFSET_X = 0; this.MAP_OFFSET_Y = 0; this.mapGraphics = null; this.hero = null;
        this.pathCoords = []; this.pathCoordsWithOffset = []; this.grid = [];
        this.specialTileCoords = { [TILE_TYPE_ENEMY2]: [], [TILE_TYPE_ENEMY3]: [], [TILE_TYPE_ENEMY5]: [] };
        this.tilesMovedSinceLastDay = 0; this.isInitialDrawComplete = false; this.startingCombat = false;
    }

    preload() {
        const pixelData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/wcAAwAB/epA8AAAAABJRU5ErkJggg==';
        if (!this.textures.exists('pixel')) { this.textures.addBase64('pixel', pixelData); }
    }

    create() {
        console.log("GameScene create start");
        this.scene.run('UIScene');
        this.registry.set('isPaused', false);
        this.pathIndex = 0; this.day = 1; this.tilesMovedTotal = 0;
        this.enemyTriggers = this.physics.add.group(); this.mapGraphics = this.add.group();

        this.generateRandomLoop(); // 루프 경로 생성 (데이터만)

        this.scale.on('resize', this.redraw, this);
        this.events.on('combatComplete', this.onCombatComplete, this);
        this.heroData = { hp: 100, maxHp: 100, attackTime: 0.8 };

        this.time.delayedCall(200, () => {
             const uiScene = this.scene.get('UIScene');
             if (uiScene && this.scene.isActive('UIScene')) {
                uiScene.events.emit('updateHeroHP', this.heroData.hp, this.heroData.maxHp);
             } else { console.warn("UIScene not active or ready for initial events."); }
        });

        console.log("GameScene calling initial redraw");
        if (this.pathCoords && this.pathCoords.length > 0) {
            this.time.delayedCall(50, () => { console.log("Executing delayed initial redraw for GameScene"); this.redraw(this.scale.gameSize); }, [], this);
        } else {
            console.error("Initial redraw skipped: pathCoords is invalid after generation!");
             this.generateDefaultLoop(); this.assignSpecialTiles();
             if (this.pathCoords && this.pathCoords.length > 0) {
                  this.time.delayedCall(50, () => { console.log("Executing delayed fallback redraw for GameScene"); this.redraw(this.scale.gameSize); }, [], this);
             } else { console.error("FATAL: Failed to generate even default loop!"); }
        }
        this.input.keyboard.on('keydown-SPACE', this.togglePause, this);
        // 'R'키 리스너를 여기서 '항상' 등록합니다.
        this.input.keyboard.on('keydown-R', this.restartGame, this);

        console.log("GameScene create end");
    }
    
    shutdown() {
        console.log("GameScene shutdown");
        this.scale.off('resize', this.redraw, this);
        this.events.off('combatComplete', this.onCombatComplete, this);
        this.input.keyboard.off('keydown-SPACE', this.togglePause, this);
        // 여기서 'R'키 리스너를 '항상' 제거합니다.
        this.input.keyboard.off('keydown-R', this.restartGame, this); 
        this.time.removeAllEvents();
        if (this.enemyTriggers) this.enemyTriggers.destroy(true);
        if (this.mapGraphics) this.mapGraphics.destroy(true);
        this.hero = null;
        this.mapGraphics = null;
        this.enemyTriggers = null;
    }

    togglePause() {
        const newState = !this.registry.get('isPaused');
        this.registry.set('isPaused', newState); console.log("Pause Toggled:", newState);
    }

    redraw(gameSize) {
        console.log("GameScene redraw start", gameSize);
        if (!this.pathCoords || this.pathCoords.length === 0) { console.warn("GameScene redraw skipped: pathCoords is invalid."); return; }
        const gameWidth = gameSize ? gameSize.width : this.cameras.main.width; const gameHeight = gameSize ? gameSize.height : this.cameras.main.height;
        if (gameWidth <= 1 || gameHeight <= 1) { console.warn("GameScene redraw skipped due to invalid size:", gameWidth, gameHeight); return; }

        if (this.mapGraphics) this.mapGraphics.clear(true, true); 
        this.calculateMapOffsets(gameWidth, gameHeight);
        this.drawTiles(gameWidth, gameHeight);
        this.updatePathCoordsWithOffset();

        if (!this.hero && this.pathCoordsWithOffset.length > 0) {
            console.log("GameScene creating hero");
            const startPos = this.pathCoordsWithOffset[0]; if (!startPos) { console.error("Cannot create hero, start position is invalid!"); return; }
            this.hero = this.physics.add.sprite(startPos.x, startPos.y, 'pixel').setDisplaySize(this.TILE_SIZE * 0.5, this.TILE_SIZE * 0.75).setTint(0x00ffff);
            this.hero.hp = this.heroData.hp; this.hero.maxHp = this.heroData.maxHp;
            this.hero.setDepth(1);

        } else if (this.hero && this.pathCoordsWithOffset.length > 0) {
             console.log("GameScene repositioning hero");
            const currentPos = this.pathCoordsWithOffset[this.pathIndex]; if (!currentPos) { console.error("Cannot reposition hero, current position is invalid!"); return; }
             this.hero.setPosition(currentPos.x, currentPos.y); this.hero.setDepth(1);
            if (this.hero.body) { this.hero.body.reset(currentPos.x, currentPos.y); }
            else if (this.hero.active) { console.log("Re-enabling physics body for hero"); this.physics.world.enable(this.hero); if(this.hero.body) this.hero.body.reset(currentPos.x, currentPos.y); }
	     }
        this.isInitialDrawComplete = true; console.log("GameScene redraw end");
    }
    
    // [ ... 이하 generateRandomLoop, setGrid, getPathNeighbors, generateDefaultLoop, ... ]
    // [ ... assignSpecialTiles, updatePathCoordsWithOffset, drawTiles, moveHero, ... ]
    // [ ... checkEnemiesAtTile, advanceDay, spawnEnemy1~5, spawnEnemyTriggerAt, ... ]
    // [ ... getPixelCoord, startCombat ... ]
    // [ v8.10과 동일한 함수들은 생략합니다. 아래 onCombatComplete만 수정하세요. ]

    // [수정] ★★★ v8.11 변경점 ★★★
    onCombatComplete(data) {
        this.startingCombat = false; 
        
        // [수정] 471줄 오류 원인: 'if (!this.hero)' 블록
        // 씬이 종료되는 중(hero가 null)에 이벤트가 도착하면,
        // 471줄의 (존재하지 않는) hasListeners 함수를 호출하여 오류 발생.
        // 이 블록 전체를 'return;' 한 줄로 변경하여 오류를 수정합니다.
        if (!this.hero) { 
             return; // hero가 없으면 아무것도 하지 않고 종료
        }

        this.hero.hp = data.heroHp;
        const uiScene = this.scene.get('UIScene');
         if(uiScene && this.scene.isActive('UIScene')) {
            uiScene.events.emit('updateHeroHP', this.hero.hp, this.hero.maxHp);
         }
        
        if (data.loot) {
            if(uiScene && this.scene.isActive('UIScene')) {
                 uiScene.events.emit('addItem', data.loot);
            }
        }
        
        if (this.hero.hp <= 0) {
            this.scene.resume('GameScene'); // 'R'키가 작동하도록 씬을 'active' 상태로 변경

            this.hero.destroy(); 
            this.hero = null; 
             // [수정] 이제 이 코드가 정상적으로 실행됩니다.
             const gameOverText = this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2, 'GAME OVER\nPress "R" to Restart', { fontSize: '40px', fill: '#ff0000', align: 'center', backgroundColor: '#000000' }).setOrigin(0.5);
             gameOverText.setDepth(10); 
             
             // [수정] 493줄 오류 원인: 'hasListeners'를 사용한 if문 제거.
             // 'R'키 리스너는 create에서 이미 등록했으므로 여기서 또 등록할 필요가 없습니다.
        
        } else {
            this.scene.resume();
            console.log("GameScene calling redraw after combat");
            this.time.delayedCall(20, () => { 
                if (this.scene.isActive()) this.redraw(this.scale.gameSize); 
            }, [], this);
        }
    }
    
    // [v8.10과 동일]
    restartGame(event) {
        // if (!this.scene.isActive()) return; // <-- v8.5에서 이 줄이 문제였음 (제거됨)
        
        console.log("Restarting game...");
        
        // shutdown()에서 리스너를 제거하므로 사실상 2중 제거지만, 안전을 위해 유지
        this.input.keyboard.off('keydown-R', this.restartGame, this); 
        this.input.keyboard.off('keydown-SPACE', this.togglePause, this); 
        
        this.scene.remove('UIScene'); 
        this.scene.remove('CombatScene');
        this.scene.start('GameScene'); 
    }
} // End of GameScene class

// --- 2. 전투 씬 --- (v8.10 - 모든 오타 제거)
class CombatScene extends Phaser.Scene {
    constructor() {
        super('CombatScene');
        this.combatRunning = false;
        this.heroAttackGauge = 0; this.heroAttackSpeed = 0;
        this.enemiesData = []; this.enemyIllusts = [];
        this.enemyHps = []; this.enemyMaxHps = [];
        this.enemyAttackGauges = []; this.enemyAttackSpeeds = [];
        this.enemyHpBarBGs = []; this.enemyHpBarFills = [];
        this.enemyAttackGaugeBGs = []; this.enemyAttackGaugeFills = [];
    }
    init(data) {
        this.enemiesData = data.enemies || []; 
        this.heroHp = data.heroHp; this.heroMaxHp = data.heroMaxHp;
        this.heroAttackSpeed = 100 / (data.heroAttackTime || 0.8); 
        this.enemyIllusts = []; this.enemyHps = []; this.enemyMaxHps = [];
        this.enemyAttackGauges = []; this.enemyAttackSpeeds = [];
        this.enemyHpBarBGs = []; this.enemyHpBarFills = [];
        this.enemyAttackGaugeBGs = []; this.enemyAttackGaugeFills = [];
        this.enemiesData.forEach(enemyData => {
             this.enemyHps.push(enemyData.hp);
             this.enemyMaxHps.push(enemyData.hp);
             this.enemyAttackSpeeds.push(100 / (enemyData.attackTime || 1.0));
             this.enemyAttackGauges.push(0);
        });
    }
    create() {
        const gameWidth = this.cameras.main.width; const gameHeight = this.cameras.main.height;
        const combatPanelWidth = gameWidth * 0.5; const combatPanelHeight = gameHeight * 0.5;
        const combatPanelX = (gameWidth - combatPanelWidth) / 2; const combatPanelY = (gameHeight - combatPanelHeight) / 2;
        this.add.graphics().fillStyle(0x000000, 0.7).fillRect(0, 0, gameWidth, gameHeight); 
        this.add.graphics().fillStyle(0x333333).fillRect(combatPanelX, combatPanelY, combatPanelWidth, combatPanelHeight).lineStyle(2, 0x8B4513).strokeRect(combatPanelX, combatPanelY, combatPanelWidth, combatPanelHeight);
        this.heroIllust = this.add.image(combatPanelX + combatPanelWidth * 0.3, combatPanelY + combatPanelHeight * 0.5, 'pixel').setDisplaySize(120, 160).setTint(0x00ffff).setOrigin(0.5);
        const hpBarWidth = 100; const hpBarHeight = 10;
        const heroHpBarX = this.heroIllust.x - hpBarWidth / 2; 
        const heroHpBarY = this.heroIllust.y - this.heroIllust.displayHeight / 2 - 25; 
        this.heroHpBarBG = this.add.rectangle(heroHpBarX, heroHpBarY, hpBarWidth, hpBarHeight, 0xff0000).setOrigin(0);
        this.heroHpBarFill = this.add.rectangle(heroHpBarX, heroHpBarY, hpBarWidth, hpBarHeight, 0x00ff00).setOrigin(0);
        const attackGaugeWidth = hpBarWidth; const attackGaugeHeight = hpBarHeight * 0.25; 
        const heroAttackGaugeY = heroHpBarY + hpBarHeight + 2; 
        this.heroAttackGaugeBG = this.add.rectangle(heroHpBarX, heroAttackGaugeY, attackGaugeWidth, attackGaugeHeight, 0x555555).setOrigin(0); 
        this.heroAttackGaugeFill = this.add.rectangle(heroHpBarX, heroAttackGaugeY, 0, attackGaugeHeight, 0xffff00).setOrigin(0); 
        this.heroAttackGauge = 0;
        const numEnemies = this.enemiesData.length;
        const enemyStartX = combatPanelX + combatPanelWidth * 0.7; 
        const enemyTotalHeight = 140 * numEnemies; 
        const enemySpacingY = (numEnemies > 1) ? (combatPanelHeight * 0.8 / (numEnemies -1)) : 0; 
        const firstEnemyY = combatPanelY + (combatPanelHeight / 2) - (enemyTotalHeight / 2) + 70; 
        this.enemiesData.forEach((enemyData, index) => {
            const enemyX = enemyStartX;
            const enemyY = (numEnemies > 1) ? (firstEnemyY + (enemySpacingY * index)) : (combatPanelY + combatPanelHeight / 2); 
            const enemyIllust = this.add.image(enemyX, enemyY, 'pixel').setDisplaySize(100, 140).setTint(enemyData.color).setOrigin(0.5); 
            const eHpBarX = enemyIllust.x - hpBarWidth / 2;
            const eHpBarY = enemyIllust.y - enemyIllust.displayHeight / 2 - 25; 
            const eAttackGaugeY = eHpBarY + hpBarHeight + 2;
            this.enemyIllusts.push(enemyIllust);
            this.enemyHpBarBGs.push(this.add.rectangle(eHpBarX, eHpBarY, hpBarWidth, hpBarHeight, 0xff0000).setOrigin(0));
            this.enemyHpBarFills.push(this.add.rectangle(eHpBarX, eHpBarY, hpBarWidth, hpBarHeight, 0x00ff00).setOrigin(0));
            this.enemyAttackGaugeBGs.push(this.add.rectangle(eHpBarX, eAttackGaugeY, attackGaugeWidth, attackGaugeHeight, 0x555555).setOrigin(0));
            this.enemyAttackGaugeFills.push(this.add.rectangle(eHpBarX, eAttackGaugeY, 0, attackGaugeHeight, 0xffff00).setOrigin(0));
        });
        this.updateHpBars(); 
        this.updateAttackGauges(); 
        this.combatRunning = true;
        this.input.keyboard.on('keydown-SPACE', this.toggleGamePause, this);
    }
    shutdown() {
        console.log("CombatScene shutdown");
        this.input.keyboard.off('keydown-SPACE', this.toggleGamePause, this);
    }
    toggleGamePause() {
        const gameScene = this.scene.get('GameScene');
        if (gameScene) {
             gameScene.togglePause();
        }
    }
    update(time, delta) {
        if (!this.combatRunning) return;
        const deltaSeconds = delta / 1000; 
        this.heroAttackGauge += this.heroAttackSpeed * deltaSeconds;
        if (this.heroAttackGauge >= 100) {
            this.heroAttackGauge = 0; 
            this.playerAttack();      
             if (!this.combatRunning) return; 
        }
        this.enemiesData.forEach((enemyData, index) => {
             if (this.enemyHps[index] > 0) { 
                this.enemyAttackGauges[index] += this.enemyAttackSpeeds[index] * deltaSeconds;
                if (this.enemyAttackGauges[index] >= 100) {
                    this.enemyAttackGauges[index] = 0; 
                     this.enemyAttack(index); 
                      if (!this.combatRunning) return; 
                }
             }
        });
        this.updateAttackGauges();
    }
    updateHpBars() {
        const barWidth = 100;
        const heroPercent = Math.max(0, this.heroHp / this.heroMaxHp);
        if(this.heroHpBarFill) this.heroHpBarFill.width = barWidth * heroPercent;
        this.enemiesData.forEach((enemyData, index) => {
             const enemyPercent = Math.max(0, this.enemyHps[index] / this.enemyMaxHps[index]);
             if (this.enemyHpBarFills[index]) {
                this.enemyHpBarFills[index].width = barWidth * enemyPercent;
             }
        });
        const uiScene = this.scene.get('UIScene');
        if (uiScene && uiScene.events && uiScene.scene.isActive()) {
             uiScene.events.emit('updateHeroHP', this.heroHp, this.heroMaxHp);
        }
    }
    updateAttackGauges() {
        const gaugeWidth = 100;
        const heroGaugePercent = Math.min(1, this.heroAttackGauge / 100); 
        if (this.heroAttackGaugeFill) this.heroAttackGaugeFill.width = gaugeWidth * heroGaugePercent;
         this.enemiesData.forEach((enemyData, index) => {
             const enemyGaugePercent = Math.min(1, this.enemyAttackGauges[index] / 100);
             if (this.enemyAttackGaugeFills[index]) {
                this.enemyAttackGaugeFills[index].width = gaugeWidth * enemyGaugePercent;
             }
         });
    }
    playerAttack() {
        if (!this.combatRunning || !this.heroIllust.active) return;
        let livingTargets = [];
        this.enemyHps.forEach((hp, index) => {
            if (hp > 0) livingTargets.push(index);
        });
        if (livingTargets.length === 0) return; 
        const targetIndex = Phaser.Math.RND.pick(livingTargets);
        const targetIllust = this.enemyIllusts[targetIndex];
         if (!targetIllust || !targetIllust.active) return; 
        this.add.tween({ 
            targets: this.heroIllust, 
            x: this.heroIllust.x + 20, 
            duration: 100, ease: 'Power1', yoyo: true,
            onComplete: () => {
                if (!this.combatRunning) return; 
                this.enemyHps[targetIndex] -= 10;
                this.updateHpBars(); 
                if (this.enemyHps[targetIndex] <= 0) {
                    this.defeatEnemy(targetIndex); 
                } 
            }
        });
    }
    enemyAttack(index) {
        if (!this.combatRunning || !this.heroIllust.active || !this.enemyIllusts[index] || !this.enemyIllusts[index].active) return;
        const enemyIllust = this.enemyIllusts[index];
        const enemyAtk = this.enemiesData[index].atk;
        this.add.tween({ 
            targets: enemyIllust,
            x: enemyIllust.x - 20, 
            duration: 100, ease: 'Power1', yoyo: true,
            onComplete: () => {
                if (!this.combatRunning) return; 
                this.heroHp -= enemyAtk;
                this.updateHpBars(); 
                if (this.heroHp <= 0) { this.defeatHero(); }
            }
        });
    }
    defeatEnemy(index) {
        if (!this.enemyIllusts[index] || !this.enemyIllusts[index].active) return; 
        
        const enemyIllust = this.enemyIllusts[index];
        
        this.add.tween({ 
            targets: enemyIllust, 
            alpha: 0, 
            duration: 500,
            onComplete: () => {
                enemyIllust.active = false; 
                if(this.enemyHpBarBGs[index]) this.enemyHpBarBGs[index].setVisible(false);
                if(this.enemyHpBarFills[index]) this.enemyHpBarFills[index].setVisible(false);
                if(this.enemyAttackGaugeBGs[index]) this.enemyAttackGaugeBGs[index].setVisible(false);
                if(this.enemyAttackGaugeFills[index]) this.enemyAttackGaugeFills[index].setVisible(false);
                
                let loot = null;
                const allEnemiesDefeated = this.enemyHps.every(hp => hp <= 0);
                
                if (allEnemiesDefeated) {
                     this.combatRunning = false; 
                    console.log("All enemies defeated!");
                     if (Math.random() < this.enemiesData[index].dropRate) {
                         loot = Phaser.Math.RND.pick(ALL_ITEM_KEYS);
                     }
                    if (loot) this.dropItemAnimation(loot, enemyIllust.x, enemyIllust.y);
                    else this.endCombat(null);
                } 
            }
        });
    }
    dropItemAnimation(itemKey, x, y) { 
        const itemData = ItemData[itemKey]; 
        const itemIcon = this.add.rectangle(x, y, 20, 20, itemData.color);
        const inventoryCenterSlotX = this.cameras.main.width - 190 + 50; 
        const inventoryCenterSlotY = 415;
        this.add.tween({ targets: itemIcon, x: inventoryCenterSlotX, y: inventoryCenterSlotY, duration: 700, ease: 'Back.easeIn',
            onComplete: () => { itemIcon.destroy(); this.endCombat(itemKey); }
        });
    }
    endCombat(loot) {
        if (!this.scene.isActive()) return; 
        this.combatRunning = false;
        this.input.keyboard.off('keydown-SPACE', this.toggleGamePause, this);
        const gameScene = this.scene.get('GameScene');
        if (gameScene && gameScene.events) { 
            gameScene.events.emit('combatComplete', { loot: loot, heroHp: this.heroHp });
        } else { console.warn("Cannot emit combatComplete: GameScene not found or ready."); }
        this.scene.stop();
    }
    defeatHero() {
        if (!this.combatRunning) return; 
        this.combatRunning = false;
        this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2, 'YOU DIED', { fontSize: '48px', fill: '#ff0000' }).setOrigin(0.5);
        this.heroIllust.active = false; 
        if(this.heroHpBarBG) this.heroHpBarBG.destroy(); 
        if(this.heroHpBarFill) this.heroHpBarFill.destroy(); 
        if(this.heroAttackGaugeBG) this.heroAttackGaugeBG.destroy(); 
        if(this.heroAttackGaugeFill) this.heroAttackGaugeFill.destroy();
        this.time.delayedCall(2000, () => { this.endCombat(null); }, [], this);
    }
} // End of CombatScene class

// --- 3. UI 씬 --- (v8.10 - 모든 오타 제거)
class UIScene extends Phaser.Scene {
    constructor() {
        super('UIScene');
        this.inventorySlots = []; this.equipSlots = {};
        this.inventory = new Array(16).fill(null);
        this.UI_WIDTH = 190; this.UI_PADDING = 10; this.TOP_UI_HEIGHT = 50;
        this.labelStyle = { fontSize: '11px', fill: '#cccccc', align: 'center' };
        this.inventoryLabelStyle = { fontSize: '14px', fill: '#cccccc', align: 'left' };
        this.hpStaTextStyle = { fontSize: '12px', fill: '#ffffff' };
        this.pauseTextStyle = { fontSize: '16px', fill: '#ffffff', align: 'center'}; 
        this.uiElements = null; this.itemIcons = null; this.pauseText = null; 
    }
    create() {
        console.log("UIScene create start");
        this.uiElements = this.add.group();
        this.itemIcons = this.add.group();
        this.scale.on('resize', this.redraw, this);
        const gameScene = this.scene.get('GameScene');
         this.time.delayedCall(100, () => {
             if (!this.scene.isActive()) {
                console.warn("UIScene create: Scene became inactive before listeners added.");
                return;
             }
             const gameScene = this.scene.get('GameScene'); 
             if (gameScene && gameScene.events) {
                gameScene.events.on('updateDay', this.onUpdateDay, this);
                this.events.on('updateHeroHP', this.updateHeroHP, this); 
                if (gameScene.registry && gameScene.registry.events) {
                    console.log("UIScene attaching registry listener");
                    gameScene.registry.events.on('changedata-isPaused', this.updatePauseText, this);
                    this.updatePauseText(); 
                } else {
                     console.warn("UIScene create: GameScene registry not ready for pause listener after delay.");
                }
             } else {
                 console.warn("UIScene create: GameScene not ready for event listeners after delay.");
             }
         }, [], this);
        this.events.on('addItem', this.addItem, this);
        console.log("UIScene calling initial redraw");
        this.time.delayedCall(0, () => {
             console.log("Executing delayed initial redraw for UIScene");
             if (this.scene.isActive()) this.redraw(this.scale.gameSize); 
        }, [], this);
        console.log("UIScene create end");
    }
    shutdown() {
        console.log("UIScene shutdown");
        this.scale.off('resize', this.redraw, this);
        const gameScene = this.scene.get('GameScene'); 
        if (gameScene) {
            if (gameScene.events) {
                gameScene.events.off('updateDay', this.onUpdateDay, this);
            }
            if (gameScene.registry && gameScene.registry.events) {
                gameScene.registry.events.off('changedata-isPaused', this.updatePauseText, this);
            }
        }
        this.events.off('updateHeroHP', this.updateHeroHP, this);
        this.events.off('addItem', this.addItem, this);
        if (this.uiElements) this.uiElements.destroy(true);
        if (this.itemIcons) this.itemIcons.destroy(true);
        this.uiElements = null;
        this.itemIcons = null;
    }
    onUpdateDay(day) {
        if (this.dayText) this.dayText.setText(`Day: ${day}`);
    }
    updatePauseText() {
         if (!this.scene.isActive()) return;
         const gameScene = this.scene.get('GameScene');
         if(this.pauseText && gameScene && gameScene.registry) { 
            const isPaused = gameScene.registry.get('isPaused');
            this.pauseText.setText(isPaused ? '중지' : '진행');
        } 
    }
    redraw(gameSize) {
         console.log("UIScene redraw start", gameSize); const gameWidth = gameSize ? gameSize.width : this.cameras.main.width; const gameHeight = gameSize ? gameSize.height : this.cameras.main.height; if (gameWidth <= 1 || gameHeight <= 1) { console.warn("UIScene redraw skipped due to invalid size:", gameWidth, gameHeight); return; } 
         if (this.uiElements) this.uiElements.clear(true, true); else this.uiElements = this.add.group();
         this.inventorySlots = []; this.equipSlots = {}; this.UI_START_X = gameWidth - this.UI_WIDTH; const topBar = this.add.graphics().fillStyle(0x666666).fillRect(0, 0, gameWidth, this.TOP_UI_HEIGHT); this.uiElements.add(topBar); const text1 = this.add.text(10, 15, '시간의 흐름', { fontSize: '10px', fill: '#000000' }); const gameSceneRef = this.scene.get('GameScene'); const currentDay = (gameSceneRef && typeof gameSceneRef.day === 'number') ? gameSceneRef.day : 1; this.dayText = this.add.text(80, 15, `Day: ${currentDay}`, { fontSize: '14px', fill: '#000000' }); const text3 = this.add.text(200, 15, '계획', { fontSize: '10px', fill: '#000000' }); this.pauseText = this.add.text(gameWidth / 2, this.TOP_UI_HEIGHT / 2, '진행', this.pauseTextStyle).setOrigin(0.5); const text5 = this.add.text(this.UI_START_X - 150 > 500 ? this.UI_START_X - 150 : 500, 15, '몇 번째 루프', { fontSize: '10px', fill: '#000000' }); this.uiElements.addMultiple([text1, this.dayText, text3, this.pauseText, text5]); const rightBar = this.add.graphics().fillStyle(0x333333).fillRect(this.UI_START_X, 0, this.UI_WIDTH, gameHeight); this.uiElements.add(rightBar); const RIGHT_UI_START_X = this.UI_START_X + this.UI_PADDING; let currentY = this.TOP_UI_HEIGHT + this.UI_PADDING; this.heroHpText = this.add.text(RIGHT_UI_START_X, currentY, 'HP: 100/100', this.hpStaTextStyle); currentY += 18; this.hpBarWidth = this.UI_WIDTH - (this.UI_PADDING * 2) - 20; this.hpBarHeight = 8; this.heroHpBarBG = this.add.rectangle(RIGHT_UI_START_X, currentY, this.hpBarWidth, this.hpBarHeight, 0xff0000).setOrigin(0); this.heroHpBarFill = this.add.rectangle(RIGHT_UI_START_X, currentY, this.hpBarWidth, this.hpBarHeight, 0x00ff00).setOrigin(0); currentY += 15; const staText = this.add.text(RIGHT_UI_START_X, currentY, 'STA: 100/100', { fontSize: '12px', fill: '#B09253' }); currentY += 30; this.uiElements.addMultiple([this.heroHpText, this.heroHpBarBG, this.heroHpBarFill, staText]); const EQUIP_SLOT_SIZE = 36; const EQUIP_SLOT_GAP_X = 5; const EQUIP_SLOT_GAP_Y = 10; const helmetLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, 'helmet', this.labelStyle); this.equipSlots['helmet'] = this.createSlot(RIGHT_UI_START_X + 10, currentY + 15, 'helmet', EQUIP_SLOT_SIZE); currentY += EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_Y + 10; const armorLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, 'armor', this.labelStyle); this.equipSlots['armor']  = this.createSlot(RIGHT_UI_START_X + 10, currentY + 15, 'armor', EQUIP_SLOT_SIZE); const weaponLabel = this.add.text(RIGHT_UI_START_X + 10 + EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X, currentY, 'weapon', this.labelStyle); this.equipSlots['weapon'] = this.createSlot(RIGHT_UI_START_X + 10 + EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X, currentY + 15, 'weapon', EQUIP_SLOT_SIZE); const shieldLabel = this.add.text(RIGHT_UI_START_X + 10 + (EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X) * 2, currentY, 'shield', this.labelStyle); this.equipSlots['shield'] = this.createSlot(RIGHT_UI_START_X + 10 + (EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X) * 2, currentY + 15, 'shield', EQUIP_SLOT_SIZE); currentY += EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_Y + 10; const glovesLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, 'gloves', this.labelStyle); this.equipSlots['gloves'] = this.createSlot(RIGHT_UI_START_X + 10, currentY + 15, 'gloves', EQUIP_SLOT_SIZE); const beltLabel = this.add.text(RIGHT_UI_START_X + 10 + EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X, currentY, 'belt', this.labelStyle); this.equipSlots['belt']   = this.createSlot(RIGHT_UI_START_X + 10 + EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X, currentY + 15, 'belt', EQUIP_SLOT_SIZE); const bootsLabel = this.add.text(RIGHT_UI_START_X + 10 + (EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X) * 2, currentY, 'boots', this.labelStyle); this.equipSlots['boots']  = this.createSlot(RIGHT_UI_START_X + 10 + (EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X) * 2, currentY + 15, 'boots', EQUIP_SLOT_SIZE); currentY += EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_Y + 10; this.uiElements.addMultiple([helmetLabel, armorLabel, weaponLabel, shieldLabel, glovesLabel, beltLabel, bootsLabel]); const statsLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, '능력치', this.inventoryLabelStyle); currentY += 20; const damageLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, '피해: +X', this.hpStaTextStyle); currentY += 15; const defenseLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, '방어: +Y', this.hpStaTextStyle); currentY += 25; this.uiElements.addMultiple([statsLabel, damageLabel, defenseLabel]); const invLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, 'Inventory', this.inventoryLabelStyle); currentY += 20; this.uiElements.add(invLabel); const INV_SLOT_SIZE = 36; const INV_SLOT_GAP = 5; let slotIndex = 0; for (let y = 0; y < 4; y++) { for (let x = 0; x < 4; x++) { const slotX = RIGHT_UI_START_X + 5 + x * (INV_SLOT_SIZE + INV_SLOT_GAP); const slotY = currentY + y * (INV_SLOT_SIZE + INV_SLOT_GAP); this.inventorySlots.push(this.createSlot(slotX, slotY, slotIndex++, INV_SLOT_SIZE)); } } this.selectedHighlight = this.add.graphics().lineStyle(2, 0xcc99ff); this.selectedHighlight.visible = false; this.errorText = this.add.text(this.UI_START_X + this.UI_WIDTH / 2, gameHeight - 30, '', { fontSize: '10px', fill: '#ff0000' }).setOrigin(0.5); this.uiElements.addMultiple([this.selectedHighlight, this.errorText]); let initialHp = 100, initialMaxHp = 100; if (gameSceneRef && gameSceneRef.heroData) { initialHp = gameSceneRef.heroData.hp; initialMaxHp = gameSceneRef.heroData.maxHp; } if (gameSceneRef && gameSceneRef.hero) { initialHp = gameSceneRef.hero.hp; initialMaxHp = gameSceneRef.hero.maxHp; } this.updateHeroHP(initialHp, initialMaxHp); if (gameSceneRef && gameSceneRef.registry) { this.updatePauseText(); } this.refreshInventory(); console.log("UIScene redraw end");
    }
    updateHeroHP(hp, maxHp) {
        if (!this.scene.isActive() || !this.heroHpText || !this.heroHpBarFill) return;
        this.heroHpText.setText(`HP: ${hp.toFixed(0)}/${maxHp}`); 
        const percent = Math.max(0, hp / maxHp);
        if (typeof this.hpBarWidth === 'number') { this.heroHpBarFill.width = this.hpBarWidth * percent; }
        else { console.warn("hpBarWidth is not defined in updateHeroHP"); }
    }
    createSlot(x, y, key, size = 40) {
        const slot = this.add.rectangle(x, y, size, size).setOrigin(0).setFillStyle(0x333333).setStrokeStyle(1, 0x666666); slot.setData('slotKey', key); slot.setInteractive(); slot.on('pointerdown', () => this.onSlotClick(slot)); 
        if (this.uiElements) this.uiElements.add(slot); 
        return slot;
    }
    onSlotClick(slot) {
        if (!this.scene.isActive()) return;
        const slotKey = slot.getData('slotKey'); if (this.selectedItemIndex !== null) { const itemKey = this.inventory[this.selectedItemIndex]; if (!itemKey) { this.clearSelection(); return; } const itemType = ItemData[itemKey].type; if (this.equipSlots[slotKey]) { if (slotKey === itemType) { this.equipItem(itemKey, slotKey); this.inventory[this.selectedItemIndex] = null; this.clearSelection(); this.refreshInventory(); } else { this.showError('해당 아이템을 장착할 수 없는 위치입니다.'); } } else { this.clearSelection(); } } else { if (typeof slotKey === 'number' && slotKey < this.inventory.length && this.inventory[slotKey]) { this.selectedItemIndex = slotKey; this.selectedHighlight.visible = true; if (this.selectedHighlight) { this.selectedHighlight.clear().lineStyle(2, 0xcc99ff).strokeRect(slot.x, slot.y, slot.width, slot.height); } } }
    }
    addItem(itemKey) {
        if (!this.scene.isActive()) return;
        const emptySlotIndex = this.inventory.indexOf(null); if (emptySlotIndex !== -1) { this.inventory[emptySlotIndex] = itemKey; this.refreshInventory(); } else { this.showError('인벤토리가 가득 찼습니다!'); }
    }
    refreshInventory() {
         if (!this.itemIcons) { console.warn("Item icon group not ready in refreshInventory"); return; } 
         this.itemIcons.clear(true, true); 
         this.inventory.forEach((itemKey, index) => { if (itemKey) { const slot = (index < this.inventorySlots.length) ? this.inventorySlots[index] : null; if (slot) { const itemIcon = this.add.rectangle(slot.x + slot.width/2, slot.y + slot.height/2, slot.width * 0.8, slot.height * 0.8, ItemData[itemKey].color); this.itemIcons.add(itemIcon); } } }); Object.keys(this.equipSlots).forEach(slotKey => { const slot = this.equipSlots[slotKey]; if (slot && typeof slot.getData === 'function' && slot.getData('item')) { const itemKey = slot.getData('item'); const itemIcon = this.add.rectangle(slot.x + slot.width/2, slot.y + slot.height/2, slot.width * 0.8, slot.height * 0.8, ItemData[itemKey].color); this.itemIcons.add(itemIcon); } });
    }
    equipItem(itemKey, slotKey) {
        const slot = this.equipSlots[slotKey]; if (slot && typeof slot.setData === 'function') { slot.setData('item', itemKey); } else { console.error(`Equip slot ${slotKey} not found or invalid.`); }
    }
    clearSelection() {
        this.selectedItemIndex = null; if (this.selectedHighlight) { this.selectedHighlight.visible = false; }
    }
    showError(message) {
        if (this.errorText) { this.errorText.setText(message); if (this.scene.isActive()) { this.time.delayedCall(2000, () => { if(this.errorText) this.errorText.setText(''); }); } else { if(this.errorText) this.errorText.setText(''); console.warn("showError called while UIScene is inactive:", message); } }
    } 
} // End of UIScene class

// --- Phaser 게임 설정 ---
const config = {
    type: Phaser.AUTO,
    width: '100%',
    height: '100%',
    physics: {
        default: 'arcade',
        arcade: { debug: false }
    },
    scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.NO_CENTER 
    },
    scene: [GameScene, CombatScene, UIScene]
};

const game = new Phaser.Game(config);

// --- 파일 끝 ---

