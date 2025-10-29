// game.js (v4 - Loop Hero UI 뼈대 재구축 시작)

// --- 데이터 정의 --- (이전과 동일)
const ItemData = {
    'sword':    { name: '검', type: 'weapon', color: 0xff0000 },
    'shield':   { name: '방패', type: 'shield', color: 0x0000ff },
    'helmet':   { name: '투구', type: 'helmet', color: 0xaaaa00 },
    'armor':    { name: '갑옷', type: 'armor', color: 0x888888 },
    'gloves':   { name: '장갑', type: 'gloves', color: 0x00ff00 },
    'belt':     { name: '허리띠', type: 'belt',   color: 0x8B4513 },
    'boots':    { name: '장화', type: 'boots',  color: 0x555555 }
};
const ALL_ITEM_KEYS = Object.keys(ItemData);

const EnemyData = {
    'goblin': { name: '고블린', hp: 30, atk: 5, color: 0x00aa00, dropRate: 0.10, illustKey: 'goblin_illust' },
    'skeleton': { name: '해골', hp: 50, atk: 3, color: 0xeeeeee, dropRate: 0.15, illustKey: 'skeleton_illust' },
    'orc': { name: '오크', hp: 80, atk: 8, color: 0x008800, dropRate: 0.20, illustKey: 'orc_illust' },
    'demon': { name: '악마', hp: 40, atk: 12, color: 0xcc0000, dropRate: 0.25, illustKey: 'demon_illust' }
};
const ALL_ENEMY_KEYS = Object.keys(EnemyData);

