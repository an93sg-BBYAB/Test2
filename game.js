// game.js (v6.4 - 로딩 지연 및 영웅 시작 위치 수정)

// --- 데이터 정의 --- (동일)
const ItemData = {
    'sword':    { name: '검', type: 'weapon', color: 0x8B4513 },
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
        this.TOP_UI_HEIGHT = 50; 
        this.RIGHT_UI_WIDTH = 190;
        this.GRID_WIDTH = 13; 
        this.GRID_HEIGHT = 9;
        
        this.MAP_OFFSET_X = 0; 
        this.MAP_OFFSET_Y = 0;
        this.mapGraphics = null;
        this.hero = null; // [수정] 영웅을 null로 초기화
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
        
        this.mapGraphics = this.add.group();

        this.generateRandomLoop(); // 맵 경로 데이터만 생성
        
        // [수정] ★★★ create에서 redraw를 호출하지 않음 ★★★
        // this.redraw(); 
        
        // [수정] ★★★ resize 이벤트가 발생하면(게임 시작 시 1회 즉시 발생) redraw를 호출 ★★★
        this.scale.on('resize', this.redraw, this);

        this.events.on('combatComplete', this.onCombatComplete, this);
        
        // [수정] 영웅 HP 데이터만 준비 (생성은 redraw에서)
        this.heroData = {
            hp: 100,
            maxHp: 100
        };
        
        this.time.delayedCall(100, () => { 
             if (this.scene.isActive('UIScene')) {
                this.scene.get('UIScene').events.emit('updateHeroHP', this.heroData.hp, this.heroData.maxHp);
             }
        });
    }
    
    redraw(gameSize) { // [수정] resize 이벤트가 gameSize를 전달
        // 1. 기존 맵 그래픽 모두 삭제
        this.mapGraphics.clear(true, true);
        
        // 2. 맵 위치 동적 계산
        this.calculateMapOffsets(gameSize);
        
        // 3. 맵 새로 그리기
        this.drawTiles();
        
        // 4. 경로 좌표 업데이트 (영웅이 따라갈 경로)
        this.updatePathCoords();
        
        // 5. [수정] ★★★ 영웅 생성 또는 위치 업데이트 ★★★
        if (!this.hero) {
            // (요청 2) 영웅이 없으면(첫 실행) 출발점에 생성
            const startPos = this.pathCoordsWithOffset[0];
            this.hero = this.physics.add.sprite(startPos.x, startPos.y, 'pixel').setDisplaySize(16, 24).setTint(0x00ffff);
            
            // 영웅 속성 설정
            this.hero.hp = this.heroData.hp;
            this.hero.maxHp = this.heroData.maxHp;
            
            // 물리 충돌 이벤트 연결
            this.physics.add.overlap(this.hero, this.enemyTriggers, this.onMeetEnemy, null, this);
        } else {
            // 영웅이 이미 있으면(창 크기 조절 시) 현재 경로 인덱스에 맞게 위치만 이동
            const currentPos = this.pathCoordsWithOffset[this.pathIndex];
            this.hero.setPosition(currentPos.x, currentPos.y);
            this.hero.body.reset(currentPos.x, currentPos.y); // 물리 몸체도 리셋
        }
    }

    calculateMapOffsets(gameSize) {
        // [수정] gameSize가 없으면(초기 호출 방지) 카메라에서 가져옴
        const gameWidth = gameSize ? gameSize.width : this.cameras.main.width;
        const gameHeight = gameSize ? gameSize.height : this.cameras.main.height;
        
        const mapPixelWidth = this.GRID_WIDTH * this.TILE_SIZE;
        const mapPixelHeight = this.GRID_HEIGHT * this.TILE_SIZE;
        
        const gameplayAreaWidth = gameWidth - this.RIGHT_UI_WIDTH;
        const gameplayAreaHeight = gameHeight - this.TOP_UI_HEIGHT;
        
        this.MAP_OFFSET_X = (gameplayAreaWidth / 2) - (mapPixelWidth / 2);
        this.MAP_OFFSET_Y = this.TOP_UI_HEIGHT + (gameplayAreaHeight / 2) - (mapPixelHeight / 2);
    }

    update(time, delta) {
        if (!this.hero || !this.hero.active) return;
        this.moveHero();
    }

    generateRandomLoop() {
        this.grid = Array(this.GRID_HEIGHT).fill(0).map(() => Array(this.GRID_WIDTH).fill(0)); 
        const minSize = 4, maxSize = 6;
        const loopWidth = Phaser.Math.Between(minSize, maxSize);
        const loopHeight = Phaser.Math.Between(minSize, maxSize);
        const startX = Phaser.Math.Between(1, this.GRID_WIDTH - maxSize - 1); 
        const startY = Phaser.Math.Between(1, this.GRID_HEIGHT - maxSize - 1);
        this.startGridPos = { x: startX, y: startY };
        
        this.pathCoords = [];
        for (let x = startX; x <= startX + loopWidth; x++) { this.grid[startY][x] = 1; this.pathCoords.push(new Phaser.Math.Vector2(x * this.TILE_SIZE + 16, startY * this.TILE_SIZE + 16)); }
        for (let y = startY + 1; y <= startY + loopHeight; y++) { this.grid[y][startX + loopWidth] = 1; this.pathCoords.push(new Phaser.Math.Vector2((startX + loopWidth) * this.TILE_SIZE + 16, y * this.TILE_SIZE + 16)); }
        for (let x = startX + loopWidth - 1; x >= startX; x--) { this.grid[startY + loopHeight][x] = 1; this.pathCoords.push(new Phaser.Math.Vector2(x * this.TILE_SIZE + 16, (startY + loopHeight) * this.TILE_SIZE + 16)); }
        for (let y = startY + loopHeight - 1; y > startY; y--) { this.grid[y][startX] = 1; this.pathCoords.push(new Phaser.Math.Vector2(startX * this.TILE_SIZE + 16, y * this.TILE_SIZE + 16)); }
    }
    
    updatePathCoords() {
        this.pathCoordsWithOffset = this.pathCoords.map(coord => {
            return new Phaser.Math.Vector2(
                coord.x + this.MAP_OFFSET_X,
                coord.y + this.MAP_OFFSET_Y
            );
        });
    }

    drawTiles() {
        const bgGraphics = this.add.graphics();
        this.mapGraphics.add(bgGraphics);
        
        bgGraphics.fillStyle(0x000000).fillRect(0, 0, this.cameras.main.width, this.cameras.main.height); 
        
        const mapBgWidth = (this.GRID_WIDTH * this.TILE_SIZE);
        const mapBgHeight = (this.GRID_HEIGHT * this.TILE_SIZE);
        
        bgGraphics.fillStyle(0x333333)
            .fillRect(this.MAP_OFFSET_X, this.MAP_OFFSET_Y, mapBgWidth, mapBgHeight)
            .lineStyle(2, 0x8B4513)
            .strokeRect(this.MAP_OFFSET_X, this.MAP_OFFSET_Y, mapBgWidth, mapBgHeight);

        for (let y = 0; y < this.grid.length; y++) {
            for (let x = 0; x < this.grid[y].length; x++) {
                if (this.grid[y][x] === 0) continue; 
                const tileX = x * this.TILE_SIZE + this.MAP_OFFSET_X;
                const tileY = y * this.TILE_SIZE + this.MAP_OFFSET_Y;
                
                const tileGraphics = this.add.graphics();
                this.mapGraphics.add(tileGraphics); 
                
                tileGraphics.fillStyle(0x555555)
                    .fillRect(tileX, tileY, this.TILE_SIZE, this.TILE_SIZE)
                    .lineStyle(1, 0x8B4513)
                    .strokeRect(tileX, tileY, this.TILE_SIZE, this.TILE_SIZE);
            }
        }
    }

    moveHero() {
        if (!this.pathCoordsWithOffset || this.pathCoordsWithOffset.length === 0) return; // 경로가 아직 없으면 이동 안 함

        const targetPos = this.pathCoordsWithOffset[this.pathIndex];
        const distance = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, targetPos.x, targetPos.y);

        if (distance < 4) {
            this.pathIndex = (this.pathIndex + 1) % this.pathCoordsWithOffset.length;
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
        if (!this.pathCoordsWithOffset || this.pathCoordsWithOffset.length === 0) return;
        
        if (this.tilesMovedTotal % 3 === 0) this.spawnEnemyTrigger(ALL_ENEMY_KEYS[0]);
        if (this.tilesMovedTotal % 4 === 0) this.spawnEnemyTrigger(ALL_ENEMY_KEYS[1]);
        if (this.tilesMovedTotal % 5 === 0) this.spawnEnemyTrigger(ALL_ENEMY_KEYS[2]);
        if (this.tilesMovedTotal % 6 === 0) this.spawnEnemyTrigger(ALL_ENEMY_KEYS[3]);
    }

    spawnEnemyTrigger(enemyKey) {
        const randomPathTile = Phaser.Math.RND.pick(this.pathCoordsWithOffset);
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

        this.scene.sleep('UIScene'); 
        this.scene.pause();
        this.scene.launch('CombatScene', combatData);
        enemyTrigger.destroy();
    }
    
    onCombatComplete(data) {
        this.scene.wake('UIScene'); 
        
        this.hero.hp = data.heroHp;
        this.scene.get('UIScene').events.emit('updateHeroHP', this.hero.hp, this.hero.maxHp);
        
        if (data.loot) {
            this.scene.get('UIScene').events.emit('addItem', data.loot);
        }
        
        if (this.hero.hp <= 0) {
            this.hero.destroy();
            this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2, 'GAME OVER', { fontSize: '40px', fill: '#ff0000' }).setOrigin(0.5);
        } else {
            this.scene.resume();
        }
    }
}

