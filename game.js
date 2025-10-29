// game.js (v6.2 - 맵 중앙 정렬 로직 적용)

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
        // UI 영역 크기를 미리 정의
        this.TOP_UI_HEIGHT = 50; 
        this.RIGHT_UI_WIDTH = 190;
        // 맵 그리드 크기 정의
        this.GRID_WIDTH = 13; 
        this.GRID_HEIGHT = 9;
        
        // 맵 오프셋은 create에서 동적으로 계산됨
        this.MAP_OFFSET_X = 0; 
        this.MAP_OFFSET_Y = 0;
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
        
        // [수정] ★★★ 맵 위치 계산을 create 단계에서 수행 ★★★
        this.calculateMapOffsets(); 
        
        this.generateRandomLoop();
        this.drawTiles(); 

        const startPos = this.pathCoords[0];
        this.hero = this.physics.add.sprite(startPos.x, startPos.y, 'pixel').setDisplaySize(16, 24).setTint(0x00ffff);
        
        this.hero.hp = 100;
        this.hero.maxHp = 100;
        
        this.time.delayedCall(100, () => { 
             if (this.scene.isActive('UIScene')) {
                this.scene.get('UIScene').events.emit('updateHeroHP', this.hero.hp, this.hero.maxHp);
             }
        });

        this.physics.add.overlap(this.hero, this.enemyTriggers, this.onMeetEnemy, null, this);
        this.events.on('combatComplete', this.onCombatComplete, this);
    }
    
    // [신규] ★★★ 맵의 중앙 위치를 동적으로 계산하는 함수 ★★★
    calculateMapOffsets() {
        const gameWidth = this.cameras.main.width;
        const gameHeight = this.cameras.main.height;
        
        // 1. 맵의 픽셀 크기 계산
        const mapPixelWidth = this.GRID_WIDTH * this.TILE_SIZE;
        const mapPixelHeight = this.GRID_HEIGHT * this.TILE_SIZE;
        
        // 2. 맵이 그려질 "게임 영역"의 크기 계산
        const gameplayAreaWidth = gameWidth - this.RIGHT_UI_WIDTH;
        const gameplayAreaHeight = gameHeight - this.TOP_UI_HEIGHT;
        
        // 3. "게임 영역"의 중앙에 맵을 배치하기 위한 X, Y 오프셋 계산
        // (게임 영역 중앙점) - (맵 크기의 절반)
        this.MAP_OFFSET_X = (gameplayAreaWidth / 2) - (mapPixelWidth / 2);
        this.MAP_OFFSET_Y = this.TOP_UI_HEIGHT + (gameplayAreaHeight / 2) - (mapPixelHeight / 2);
    }

    update(time, delta) {
        if (!this.hero.active) return;
        this.moveHero();
    }

    generateRandomLoop() {
        // [수정] 그리드 크기를 this.GRID_WIDTH/HEIGHT로 변경
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

        // [수정] 동적으로 계산된 오프셋을 경로에 적용
        this.pathCoords.forEach(coord => {
            coord.x += this.MAP_OFFSET_X;
            coord.y += this.MAP_OFFSET_Y;
        });
    }

    drawTiles() {
        this.add.graphics().fillStyle(0x000000).fillRect(0, 0, this.cameras.main.width, this.cameras.main.height); 
        
        // [수정] 맵 크기를 this.GRID_WIDTH/HEIGHT로 변경
        const mapBgWidth = (this.GRID_WIDTH * this.TILE_SIZE);
        const mapBgHeight = (this.GRID_HEIGHT * this.TILE_SIZE);
        
        // [수정] 맵 위치를 동적으로 계산된 오프셋으로 적용
        this.add.graphics()
            .fillStyle(0x333333)
            .fillRect(this.MAP_OFFSET_X, this.MAP_OFFSET_Y, mapBgWidth, mapBgHeight)
            .lineStyle(2, 0x8B4513)
            .strokeRect(this.MAP_OFFSET_X, this.MAP_OFFSET_Y, mapBgWidth, mapBgHeight);

        for (let y = 0; y < this.grid.length; y++) {
            for (let x = 0; x < this.grid[y].length; x++) {
                if (this.grid[y][x] === 0) continue; 
                // [수정] 타일 위치를 동적으로 계산된 오프셋으로 적용
                const tileX = x * this.TILE_SIZE + this.MAP_OFFSET_X;
                const tileY = y * this.TILE_SIZE + this.MAP_OFFSET_Y;
                
                this.add.graphics()
                    .fillStyle(0x555555)
                    .fillRect(tileX, tileY, this.TILE_SIZE, this.TILE_SIZE)
                    .lineStyle(1, 0x8B4513)
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
            this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2, 'GAME OVER', { fontSize: '