// --- 1. 메인 게임 씬 (필드 탐험) ---
class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.TILE_SIZE = 32;
        // (수정) 맵의 시작 오프셋 (Loop Hero 처럼 UI와 겹치지 않게 왼쪽으로 옮김)
        this.MAP_OFFSET_X = 50; 
        this.MAP_OFFSET_Y = 100;
    }

    preload() {
        this.load.image('pixel', 'https://labs.phaser.io/assets/textures/white-pixel.png');
        // (신규) 영웅 일러스트 로드 (전투 씬용) - 임시 사각형
        this.load.image('hero_illust', 'https://labs.phaser.io/assets/textures/white-pixel.png'); 
        // (신규) 적 일러스트 로드 (전투 씬용) - 임시 사각형
        this.load.image('goblin_illust', 'https://labs.phaser.io/assets/textures/white-pixel.png');
        this.load.image('skeleton_illust', 'https://labs.phaser.io/assets/textures/white-pixel.png');
        this.load.image('orc_illust', 'https://labs.phaser.io/assets/textures/white-pixel.png');
        this.load.image('demon_illust', 'https://labs.phaser.io/assets/textures/white-pixel.png');
    }

    create() {
        this.scene.run('UIScene');
        this.pathCoords = [];
        this.pathIndex = 0;
        this.startGridPos = null;
        this.day = 1;
        this.tilesMovedTotal = 0;
        this.enemyTriggers = this.physics.add.group();
        
        // (수정) 맵과 UI의 크기 조절에 따라 그리드 사이즈 조정
        const GRID_WIDTH = 15; // 18 -> 15 (15 * 32 = 480px)
        const GRID_HEIGHT = 12; // 18 -> 12 (12 * 32 = 384px)
        this.generateRandomLoop(GRID_WIDTH, GRID_HEIGHT);
        this.drawTiles();

        const startPos = this.pathCoords[0];
        this.hero = this.physics.add.sprite(startPos.x, startPos.y, 'pixel').setDisplaySize(16, 24).setTint(0x00ffff);
        
        this.hero.hp = 100;
        this.hero.maxHp = 100;
        
        this.time.delayedCall(100, () => { 
             this.scene.get('UIScene').events.emit('updateHeroHP', this.hero.hp, this.hero.maxHp);
        });

        this.physics.add.overlap(this.hero, this.enemyTriggers, this.onMeetEnemy, null, this);
        this.events.on('combatComplete', this.onCombatComplete, this);
    }

    update(time, delta) {
        if (!this.hero.active) return;
        this.moveHero();
    }

    // (수정) 그리드 크기를 매개변수로 받음
    generateRandomLoop(gridWidth, gridHeight) {
        this.grid = Array(gridHeight).fill(0).map(() => Array(gridWidth).fill(0)); 
        const minSize = 5, maxSize = 8; // 맵이 작아져서 maxSize도 줄임
        const loopWidth = Phaser.Math.Between(minSize, maxSize);
        const loopHeight = Phaser.Math.Between(minSize, maxSize);
        const startX = Phaser.Math.Between(1, gridWidth - maxSize - 1); // 가장자리를 피함
        const startY = Phaser.Math.Between(1, gridHeight - maxSize - 1);
        this.startGridPos = { x: startX, y: startY };
        
        this.pathCoords = [];
        for (let x = startX; x <= startX + loopWidth; x++) { this.grid[startY][x] = 1; this.pathCoords.push(new Phaser.Math.Vector2(x * this.TILE_SIZE + 16, startY * this.TILE_SIZE + 16)); }
        for (let y = startY + 1; y <= startY + loopHeight; y++) { this.grid[y][startX + loopWidth] = 1; this.pathCoords.push(new Phaser.Math.Vector2((startX + loopWidth) * this.TILE_SIZE + 16, y * this.TILE_SIZE + 16)); }
        for (let x = startX + loopWidth - 1; x >= startX; x--) { this.grid[startY + loopHeight][x] = 1; this.pathCoords.push(new Phaser.Math.Vector2(x * this.TILE_SIZE + 16, (startY + loopHeight) * this.TILE_SIZE + 16)); }
        for (let y = startY + loopHeight - 1; y > startY; y--) { this.grid[y][startX] = 1; this.pathCoords.push(new Phaser.Math.Vector2(startX * this.TILE_SIZE + 16, y * this.TILE_SIZE + 16)); }

        // (수정) 경로 좌표에 오프셋 적용
        this.pathCoords.forEach(coord => {
            coord.x += this.MAP_OFFSET_X;
            coord.y += this.MAP_OFFSET_Y;
        });
    }

    drawTiles() {
        // 게임 맵 영역만 검은색으로 칠함
        this.add.graphics().fillStyle(0x000000).fillRect(0, 0, 800, 576); 
        
        for (let y = 0; y < this.grid.length; y++) {
            for (let x = 0; x < this.grid[y].length; x++) {
                if (this.grid[y][x] === 0) continue; 
                const tileX = x * this.TILE_SIZE + this.MAP_OFFSET_X;
                const tileY = y * this.TILE_SIZE + this.MAP_OFFSET_Y;
                let tint;
                if (x === this.startGridPos.x && y === this.startGridPos.y) tint = 0x0000ff; 
                else tint = 0x888888; 
                this.add.image(tileX, tileY, 'pixel').setOrigin(0).setDisplaySize(this.TILE_SIZE, this.TILE_SIZE).setTint(tint);
            }
        }
    }

    moveHero() {
        const targetPos = this.pathCoords[this.pathIndex];
        const distance = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, targetPos.x, targetPos.y);

        if (distance < 4) {
            this.pathIndex = (this.pathIndex + 1) % this.pathCoords.length;
            this.tilesMovedTotal++;
            this.checkSpawns();

            if (this.pathIndex === 0) {
                this.day++;
                this.scene.get('UIScene').events.emit('updateDay', this.day);
                this.hero.hp = this.hero.maxHp;
                this.scene.get('UIScene').events.emit('updateHeroHP', this.hero.hp, this.hero.maxHp);
            }
        } else {
            this.physics.moveTo(this.hero, targetPos.x, targetPos.y, 100);
        }
    }

    checkSpawns() {
        if (this.tilesMovedTotal % 3 === 0) this.spawnEnemyTrigger(ALL_ENEMY_KEYS[0]);
        if (this.tilesMovedTotal % 4 === 0) this.spawnEnemyTrigger(ALL_ENEMY_KEYS[1]);
        if (this.tilesMovedTotal % 5 === 0) this.spawnEnemyTrigger(ALL_ENEMY_KEYS[2]);
        if (this.tilesMovedTotal % 6 === 0) this.spawnEnemyTrigger(ALL_ENEMY_KEYS[3]);
    }

    spawnEnemyTrigger(enemyKey) {
        const randomPathTile = Phaser.Math.RND.pick(this.pathCoords);
        const enemy = this.enemyTriggers.create(randomPathTile.x, randomPathTile.y, 'pixel')
            .setDisplaySize(16, 16)
            .setTint(EnemyData[enemyKey].color);
        enemy.enemyKey = enemyKey; 
    }

    onMeetEnemy(hero, enemyTrigger) {
        this.hero.body.stop();
        const enemyKey = enemyTrigger.enemyKey;
        const combatData = {
            enemyData: EnemyData[enemyKey],
            heroHp: this.hero.hp,
            heroMaxHp: this.hero.maxHp
        };

        this.scene.pause('UIScene'); // (수정) UI 씬도 함께 정지
        this.scene.pause();
        this.scene.launch('CombatScene', combatData);
        enemyTrigger.destroy();
    }
    
    onCombatComplete(data) {
        this.scene.resume('UIScene');
        this.hero.hp = data.heroHp;
        this.scene.get('UIScene').events.emit('updateHeroHP', this.hero.hp, this.hero.maxHp);
        
        if (data.loot) {
            this.scene.get('UIScene').events.emit('addItem', data.loot);
        }
        
        if (this.hero.hp <= 0) {
            this.hero.destroy();
            this.add.text(this.game.config.width / 2, this.game.config.height / 2, 'GAME OVER', { fontSize: '40px', fill: '#ff0000' }).setOrigin(0.5);
        } else {
            this.scene.resume();
        }
    }
}