// --- 2. 전투 씬 --- (v6.2와 동일)
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
        const gameWidth = this.cameras.main.width;
        const gameHeight = this.cameras.main.height;
        
        const combatPanelWidth = gameWidth * 0.5;
        const combatPanelHeight = gameHeight * 0.5;
        const combatPanelX = (gameWidth - combatPanelWidth) / 2;
        const combatPanelY = (gameHeight - combatPanelHeight) / 2;
        
        this.add.graphics().fillStyle(0x000000, 0.9).fillRect(0, 0, gameWidth, gameHeight); 
        
        this.add.graphics()
            .fillStyle(0x333333)
            .fillRect(combatPanelX, combatPanelY, combatPanelWidth, combatPanelHeight)
            .lineStyle(2, 0x8B4513)
            .strokeRect(combatPanelX, combatPanelY, combatPanelWidth, combatPanelHeight);
        
        this.heroIllust = this.add.image(combatPanelX + combatPanelWidth * 0.3, combatPanelY + combatPanelHeight * 0.65, 'hero_illust')
                            .setDisplaySize(120, 160).setTint(0x00ffff);
        this.enemyIllust = this.add.image(combatPanelX + combatPanelWidth * 0.7, combatPanelY + combatPanelHeight * 0.65, this.enemyData.illustKey)
                            .setDisplaySize(120, 160).setTint(this.enemyData.color);
        
        const barWidth = 100;
        const barHeight = 10;
        const heroHpBarX = this.heroIllust.x - 50;
        const heroHpBarY = this.heroIllust.y - 90;
        const enemyHpBarX = this.enemyIllust.x - 50;
        const enemyHpBarY = this.enemyIllust.y - 90;
        
        this.heroHpBarBG = this.add.rectangle(heroHpBarX, heroHpBarY, barWidth, barHeight, 0xff0000).setOrigin(0);
        this.heroHpBarFill = this.add.rectangle(heroHpBarX, heroHpBarY, barWidth, barHeight, 0x00ff00).setOrigin(0);
        this.enemyHpBarBG = this.add.rectangle(enemyHpBarX, enemyHpBarY, barWidth, barHeight, 0xff0000).setOrigin(0);
        this.enemyHpBarFill = this.add.rectangle(enemyHpBarX, enemyHpBarY, barWidth, barHeight, 0x00ff00).setOrigin(0);
        
        this.updateHpBars(); 
        
        this.combatRunning = true;
        this.time.delayedCall(this.turnDelay, this.playerAttack, [], this); 
    }
    
    updateHpBars() {
        const barWidth = 100;
        const heroPercent = Math.max(0, this.heroHp / this.heroMaxHp);
        this.heroHpBarFill.width = barWidth * heroPercent; 

        const enemyPercent = Math.max(0, this.enemyHp / this.enemyMaxHp);
        this.enemyHpBarFill.width = barWidth * enemyPercent;
    }
    
    playerAttack() {
        if (!this.combatRunning || !this.heroIllust.active || !this.enemyIllust.active) return;
        
        this.add.tween({
            targets: this.heroIllust,
            x: this.heroIllust.x + 20,
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
            x: this.enemyIllust.x - 20,
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
                this.enemyHpBarBG.destroy();
                this.enemyHpBarFill.destroy();
                
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
        
        const inventoryCenterSlotX = this.cameras.main.width - 190 + 50; 
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
            heroHp: this.hero.hp 
        });
        this.scene.stop();
    }
    
    defeatHero() {
        this.combatRunning = false;
        this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2, 'YOU DIED', { fontSize: '48px', fill: '#ff0000' }).setOrigin(0.5);
        this.heroIllust.active = false;
        this.heroHpBarBG.destroy();
        this.heroHpBarFill.destroy();
        
        this.time.delayedCall(2000, () => {
            this.endCombat(null); 
        }, [], this);
    }
}

