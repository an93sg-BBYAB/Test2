// game.js (v6.4 - 검은 화면 오류 수정)

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
        this.hero = null;
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
        
        // 리사이즈 핸들러 설정
        this.scale.on('resize', this.redraw, this);
        
        this.events.on('combatComplete', this.onCombatComplete, this);
        
        this.heroData = { hp: 100, maxHp: 100 };
        
        this.time.delayedCall(100, () => { 
             if (this.scene.isActive('UIScene')) {
                this.scene.get('UIScene').events.emit('updateHeroHP', this.heroData.hp, this.heroData.maxHp);
             }
        });

        // [수정] ★★★ 수동으로 redraw를 1회 호출하여 맵을 즉시 그림 ★★★
        this.redraw(this.scale.gameSize); 
    }
    
    redraw(gameSize) {
        // [수정] ★★★ gameSize가 없으면(초기 호출) 카메라에서 가져옴 ★★★
        const gameWidth = gameSize ? gameSize.width : this.cameras.main.width;
        const gameHeight = gameSize ? gameSize.height : this.cameras.main.height;
        
        this.mapGraphics.clear(true, true);
        
        this.calculateMapOffsets(gameWidth, gameHeight);
        this.drawTiles(gameWidth, gameHeight);
        this.updatePathCoords();
        
        if (!this.hero) {
            const startPos = this.pathCoordsWithOffset[0];
            this.hero = this.physics.add.sprite(startPos.x, startPos.y, 'pixel').setDisplaySize(16, 24).setTint(0x00ffff);
            this.hero.hp = this.heroData.hp;
            this.hero.maxHp = this.heroData.maxHp;
            this.physics.add.overlap(this.hero, this.enemyTriggers, this.onMeetEnemy, null, this);
        } else {
            const currentPos = this.pathCoordsWithOffset[this.pathIndex];
            this.hero.setPosition(currentPos.x, currentPos.y);
            this.hero.body.reset(currentPos.x, currentPos.y);
        }
    }

    calculateMapOffsets(gameWidth, gameHeight) {
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

    drawTiles(gameWidth, gameHeight) {
        const bgGraphics = this.add.graphics();
        this.mapGraphics.add(bgGraphics);
        
        bgGraphics.fillStyle(0x000000).fillRect(0, 0, gameWidth, gameHeight); 
        
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
        if (!this.pathCoordsWithOffset || this.pathCoordsWithOffset.length === 0) return;

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
        const itemIcon = this.add.rectangle(this.enemyIllust.x, this.enemyIllust.y