// --- 2. 전투 씬 ---
class CombatScene extends Phaser.Scene {
    constructor() {
        super('CombatScene');
        this.combatRunning = false;
        this.turnDelay = 1000; // 각 턴 사이의 지연 시간 (1초)
    }
    
    init(data) {
        this.enemyData = data.enemyData;
        this.heroHp = data.heroHp;
        this.heroMaxHp = data.heroMaxHp;
        this.enemyHp = this.enemyData.hp;
        this.enemyMaxHp = this.enemyData.hp;
    }
    
    create() {
        // (수정) 전체 화면을 덮는 배경
        this.add.graphics().fillStyle(0x000000, 0.9).fillRect(0, 0, 800, 576); 
        
        // (신규) 전투 배경 이미지 (임시 사각형) - Loop Hero처럼 중앙에 배치
        this.add.rectangle(400, 300, 700, 400, 0x333333); // 전투 배경 (어두운 회색)
        
        // (수정) 일러스트 크기 확대 및 위치 조정
        this.heroIllust = this.add.image(250, 350, 'hero_illust').setDisplaySize(180, 240).setTint(0x00ffff);
        this.enemyIllust = this.add.image(550, 350, this.enemyData.illustKey).setDisplaySize(180, 240).setTint(this.enemyData.color);
        
        this.heroHpBar = this.add.graphics();
        this.enemyHpBar = this.add.graphics();
        this.updateHpBars();
        
        // (요청 2) 자동 전투 시작
        this.combatRunning = true;
        this.time.delayedCall(this.turnDelay, this.playerAttack, [], this); // 첫 공격은 영웅이
    }
    