// --- 3. UI 씬 --- (v6.3과 동일 - Resize 핸들러 적용)
class UIScene extends Phaser.Scene {
    constructor() {
        super('UIScene');
        this.inventorySlots = [];
        this.equipSlots = {};
        this.inventory = [];
        
        this.UI_WIDTH = 190;
        this.UI_PADDING = 10;
        this.TOP_UI_HEIGHT = 50;
        
        this.labelStyle = { fontSize: '11px', fill: '#cccccc', align: 'center' };
        this.inventoryLabelStyle = { fontSize: '14px', fill: '#cccccc', align: 'left' };
        this.hpStaTextStyle = { fontSize: '12px', fill: '#ffffff' };
        
        this.uiElements = null;
    }
    
    create() {
        this.uiElements = this.add.group();
        this.itemIcons = this.add.group(); // [수정] 아이템 아이콘 그룹도 미리 생성

        // [수정] ★★★ create에서 redraw를 호출하지 않음 ★★★
        // this.redraw();
        
        // [수정] ★★★ resize 이벤트가 발생하면(게임 시작 시 1회 즉시 발생) redraw를 호출 ★★★
        this.scale.on('resize', this.redraw, this);

        // 이벤트 리스너 (한 번만 등록)
        this.scene.get('GameScene').events.on('updateDay', (day) => {
            if (this.dayText) this.dayText.setText(`Day: ${day}`);
        }, this);
        this.scene.get('GameScene').events.on('updateHeroHP', this.updateHeroHP, this);
        this.events.on('addItem', this.addItem, this);
    }
    
