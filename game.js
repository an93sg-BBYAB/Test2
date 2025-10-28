// game.js (v3.1 - 버그 수정)

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
    'goblin': { name: '고블린', hp: 30, atk: 5, color: 0x00aa00, dropRate: 0.10 },
    'skeleton': { name: '해골', hp: 50, atk: 3, color: 0xeeeeee, dropRate: 0.15 },
    'orc': { name: '오크', hp: 80, atk: 8, color: 0x008800, dropRate: 0.20 },
    'demon': { name: '악마', hp: 40, atk: 12, color: 0xcc0000, dropRate: 0.25 }
};
const ALL_ENEMY_KEYS = Object.keys(EnemyData);

// --- 1. 메인 게임 씬 (필드 탐험) ---
class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.TILE_SIZE = 32;
    }

    preload() {
        this.load.image('pixel', 'https://labs.phaser.io/assets/textures/white-pixel.png');
    }

    create() {
        this.scene.run('UIScene');
        this.pathCoords = [];
        this.pathIndex = 0;
        this.startGridPos = null;
        this.day = 1;
        this.tilesMovedTotal = 0;
        this.enemyTriggers = this.physics.add.group();
        
        this.generateRandomLoop();
        this.drawTiles(); // 이 함수가 실행되기 전에 오류가 났었습니다.

        const startPos = this.pathCoords[0];
        this.hero = this.physics.add.sprite(startPos.x, startPos.y, 'pixel').setDisplaySize(16, 24).setTint(0x00ffff);
        
        this.physics.add.overlap(this.hero, this.enemyTriggers, this.onMeetEnemy, null, this);
        this.events.on('combatComplete', this.onCombatComplete, this);
    }

    update(time, delta) {
        if (!this.hero.active) return;
        this.moveHero();
    }

    generateRandomLoop() {
        // (수정 2) UI 영역(580px)을 침범하지 않도록 그리드 너비 수정
        const GRID_WIDTH = 18; // 25 -> 18 ( 18 * 32 = 576px )
        const GRID_HEIGHT = 18;
        this.grid = Array(GRID_HEIGHT).fill(0).map(() => Array(GRID_WIDTH).fill(0)); 
        
        // (수정 1) ★★★ 이 코드가 누락되었습니다 ★★★
        const minSize = 5, maxSize = 10; 

        const loopWidth = Phaser.Math.Between(minSize, maxSize);
        const loopHeight = Phaser.Math.Between(minSize, maxSize);
        // (수정 1) maxSize 변수가 없어 오류가 발생했었습니다.
        const startX = Phaser.Math.Between(2, GRID_WIDTH - maxSize - 2);
        const startY = Phaser.Math.Between(2, GRID_HEIGHT - maxSize - 2);
        this.startGridPos = { x: startX, y: startY };
        
        // 경로 좌표 저장 (이하 동일)
        this.pathCoords = [];
        for (let x = startX; x <= startX + loopWidth; x++) { this.grid[startY][x] = 1; this.pathCoords.push(new Phaser.Math.Vector2(x * this.TILE_SIZE + 16, startY * this.TILE_SIZE + 16)); }
        for (let y = startY + 1; y <= startY + loopHeight; y++) { this.grid[y][startX + loopWidth] = 1; this.pathCoords.push(new Phaser.Math.Vector2((startX + loopWidth) * this.TILE_SIZE + 16, y * this.TILE_SIZE + 16)); }
        for (let x = startX + loopWidth - 1; x >= startX; x--) { this.grid[startY + loopHeight][x] = 1; this.pathCoords.push(new Phaser.Math.Vector2(x * this.TILE_SIZE + 16, (startY + loopHeight) * this.TILE_SIZE + 16)); }
        for (let y = startY + loopHeight - 1; y > startY; y--) { this.grid[y][startX] = 1; this.pathCoords.push(new Phaser.Math.Vector2(startX * this.TILE_SIZE + 16, y * this.TILE_SIZE + 16)); }
    }

    drawTiles() {
        // (수정 3) 맵 오프셋 제거 및 검은 배경 영역 수정
        const mapOffsetX = 0; // -100 -> 0
        const mapOffsetY = 0;
        
        // 게임 영역(0 ~ 580)만 검은색으로 칠합니다.
        this.add.graphics().fillStyle(0x000000).fillRect(0, 0, 580, 576); 
        
        for (let y = 0; y < this.grid.length; y++) {
            for (let x = 0; x < this.grid[y].length; x++) {
                if (this.grid[y][x] === 0) continue; 
                
                const tileX = x * this.TILE_SIZE + mapOffsetX;
                const tileY = y * this.TILE_SIZE + mapOffsetY;
                let tint;

                if (x === this.startGridPos.x && y === this.startGridPos.y) {
                    tint = 0x0000ff; // 출발점 (파랑)
                } else {
                    tint = 0x888888; // 길 (회색)
                }
                this.add.image(tileX, tileY, 'pixel').setOrigin(0).setDisplaySize(this.TILE_SIZE, this.TILE_SIZE).setTint(tint);
            }
        }
        
        this.pathCoords.forEach(coord => {
            coord.x += mapOffsetX;
            coord.y += mapOffsetY;
        });
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
            enemyKey: enemyKey,
            enemyData: EnemyData[enemyKey]
        };
        this.scene.pause();
        this.scene.launch('CombatScene', combatData);
        enemyTrigger.destroy();
    }
    
    onCombatComplete(data) {
        console.log("전투 종료. 획득 아이템:", data.loot);
        if (data.loot) {
            this.scene.get('UIScene').events.emit('addItem', data.loot);
        }
        this.scene.resume();
    }
}