    updateHpBars() {
        // (수정) HP 게이지 위치 조정 (일러스트 머리 위)
        this.drawHpBar(this.heroHpBar, this.heroIllust.x - 75, this.heroIllust.y - 150, this.heroHp, this.heroMaxHp);
        this.drawHpBar(this.enemyHpBar, this.enemyIllust.x - 75, this.enemyIllust.y - 150, this.enemyHp, this.enemyMaxHp);
    }
    
    drawHpBar(bar, x, y, currentValue, maxValue) {
        bar.clear();
        const width = 150;
        const height = 15;
        const percent = Math.max(0, currentValue / maxValue);
        bar.fillStyle(0xff0000);
        bar.fillRect(x, y, width, height);
        bar.fillStyle(0x00ff00);
        bar.fillRect(x, y, width * percent, height);
    }

    playerAttack() {
        if (!this.combatRunning || !this.heroIllust.active || !this.enemyIllust.active) return;
        
        this.add.tween({
            targets: this.heroIllust,
            x: this.heroIllust.x + 30,
            duration: 100,
            ease: 'Power1',
            yoyo: true,
            onComplete: () => {
                this.enemyHp -= 10; 
                this.updateHpBars();
                
                if (this.enemyHp <= 0) {
                    this.defeatEnemy();
                } else {
                    this.time.delayedCall(this.turnDelay, this.enemyAttack, [], this);
                }
            }
        });
    }
    
    enemyAttack() {
        if (!this.combatRunning || !this.heroIllust.active || !this.enemyIllust.active) return;

        this.add.tween({
            targets: this.enemyIllust,
            x: this.enemyIllust.x - 30,
            duration: 100,
            ease: 'Power1',
            yoyo: true,
            onComplete: () => {
                this.heroHp -= this.enemyData.atk;
                this.updateHpBars();
                
                if (this.heroHp <= 0) {
                    this.defeatHero();
                } else {
                    this.time.delayedCall(this.turnDelay, this.playerAttack, [], this);
                }
            }
        });
    }

    defeatEnemy() {
        this.combatRunning = false;
        this.add.tween({
            targets: this.enemyIllust,
            alpha: 0,
            duration: 500,
            onComplete: () => {
                this.enemyIllust.active = false;
                this.enemyHpBar.clear();
                let loot = null;
                if (Math.random() < this.enemyData.dropRate) {
                    loot = Phaser.Math.RND.pick(ALL_ITEM_KEYS);
                    this.dropItemAnimation(loot);
                } else {
                    this.endCombat(null);
                }
            }
        });
    }
    
    dropItemAnimation(itemKey) {
        const itemData = ItemData[itemKey];
        const itemIcon = this.add.rectangle(this.enemyIllust.x, this.enemyIllust.y, 20, 20, itemData.color);
        
        this.add.tween({
            targets: itemIcon,
            x: 650, y: 300, // UI 씬의 인벤토리 대략 중앙
            duration: 700,
            ease: 'Back.easeIn',
            onComplete: () => {
                itemIcon.destroy();
                this.endCombat(itemKey); 
            }
        });
    }
    
    endCombat(loot) {
        this.combatRunning = false;
        this.scene.get('GameScene').events.emit('combatComplete', { 
            loot: loot, 
            heroHp: this.heroHp 
        });
        this.scene.stop();
    }
    
    defeatHero() {
        this.combatRunning = false;
        this.add.text(400, 300, 'YOU DIED', { fontSize: '48px', fill: '#ff0000' }).setOrigin(0.5);
        this.heroIllust.active = false;
        this.heroHpBar.clear();
        this.time.delayedCall(2000, () => {
            this.endCombat(null); 
        }, [], this);
    }
}

// --- 3. UI 씬 ---
class UIScene extends Phaser.Scene {
    constructor() {
        super('UIScene');
        this.inventorySlots = [];
        this.equipSlots = {};
        this.inventory = [];
        this.labelStyle = { fontSize: '11px', fill: '#ffffff', align: 'center' };
        this.inventoryLabelStyle = { fontSize: '16px', fill: '#fff', align: 'left' };
    }
    