    redraw(gameSize) {
        // 1. 기존 UI 요소 모두 삭제 (아이템 아이콘 제외)
        this.uiElements.clear(true, true);
        this.inventorySlots = [];
        this.equipSlots = {};
        
        // 2. 화면 크기 및 UI 시작 위치 다시 계산
        const gameWidth = gameSize ? gameSize.width : this.cameras.main.width;
        const gameHeight = gameSize ? gameSize.height : this.cameras.main.height;
        this.UI_START_X = gameWidth - this.UI_WIDTH;

        // --- 상단 UI 프레임 ---
        const topBar = this.add.graphics().fillStyle(0x666666).fillRect(0, 0, gameWidth, this.TOP_UI_HEIGHT);
        this.uiElements.add(topBar);
        
        const text1 = this.add.text(10, 15, '시간의 흐름', { fontSize: '10px', fill: '#000000' });
        this.dayText = this.add.text(80, 15, 'Day: 1', { fontSize: '14px', fill: '#000000' });
        const text3 = this.add.text(200, 15, '계획', { fontSize: '10px', fill: '#000000' });
        const text4 = this.add.text(300, 15, '게임 UI 화면', { fontSize: '10px', fill: '#000000' });
        const text5 = this.add.text(450, 15, '몇 번째 루프인지 표시', { fontSize: '10px', fill: '#000000' });
        this.uiElements.addMultiple([text1, this.dayText, text3, text4, text5]);

        // --- 우측 UI 프레임 ---
        const rightBar = this.add.graphics().fillStyle(0x333333).fillRect(this.UI_START_X, 0, this.UI_WIDTH, gameHeight);
        this.uiElements.add(rightBar);
        
        const RIGHT_UI_START_X = this.UI_START_X + this.UI_PADDING;
        let currentY = this.TOP_UI_HEIGHT + this.UI_PADDING;
        
        this.heroHpText = this.add.text(RIGHT_UI_START_X, currentY, 'HP: 100/100', this.hpStaTextStyle);
        currentY += 18;
        
        this.hpBarWidth = this.UI_WIDTH - (this.UI_PADDING * 2) - 20;
        this.hpBarHeight = 8;
        this.heroHpBarBG = this.add.rectangle(RIGHT_UI_START_X, currentY, this.hpBarWidth, this.hpBarHeight, 0xff0000).setOrigin(0);
        this.heroHpBarFill = this.add.rectangle(RIGHT_UI_START_X, currentY, this.hpBarWidth, this.hpBarHeight, 0x00ff00).setOrigin(0);
        
        currentY += 15;
        const staText = this.add.text(RIGHT_UI_START_X, currentY, 'STA: 100/100', { fontSize: '12px', fill: '#B09253' });
        currentY += 30;
        this.uiElements.addMultiple([this.heroHpText, this.heroHpBarBG, this.heroHpBarFill, staText]);

        // --- 장비 슬롯 ---
        const EQUIP_SLOT_SIZE = 36;
        const EQUIP_SLOT_GAP_X = 5;
        const EQUIP_SLOT_GAP_Y = 10;

        const helmetLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, 'helmet', this.labelStyle);
        this.equipSlots['helmet'] = this.createSlot(RIGHT_UI_START_X + 10, currentY + 15, 'helmet', EQUIP_SLOT_SIZE);
        currentY += EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_Y + 10;

