// game.js (v5 - Loop Hero UI/레이아웃 조정 및 색상 통일)

// --- 데이터 정의 --- (이전과 동일)
const ItemData = {
    'sword':    { name: '검', type: 'weapon', color: 0x8B4513 }, // 임시 아이템 색상 (갈색)
    'shield':   { name: '방패', type: 'shield', color: 0x8B4513 },
    'helmet':   { name: '투구', type: 'helmet', color: 0x8B4513 },
    'armor':    { name: '갑옷', type: 'armor', color: 0x8B4513 },
    'gloves':   { name: '장갑', type: 'gloves', color: 0x8B4513 },
    'belt':     { name: '허리띠', type: 'belt',   color: 0x8B4513 },
    'boots':    { name: '장화', type: 'boots',  color: 0x8B4513 }
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
        // (수정) 맵의 시작 오프셋 (UI 영역 고려)
        this.MAP_OFFSET_X = 140; 
        this.MAP_OFFSET_Y = 120;
    }

    preload() {
        this.load.image('pixel', 'https://labs.phaser.io/assets/textures/white-pixel.png');
        this.load.image('hero_illust', 'https://labs.phaser.io/assets/textures/white-pixel.png'); 
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
        
        // (수정) 맵의 그리드 크기 조정 (오른쪽 스크린샷 기준)
        const GRID_WIDTH = 13; 
        const GRID_HEIGHT = 9; 
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

    generateRandomLoop(gridWidth, gridHeight) {
        this.grid = Array(gridHeight).fill(0).map(() => Array(gridWidth).fill(0)); 
        const minSize = 4, maxSize = 6; // 맵이 작아져서 maxSize도 줄임
        const loopWidth = Phaser.Math.Between(minSize, maxSize);
        const loopHeight = Phaser.Math.Between(minSize, maxSize);
        const startX = Phaser.Math.Between(1, gridWidth - maxSize - 1); 
        const startY = Phaser.Math.Between(1, gridHeight - maxSize - 1);
        this.startGridPos = { x: startX, y: startY };
        
        this.pathCoords = [];
        for (let x = startX; x <= startX + loopWidth; x++) { this.grid[startY][x] = 1; this.pathCoords.push(new Phaser.Math.Vector2(x * this.TILE_SIZE + 16, startY * this.TILE_SIZE + 16)); }
        for (let y = startY + 1; y <= startY + loopHeight; y++) { this.grid[y][startX + loopWidth] = 1; this.pathCoords.push(new Phaser.Math.Vector2((startX + loopWidth) * this.TILE_SIZE + 16, y * this.TILE_SIZE + 16)); }
        for (let x = startX + loopWidth - 1; x >= startX; x--) { this.grid[startY + loopHeight][x] = 1; this.pathCoords.push(new Phaser.Math.Vector2(x * this.TILE_SIZE + 16, (startY + loopHeight) * this.TILE_SIZE + 16)); }
        for (let y = startY + loopHeight - 1; y > startY; y--) { this.grid[y][startX] = 1; this.pathCoords.push(new Phaser.Math.Vector2(startX * this.TILE_SIZE + 16, y * this.TILE_SIZE + 16)); }

        this.pathCoords.forEach(coord => {
            coord.x += this.MAP_OFFSET_X;
            coord.y += this.MAP_OFFSET_Y;
        });
    }

    drawTiles() {
        // (수정) 게임 플레이 화면의 배경 (검은색)
        this.add.graphics().fillStyle(0x000000).fillRect(0, 0, 800, 576); 
        
        // (신규) 맵 배경 (스크린샷처럼 검은색 테두리가 있는 회색 사각형)
        const mapBgWidth = (this.grid[0].length * this.TILE_SIZE);
        const mapBgHeight = (this.grid.length * this.TILE_SIZE);
        this.add.graphics()
            .fillStyle(0x333333) // 어두운 회색 배경
            .fillRect(this.MAP_OFFSET_X, this.MAP_OFFSET_Y, mapBgWidth, mapBgHeight)
            .lineStyle(2, 0x8B4513) // 갈색 테두리
            .strokeRect(this.MAP_OFFSET_X, this.MAP_OFFSET_Y, mapBgWidth, mapBgHeight);

        for (let y = 0; y < this.grid.length; y++) {
            for (let x = 0; x < this.grid[y].length; x++) {
                if (this.grid[y][x] === 0) continue; 
                const tileX = x * this.TILE_SIZE + this.MAP_OFFSET_X;
                const tileY = y * this.TILE_SIZE + this.MAP_OFFSET_Y;
                
                // (수정) 루프 타일은 회색 배경에 갈색 테두리
                this.add.graphics()
                    .fillStyle(0x555555) // 회색 타일
                    .fillRect(tileX, tileY, this.TILE_SIZE, this.TILE_SIZE)
                    .lineStyle(1, 0x8B4513) // 갈색 테두리
                    .strokeRect(tileX, tileY, this.TILE_SIZE, this.TILE_SIZE);
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
            .setTint(EnemyData[enemyKey].color); // 임시 색상
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

        this.scene.pause('UIScene'); 
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
        this.turnDelay = 1000; 
    }
    
    init(data) {
        this.enemyData = data.enemyData;
        this.heroHp = data.heroHp;
        this.heroMaxHp = data.heroMaxHp;
        this.enemyHp = this.enemyData.hp;
        this.enemyMaxHp = this.enemyData.hp;
    }
    
    create() {
        // (수정) 게임 플레이 화면 중앙에 전투 화면 배치
        const combatPanelWidth = 500;
        const combatPanelHeight = 350;
        const combatPanelX = (this.sys.game.config.width - combatPanelWidth) / 2; // 중앙 계산
        const combatPanelY = (this.sys.game.config.height - combatPanelHeight) / 2;
        
        // (수정) 전체 화면을 덮는 배경 색상
        this.add.graphics().fillStyle(0x000000, 0.9).fillRect(0, 0, 800, 576); 
        
        // (수정) 전투 배경 (스크린샷처럼 어두운 회색에 갈색 테두리)
        this.add.graphics()
            .fillStyle(0x333333) // 어두운 회색 배경
            .fillRect(combatPanelX, combatPanelY, combatPanelWidth, combatPanelHeight)
            .lineStyle(2, 0x8B4513) // 갈색 테두리
            .strokeRect(combatPanelX, combatPanelY, combatPanelWidth, combatPanelHeight);
        
        // (수정) 일러스트 위치 조정 (전투 화면 중앙에 맞춰)
        this.heroIllust = this.add.image(combatPanelX + combatPanelWidth * 0.3, combatPanelY + combatPanelHeight * 0.65, 'hero_illust')
                            .setDisplaySize(120, 160).setTint(0x00ffff); // 크기 약간 줄임
        this.enemyIllust = this.add.image(combatPanelX + combatPanelWidth * 0.7, combatPanelY + combatPanelHeight * 0.65, this.enemyData.illustKey)
                            .setDisplaySize(120, 160).setTint(this.enemyData.color); // 크기 약간 줄임
        
        this.heroHpBar = this.add.graphics();
        this.enemyHpBar = this.add.graphics();
        this.updateHpBars();
        
        this.combatRunning = true;
        this.time.delayedCall(this.turnDelay, this.playerAttack, [], this); 
    }
    
    updateHpBars() {
        // (수정) HP 게이지 위치 조정 (일러스트 머리 위)
        const heroHpBarX = this.heroIllust.x - 50;
        const heroHpBarY = this.heroIllust.y - 90;
        const enemyHpBarX = this.enemyIllust.x - 50;
        const enemyHpBarY = this.enemyIllust.y - 90;

        this.drawHpBar(this.heroHpBar, heroHpBarX, heroHpBarY, this.heroHp, this.heroMaxHp);
        this.drawHpBar(this.enemyHpBar, enemyHpBarX, enemyHpBarY, this.enemyHp, this.enemyMaxHp);
    }
    
    drawHpBar(bar, x, y, currentValue, maxValue) {
        bar.clear();
        const width = 100; // HP 바 너비 줄임
        const height = 10;
        const percent = Math.max(0, currentValue / maxValue);
        bar.fillStyle(0xff0000); // 빨간색 배경
        bar.fillRect(x, y, width, height);
        bar.fillStyle(0x00ff00); // 녹색 채움
        bar.fillRect(x, y, width * percent, height);
    }

    playerAttack() {
        if (!this.combatRunning || !this.heroIllust.active || !this.enemyIllust.active) return;
        
        this.add.tween({
            targets: this.heroIllust,
            x: this.heroIllust.x + 20, // 이동 거리 줄임
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
            x: this.enemyIllust.x - 20, // 이동 거리 줄임
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
        const itemIcon = this.add.rectangle(this.enemyIllust.x, this.enemyIllust.y, 20, 20, itemData.color); // 아이템 색상
        
        // (수정) 인벤토리 슬롯 위치 (UI 씬의 인벤토리 대략 중앙으로)
        const inventoryCenterSlotX = 645; 
        const inventoryCenterSlotY = 415;
        this.add.tween({
            targets: itemIcon,
            x: inventoryCenterSlotX, 
            y: inventoryCenterSlotY,
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
        // (수정) 폰트 색상 및 스타일
        this.labelStyle = { fontSize: '11px', fill: '#cccccc', align: 'center' }; // 밝은 회색
        this.inventoryLabelStyle = { fontSize: '14px', fill: '#cccccc', align: 'left' };
        this.hpStaTextStyle = { fontSize: '12px', fill: '#ffffff' }; // 흰색
    }
    
    create() {
        // (수정) 전체 화면의 가장 뒤를 검은색으로 칠함
        this.add.graphics().fillStyle(0x000000).fillRect(0, 0, 800, 576);

        // (수정) 상단 UI 프레임 (밝은 회색)
        const TOP_UI_HEIGHT = 50; // 높이 조절
        this.add.graphics().fillStyle(0x666666).fillRect(0, 0, 800, TOP_UI_HEIGHT); 
        
        // (수정) 상단 텍스트 위치 및 색상
        this.add.text(10, 15, '시간의 흐름', { fontSize: '10px', fill: '#000000' }); // 검은색 텍스트
        this.dayText = this.add.text(80, 15, 'Day: 1', { fontSize: '14px', fill: '#000000' });
        this.add.text(200, 15, '계획', { fontSize: '10px', fill: '#000000' });
        this.add.text(300, 15, '게임 UI 화면', { fontSize: '10px', fill: '#000000' });
        this.add.text(450, 15, '몇 번째 루프인지 표시', { fontSize: '10px', fill: '#000000' });

        // (수정) 우측 UI 프레임 (스크린샷처럼 짙은 회색)
        const RIGHT_UI_WIDTH = 190; // 넓이 조절
        this.add.graphics().fillStyle(0x333333).fillRect(800 - RIGHT_UI_WIDTH, 0, RIGHT_UI_WIDTH, 576);
        
        // (수정) HP/STA 텍스트와 바 위치 및 색상
        const RIGHT_UI_START_X = 800 - RIGHT_UI_WIDTH + 10;
        let currentY = TOP_UI_HEIGHT + 10; // 상단바 아래에서 시작
        this.heroHpText = this.add.text(RIGHT_UI_START_X, currentY, 'HP: 100/100', this.hpStaTextStyle);
        currentY += 18;
        this.heroHpBar = this.add.graphics();
        this.updateHeroHP(100, 100); // 초기 HP 바 그리기 (이후 updateHeroHP에서 위치 조정)
        currentY += 15;
        this.add.text(RIGHT_UI_START_X, currentY, 'STA: 100/100', { fontSize: '12px', fill: '#00ffff' }); 
        currentY += 30; // 간격 추가

        // (수정) 장비 슬롯 라벨 및 위치 재조정
        const EQUIP_SLOT_SIZE = 36; // 슬롯 크기 약간 줄임
        const EQUIP_SLOT_GAP_X = 5;
        const EQUIP_SLOT_GAP_Y = 10;

        this.add.text(RIGHT_UI_START_X + 10, currentY, 'helmet', this.labelStyle);
        this.equipSlots['helmet'] = this.createSlot(RIGHT_UI_START_X + 10, currentY + 15, 'helmet', EQUIP_SLOT_SIZE);
        currentY += EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_Y + 10;

        this.add.text(RIGHT_UI_START_X + 10, currentY, 'armor', this.labelStyle);
        this.equipSlots['armor']  = this.createSlot(RIGHT_UI_START_X + 10, currentY + 15, 'armor', EQUIP_SLOT_SIZE);
        this.add.text(RIGHT_UI_START_X + 10 + EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X, currentY, 'weapon', this.labelStyle);
        this.equipSlots['weapon'] = this.createSlot(RIGHT_UI_START_X + 10 + EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X, currentY + 15, 'weapon', EQUIP_SLOT_SIZE);
        this.add.text(RIGHT_UI_START_X + 10 + (EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X) * 2, currentY, 'shield', this.labelStyle);
        this.equipSlots['shield'] = this.createSlot(RIGHT_UI_START_X + 10 + (EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X) * 2, currentY + 15, 'shield', EQUIP_SLOT_SIZE);
        currentY += EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_Y + 10;

        this.add.text(RIGHT_UI_START_X + 10, currentY, 'gloves', this.labelStyle);
        this.equipSlots['gloves'] = this.createSlot(RIGHT_UI_START_X + 10, currentY + 15, 'gloves', EQUIP_SLOT_SIZE);
        this.add.text(RIGHT_UI_START_X + 10 + EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X, currentY, 'belt', this.labelStyle);
        this.equipSlots['belt']   = this.createSlot(RIGHT_UI_START_X + 10 + EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X, currentY + 15, 'belt', EQUIP_SLOT_SIZE);
        this.add.text(RIGHT_UI_START_X + 10 + (EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X) * 2, currentY, 'boots', this.labelStyle);
        this.equipSlots['boots']  = this.createSlot(RIGHT_UI_START_X + 10 + (EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X) * 2, currentY + 15, 'boots', EQUIP_SLOT_SIZE);
        currentY += EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_Y + 10;

        // 영웅 능력치 Placeholder
        this.add.text(RIGHT_UI_START_X + 10, currentY, '능력치', this.inventoryLabelStyle);
        currentY += 20;
        this.add.text(RIGHT_UI_START_X + 10, currentY, '피해: +X', this.hpStaTextStyle);
        currentY += 15;
        this.add.text(RIGHT_UI_START_X + 10, currentY, '방어: +Y', this.hpStaTextStyle);
        currentY += 25;

        // (수정) 인벤토리 라벨 및 슬롯 (가로 4, 세로 4)
        this.add.text(RIGHT_UI_START_X + 10, currentY, 'Inventory', this.inventoryLabelStyle); 
        currentY += 20;

        const INV_SLOT_SIZE = 36; // 인벤토리 슬롯 크기
        const INV_SLOT_GAP = 5; // 인벤토리 슬롯 간격

        this.inventory = new Array(16).fill(null); // 총 16개 슬롯
        let slotIndex = 0;
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 4; x++) {
                const slotX = RIGHT_UI_START_X + 5 + x * (INV_SLOT_SIZE + INV_SLOT_GAP);
                const slotY = currentY + y * (INV_SLOT_SIZE + INV_SLOT_GAP); 
                this.inventorySlots.push(this.createSlot(slotX, slotY, slotIndex++, INV_SLOT_SIZE));
            }
        }
        
        this.selectedItemIndex = null;
        this.selectedHighlight = this.add.graphics().lineStyle(2, 0xcc99ff); 
        this.selectedHighlight.visible = false;
        
        this.errorText = this.add.text(RIGHT_UI_START_X + RIGHT_UI_WIDTH / 2, 550, '', { fontSize: '10px', fill: '#ff0000' }).setOrigin(0.5); 

        this.scene.get('GameScene').events.on('updateDay', (day) => {
            this.dayText.setText(`Day: ${day}`);
        }, this);
        this.scene.get('GameScene').events.on('updateHeroHP', this.updateHeroHP, this);
        this.events.on('addItem', this.addItem, this);
    }
    
    updateHeroHP(hp, maxHp) {
        if (!this.scene.isActive()) return;
        this.heroHpText.setText(`HP: ${hp}/${maxHp}`);
        this.heroHpBar.clear();
        const width = 160; // HP 바 너비
        const height = 8;
        const percent = Math.max(0, hp / maxHp);
        
        const RIGHT_UI_START_X = 800 - 190 + 10; // 우측 UI 시작 X 위치 (재계산)
        const HP_BAR_Y = this.heroHpText.y + 18; // 텍스트 아래에 위치

        this.heroHpBar.fillStyle(0xff0000); // 빨간색 배경
        this.heroHpBar.fillRect(RIGHT_UI_START_X, HP_BAR_Y, width, height);
        this.heroHpBar.fillStyle(0x00ff00); // 녹색 채움
        this.heroHpBar.fillRect(RIGHT_UI_START_X, HP_BAR_Y, width * percent, height);
    }
    
    createSlot(x, y, key, size = 40) { // size 매개변수 추가
        // (수정) 슬롯 배경색을 짙은 회색(UI 배경과 동일)으로 변경, 테두리는 밝은 회색
        const slot = this.add.graphics()
            .fillStyle(0x333333) // 짙은 회색 배경
            .fillRect(x, y, size, size)
            .lineStyle(1, 0x666666) // 밝은 회색 테두리
            .strokeRect(x, y, size, size);
        slot.setData('slotKey', key);
        slot.setInteractive(new Phaser.Geom.Rectangle(x, y, size, size), Phaser.Geom.Rectangle.Contains);
        slot.on('pointerdown', () => this.onSlotClick(slot));
        return slot;
    }
    
    onSlotClick(slot) {
        const slotKey = slot.getData('slotKey');
        if (this.selectedItemIndex !== null) {
            const itemKey = this.inventory[this.selectedItemIndex];
            if (!itemKey) { // 빈 슬롯 선택 후 장착 시도 방지
                 this.clearSelection();
                 return;
            }
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
                const slotGraphic = this.inventorySlots[slotKey];
                const slotRect = slotGraphic.getBounds(); // 그래픽의 실제 위치/크기 가져오기
                this.selectedHighlight.strokeRect(slotRect.x, slotRect.y, slotRect.width, slotRect.height);
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
                const slotGraphic = this.inventorySlots[index];
                const slotRect = slotGraphic.getBounds();
                const itemIcon = this.add.rectangle(slotRect.x + slotRect.width/2, slotRect.y + slotRect.height/2, slotRect.width * 0.8, slotRect.height * 0.8, ItemData[itemKey].color);
                this.itemIcons.add(itemIcon);
            }
        });
        Object.keys(this.equipSlots).forEach(slotKey => {
            const slotGraphic = this.equipSlots[slotKey];
            if (slotGraphic.getData('item')) {
                const itemKey = slotGraphic.getData('item');
                const slotRect = slotGraphic.getBounds();
                const itemIcon = this.add.rectangle(slotRect.x + slotRect.width/2, slotRect.y + slotRect.height/2, slotRect.width * 0.8, slotRect.height * 0.8, ItemData[itemKey].color);
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
        width: 1200, 
        height: 864  
    },
    scene: [GameScene, CombatScene, UIScene]
};

const game = new Phaser.Game(config);