    create() {
        // (수정) Loop Hero 스타일에 맞춰 UI 프레임 배치
        
        // 상단 UI 프레임 (임시)
        this.add.graphics().fillStyle(0x333333).fillRect(0, 0, 800, 80); 
        this.add.text(10, 10, '시간의 흐름', { fontSize: '12px', fill: '#fff' });
        this.dayText = this.add.text(80, 10, 'Day: 1', { fontSize: '16px', fill: '#fff' });
        this.add.text(200, 10, '계획', { fontSize: '12px', fill: '#fff' });
        this.add.text(300, 10, '게임 UI 화면', { fontSize: '12px', fill: '#fff' });
        this.add.text(450, 10, '몇 번째 루프인지 표시', { fontSize: '12px', fill: '#fff' });

        // (수정) 우측 UI 프레임
        this.add.graphics().fillStyle(0x444444).fillRect(580, 0, 220, 576);
        
        // (신규) 영웅의 현재/최대 체력과 스태미너 Placeholder
        this.heroHpText = this.add.text(600, 50, 'HP: 100/100', { fontSize: '14px', fill: '#fff' });
        this.heroHpBar = this.add.graphics();
        this.add.text(600, 70, 'STA: 100/100', { fontSize: '14px', fill: '#fff', color: '#00ffff' }); // 스태미너 임시

        // (요청 5) 장비 슬롯 라벨 + 위치 재조정
        this.add.text(620, 100, 'helmet', this.labelStyle);
        this.equipSlots['helmet'] = this.createSlot(620, 115, 'helmet');
        
        this.add.text(620, 160, 'armor', this.labelStyle);
        this.equipSlots['armor']  = this.createSlot(620, 175, 'armor');
        
        this.add.text(670, 160, 'weapon', this.labelStyle);
        this.equipSlots['weapon'] = this.createSlot(670, 175, 'weapon');
        
        this.add.text(720, 160, 'shield', this.labelStyle);
        this.equipSlots['shield'] = this.createSlot(720, 175, 'shield');
        
        this.add.text(620, 220, 'gloves', this.labelStyle);
        this.equipSlots['gloves'] = this.createSlot(620, 235, 'gloves');
        
        this.add.text(670, 220, 'belt', this.labelStyle);
        this.equipSlots['belt']   = this.createSlot(670, 235, 'belt');
        
        this.add.text(720, 220, 'boots', this.labelStyle);
        this.equipSlots['boots']  = this.createSlot(720, 235, 'boots');

        // (신규) 영웅 능력치 Placeholder
        this.add.text(600, 290, '능력치', { fontSize: '16px', fill: '#fff' });
        this.add.text(600, 310, '피해: +X', { fontSize: '12px', fill: '#fff' });
        this.add.text(600, 325, '방어: +Y', { fontSize: '12px', fill: '#fff' });
        // ... 기타 능력치
        
        // (요청 6) 인벤토리 라벨 추가
        this.add.text(585, 360, 'Inventory', this.inventoryLabelStyle); // 라벨 위치 조정

        this.inventory = new Array(15).fill(null);
        let k = 0;
        for (let y = 0; y < 5; y++) {
            for (let x = 0; x < 3; x++) {
                const slotX = 620 + x * 50;
                const slotY = 390 + y * 50; // 인벤토리 슬롯 시작 Y 위치 조정
                this.inventorySlots.push(this.createSlot(slotX, slotY, k++));
            }
        }
        
        this.selectedItemIndex = null;
        this.selectedHighlight = this.add.graphics().lineStyle(2, 0xcc99ff); 
        this.selectedHighlight.visible = false;
        
        this.errorText = this.add.text(680, 550, '', { fontSize: '12px', fill: '#ff0000' }).setOrigin(0.5); // 에러 메시지 위치 조정

        this.scene.get('GameScene').events.on('updateDay', (day) => {
            this.dayText.setText(`Day: ${day}`);
        }, this);
        this.scene.get('GameScene').events.on('updateHeroHP', this.updateHeroHP, this);
        this.events.on('addItem', this.addItem, this);
        
        this.updateHeroHP(100, 100); 
    }
    