        const armorLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, 'armor', this.labelStyle);
        this.equipSlots['armor']  = this.createSlot(RIGHT_UI_START_X + 10, currentY + 15, 'armor', EQUIP_SLOT_SIZE);
        const weaponLabel = this.add.text(RIGHT_UI_START_X + 10 + EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X, currentY, 'weapon', this.labelStyle);
        this.equipSlots['weapon'] = this.createSlot(RIGHT_UI_START_X + 10 + EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X, currentY + 15, 'weapon', EQUIP_SLOT_SIZE);
        const shieldLabel = this.add.text(RIGHT_UI_START_X + 10 + (EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X) * 2, currentY, 'shield', this.labelStyle);
        this.equipSlots['shield'] = this.createSlot(RIGHT_UI_START_X + 10 + (EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X) * 2, currentY + 15, 'shield', EQUIP_SLOT_SIZE);
        currentY += EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_Y + 10;

        const glovesLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, 'gloves', this.labelStyle);
        this.equipSlots['gloves'] = this.createSlot(RIGHT_UI_START_X + 10, currentY + 15, 'gloves', EQUIP_SLOT_SIZE);
        const beltLabel = this.add.text(RIGHT_UI_START_X + 10 + EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X, currentY, 'belt', this.labelStyle);
        this.equipSlots['belt']   = this.createSlot(RIGHT_UI_START_X + 10 + EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X, currentY + 15, 'belt', EQUIP_SLOT_SIZE);
        const bootsLabel = this.add.text(RIGHT_UI_START_X + 10 + (EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X) * 2, currentY, 'boots', this.labelStyle);
        this.equipSlots['boots']  = this.createSlot(RIGHT_UI_START_X + 10 + (EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X) * 2, currentY + 15, 'boots', EQUIP_SLOT_SIZE);
        currentY += EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_Y + 10;
        
        this.uiElements.addMultiple([helmetLabel, armorLabel, weaponLabel, shieldLabel, glovesLabel, beltLabel, bootsLabel]);
        
        // --- 능력치 ---
        const statsLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, '능력치', this.inventoryLabelStyle);
        currentY += 20;
        const damageLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, '피해: +X', this.hpStaTextStyle);
        currentY += 15;
        const defenseLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, '방어: +Y', this.hpStaTextStyle);
        currentY += 25;
        this.uiElements.addMultiple([statsLabel, damageLabel, defenseLabel]);

        // --- 인벤토리 ---
        const invLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, 'Inventory', this.inventoryLabelStyle); 
        currentY += 20;
        this.uiElements.add(invLabel);

        const INV_SLOT_SIZE = 36;
        const INV_SLOT_GAP = 5;

        // this.inventory 데이터는 유지됨
        let slotIndex = 0;
        for (let y = 0; y < 4; y++) {
            for (let x = 0; x < 4; x++) {
                const slotX = RIGHT_UI_START_X + 5 + x * (INV_SLOT_SIZE + INV_SLOT_GAP);
                const slotY = currentY + y * (INV_SLOT_SIZE + INV_SLOT_GAP); 
                this.inventorySlots.push(this.createSlot(slotX, slotY, slotIndex++, INV_SLOT_SIZE));
            }
        }
        
        this.selectedHighlight = this.add.graphics().lineStyle(2, 0xcc99ff); 
        this.selectedHighlight.visible = false;
        
        this.errorText = this.add.text(this.UI_START_X + this.UI_WIDTH / 2, gameHeight - 30, '', { fontSize: '10px', fill: '#ff0000' }).setOrigin(0.5); 
        this.uiElements.addMultiple([this.selectedHighlight, this.errorText]);
        
        // HP/아이템 즉시 업데이트
        const gameScene = this.scene.get('GameScene');
        if (gameScene.hero) { // GameScene의 영웅이 생성되었는지 확인
            this.updateHeroHP(gameScene.hero.hp, gameScene.hero.maxHp);
        } else {
            this.updateHeroHP(gameScene.heroData.hp, gameScene.heroData.maxHp); // 임시 데이터로
        }
        this.refreshInventory();
    }
    
    updateHeroHP(hp, maxHp) {
        if (!this.scene.isActive() || !this.heroHpText) return;
        this.heroHpText.setText(`HP: ${hp}/${maxHp}`);
        const percent = Math.max(0, hp / maxHp);
        this.heroHpBarFill.width = this.hpBarWidth * percent;
    }
    
    createSlot(x, y, key, size = 40) {
        const slot = this.add.rectangle(x, y, size, size)
            .setOrigin(0)
            .setFillStyle(0x333333) 
            .setStrokeStyle(1, 0x666666);
            
        slot.setData('slotKey', key);
        slot.setInteractive();
        slot.on('pointerdown', () => this.onSlotClick(slot));
        
        this.uiElements.add(slot);
        return slot;
    }
    
    onSlotClick(slot) {
        const slotKey = slot.getData('slotKey');
        if (this.selectedItemIndex !== null) {
            const itemKey = this.inventory[this.selectedItemIndex];
            if (!itemKey) { 
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
                this.selectedHighlight.strokeRect(slot.x, slot.y, slot.width, slot.height);
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
        this.itemIcons.clear(true, true); // [수정] 기존 아이콘 삭제

        this.inventory.forEach((itemKey, index) => {
            if (itemKey) {
                const slot = this.inventorySlots[index];
                if (slot) { 
                    const itemIcon = this.add.rectangle(slot.x + slot.width/2, slot.y + slot.height/2, slot.width * 0.8, slot.height * 0.8, ItemData[itemKey].color);
                    this.itemIcons.add(itemIcon);
                }
            }
        });
        Object.keys(this.equipSlots).forEach(slotKey => {
            const slot = this.equipSlots[slotKey];
            if (slot && slot.getData('item')) { 
                const itemKey = slot.getData('item');
                const itemIcon = this.add.rectangle(slot.x + slot.width/2, slot.y + slot.height/2, slot.width * 0.8, slot.height * 0.8, ItemData[itemKey].color);
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

// --- Phaser 게임 설정 --- (v6.2와 동일)
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