// --- 2. 전투 씬 --- (이전과 동일)
class CombatScene extends Phaser.Scene {
    constructor() {
        super('CombatScene');
    }
    
    init(data) {
        this.enemyData = data.enemyData;
    }
    
    create() {
        this.add.graphics().fillStyle(0x000000, 0.7).fillRect(0, 0, 800, 576);
        
        this.heroIllust = this.add.rectangle(200, 300, 150, 200, 0x00ffff).setOrigin(0.5);
        this.enemyIllust = this.add.rectangle(600, 300, 150, 200, this.enemyData.color).setOrigin(0.5);
        
        this.heroHp = 100;
        this.heroMaxHp = 100;
        this.enemyHp = this.enemyData.hp;
        this.enemyMaxHp = this.enemyData.hp;
        
        this.heroHpBar = this.add.graphics();
        this.enemyHpBar = this.add.graphics();
        this.updateHpBars();
        
        this.add.text(400, 500, '[ 화면을 클릭하여 공격 ]', { fontSize: '20px', fill: '#fff' }).setOrigin(0.5);
        this.input.on('pointerdown', this.playerAttack, this);
    }
    
    updateHpBars() {
        this.drawHpBar(this.heroHpBar, this.heroIllust.x - 75, this.heroIllust.y - 120, this.heroHp, this.heroMaxHp);
        this.drawHpBar(this.enemyHpBar, this.enemyIllust.x - 75, this.enemyIllust.y - 120, this.enemyHp, this.enemyMaxHp);
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
        if (!this.heroIllust.active || !this.enemyIllust.active) return;
        
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
                    this.time.delayedCall(300, this.enemyAttack, [], this);
                }
            }
        });
    }
    
    enemyAttack() {
        if (!this.heroIllust.active || !this.enemyIllust.active) return;

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
                }
            }
        });
    }

    defeatEnemy() {
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
            x: 650, 
            y: 300,
            duration: 700,
            ease: 'Back.easeIn',
            onComplete: () => {
                itemIcon.destroy();
                this.endCombat(itemKey); 
            }
        });
    }
    
    endCombat(loot) {
        this.scene.get('GameScene').events.emit('combatComplete', { loot: loot });
        this.scene.stop();
    }
    
    defeatHero() {
        this.add.text(400, 300, 'GAME OVER', { fontSize: '48px', fill: '#ff0000' }).setOrigin(0.5);
        this.heroIllust.active = false;
        this.scene.pause(); 
    }
}

// --- 3. UI 씬 --- (이전과 동일)
class UIScene extends Phaser.Scene {
    constructor() {
        super('UIScene');
        this.inventorySlots = [];
        this.equipSlots = {};
        this.inventory = [];
    }
    
    create() {
        this.add.graphics().fillStyle(0x444444).fillRect(580, 0, 220, 576);
        
        this.dayText = this.add.text(600, 20, 'Day: 1', { fontSize: '18px', fill: '#fff' });
        
        this.equipSlots['helmet'] = this.createSlot(620, 60, 'helmet');
        this.equipSlots['armor']  = this.createSlot(620, 110, 'armor');
        this.equipSlots['weapon'] = this.createSlot(670, 110, 'weapon');
        this.equipSlots['shield'] = this.createSlot(720, 110, 'shield');
        this.equipSlots['gloves'] = this.createSlot(620, 160, 'gloves');
        this.equipSlots['belt']   = this.createSlot(670, 160, 'belt');
        this.equipSlots['boots']  = this.createSlot(720, 160, 'boots');
        
        this.inventory = new Array(15).fill(null);
        let k = 0;
        for (let y = 0; y < 5; y++) {
            for (let x = 0; x < 3; x++) {
                const slotX = 620 + x * 50;
                const slotY = 250 + y * 50;
                this.inventorySlots.push(this.createSlot(slotX, slotY, k++));
            }
        }
        
        this.selectedItemIndex = null;
        this.selectedHighlight = this.add.graphics().lineStyle(2, 0xcc99ff); 
        this.selectedHighlight.visible = false;
        
        this.errorText = this.add.text(680, 520, '', { fontSize: '12px', fill: '#ff0000' }).setOrigin(0.5);

        this.scene.get('GameScene').events.on('updateDay', (day) => {
            this.dayText.setText(`Day: ${day}`);
        }, this);
        
        this.events.on('addItem', this.addItem, this);
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
            } else {
                 this.clearSelection();
            }
        }
        else {
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
        } else {
            this.showError('인벤토리가 가득 찼습니다!');
        }
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


// --- Phaser 게임 설정 --- (이전과 동일)
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 576,
    physics: {
        default: 'arcade',
        arcade: { debug: false }
    },
    scene: [GameScene, CombatScene, UIScene]
};

const game = new Phaser.Game(config);