    updateHeroHP(hp, maxHp) {
        if (!this.scene.isActive()) return;
        this.heroHpText.setText(`HP: ${hp}/${maxHp}`);
        this.heroHpBar.clear();
        const width = 180;
        const height = 8;
        const percent = Math.max(0, hp / maxHp);
        this.heroHpBar.fillStyle(0xff0000);
        this.heroHpBar.fillRect(600, 65, width, height); // HP 바 위치 조정
        this.heroHpBar.fillStyle(0x00ff00);
        this.heroHpBar.fillRect(600, 65, width * percent, height);
    }
    
    createSlot(x, y, key) {
        const slot = this.add.rectangle(x, y, 40, 40, 0x000000).setOrigin(0).setStrokeStyle(1, 0xffffff);
        slot.setData('slotKey', key);
        slot.setInteractive();
        slot.on('pointerdown', () => this.onSlotClick(slot));
        return slot;
    }
    
    onSlotClick(slot) {
        const slotKey = slot.getData('slotKey');
        if (this.selectedItemIndex !== null) {
            const itemKey = this.inventory[this.selectedItemIndex];
            const itemType = ItemData[itemKey].type;
            if (this.equipSlots[slotKey]) {
                if (slotKey === itemType) {
                    this.equipItem(itemKey, slotKey);
                    this.inventory[this.selectedItemIndex] = null; 
                    this.clearSelection();
                    this.refreshInventory();
                } else {
                    this.showError('해당 아이템을 장착할 수 없는 위치입니다.');
                }
            } else { this.clearSelection(); }
        } else {
            if (typeof slotKey === 'number' && this.inventory[slotKey]) {
                this.selectedItemIndex = slotKey;
                this.selectedHighlight.visible = true;
                this.selectedHighlight.strokeRect(slot.x, slot.y, 40, 40);
            }
        }
    }
    
    addItem(itemKey) {
        const emptySlotIndex = this.inventory.indexOf(null);
        if (emptySlotIndex !== -1) {
            this.inventory[emptySlotIndex] = itemKey;
            this.refreshInventory();
        } else { this.showError('인벤토리가 가득 찼습니다!'); }
    }
    
    refreshInventory() {
        if(this.itemIcons) this.itemIcons.destroy(true);
        this.itemIcons = this.add.group();
        this.inventory.forEach((itemKey, index) => {
            if (itemKey) {
                const slot = this.inventorySlots[index];
                const itemIcon = this.add.rectangle(slot.x + 20, slot.y + 20, 30, 30, ItemData[itemKey].color);
                this.itemIcons.add(itemIcon);
            }
        });
        Object.keys(this.equipSlots).forEach(slotKey => {
            const slot = this.equipSlots[slotKey];
            if (slot.getData('item')) {
                const itemKey = slot.getData('item');
                const itemIcon = this.add.rectangle(slot.x + 20, slot.y + 20, 30, 30, ItemData[itemKey].color);
                this.itemIcons.add(itemIcon);
            }
        });
    }
    
    equipItem(itemKey, slotKey) {
        const slot = this.equipSlots[slotKey];
        slot.setData('item', itemKey);
    }
    
    clearSelection() {
        this.selectedItemIndex = null;
        this.selectedHighlight.visible = false;
    }
    
    showError(message) {
        this.errorText.setText(message);
        this.time.delayedCall(2000, () => this.errorText.setText(''));
    }
}

// --- Phaser 게임 설정 ---
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 576,
    physics: {
        default: 'arcade',
        arcade: { debug: false }
    },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 1200, // 실제 캔버스 넓이
        height: 864  // 실제 캔버스 높이
    },
    scene: [GameScene, CombatScene, UIScene]
};

const game = new Phaser.Game(config);
