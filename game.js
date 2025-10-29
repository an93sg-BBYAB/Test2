// game.js (v5 - Loop Hero UI/레이아웃 조정 및 색상 통일)

// --- 데이터 정의 ---
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
        // 맵의 시작 오프셋 (UI 영역 고려)
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
        
        // 맵의 그리드 크기 조정 (오른쪽 스크린샷 기준)
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
        // (요청) 게임 플레이 화면의 배경 (검은색)
        this.add.graphics().fillStyle(0x000000).fillRect(0, 0, 800, 576); 
        
        // (요청) 맵 배경 (검은색 테두리가 있는 회색 사각형)
        const mapBgWidth = (this.grid[0].length * this.TILE_SIZE);
        const mapBgHeight = (this.grid.length * this.TILE_SIZE);
        this.add.graphics()
            .fillStyle(0x333333) // 어두운 회색 배경
            .fillRect(this.MAP_OFFSET_X, this.MAP_OFFSET_Y, mapBgWidth, mapBgHeight)
            .lineStyle(2, 0x8B4513) // (요청) 갈색 테두리
            .strokeRect(this.MAP_OFFSET_X, this.MAP_OFFSET_Y, mapBgWidth, mapBgHeight);

        for (let y = 0; y < this.grid.length; y++) {
            for (let x = 0; x < this.grid[y].length; x++) {
                if (this.grid[y][x] === 0) continue; 
                const tileX = x * this.TILE_SIZE + this.MAP_OFFSET_X;
                const tileY = y * this.TILE_SIZE + this.MAP_OFFSET_Y;
                
                // (요청) 루프 타일은 회색 배경에 갈색 테두리
                this.add.graphics()
                    .fillStyle(0x555555) // (요청) 회색 타일
                    .fillRect(tileX, tileY, this.TILE_SIZE, this.TILE_SIZE)
                    .lineStyle(1, 0x8B4513) // (요청) 갈색 테두리
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
        // (요청) 게임 플레이 화면 중앙에 전투 화면 배치
        const combatPanelWidth = 500;
        const combatPanelHeight = 350;
        const combatPanelX = (this.sys.game.config.width - combatPanelWidth) / 2;
        const combatPanelY = (this.sys.game.config.height - combatPanelHeight) / 2;
        
        // 전체 화면을 덮는 배경 색상
        this.add.graphics().fillStyle(0x000000, 0.9).fillRect(0, 0, 800, 576); 
        
        // (요청) 전투 배경 (어두운 회색에 갈색 테두리)
        this.add.graphics()
            .fillStyle(0x333333) // 어두운 회색 배경
            .fillRect(combatPanelX, combatPanelY, combatPanelWidth, combatPanelHeight)
            .lineStyle(2, 0x8B4513) // 갈색 테두리
            .strokeRect(combatPanelX, combatPanelY, combatPanelWidth, combatPanelHeight);
        
        // 일러스트 위치 조정 (전투 화면 중앙에 맞춰)
        this.heroIllust = this.add.image(combatPanelX + combatPanelWidth * 0.3, combatPanelY + combatPanelHeight * 0.65, 'hero_illust')
                            .setDisplaySize(120, 160).setTint(0x00ffff);
        this.enemyIllust = this.add.image(combatPanelX + combatPanelWidth * 0.7, combatPanelY + combatPanelHeight * 0.65, this.enemyData.illustKey)
                            .setDisplaySize(120, 160).setTint(this.enemyData.color);
        
        this.heroHpBar = this.add.graphics();
        this.enemyHpBar = this.add.graphics();
        this.updateHpBars();
        
        this.combatRunning = true;
        this.time.delayedCall(this.turnDelay, this.playerAttack, [], this); 
    }
    
    updateHpBars() {
        const heroHpBarX = this.heroIllust.x - 50;
        const heroHpBarY = this.heroIllust.y - 90;
        const enemyHpBarX = this.enemyIllust.x - 50;
        const enemyHpBarY = this.enemyIllust.y - 90;

        this.drawHpBar(this.heroHpBar, heroHpBarX, heroHpBarY, this.heroHp, this.heroMaxHp);
        this.drawHpBar(this.enemyHpBar, enemyHpBarX, enemyHpBarY, this.enemyHp, this.enemyMaxHp);
    }
    
    drawHpBar(bar, x, y, currentValue, maxValue) {
        bar.clear();
        const width = 100;
        const height = 10;
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
            x: this.heroIllust.x + 20,
            duration: 100,
            ease: 'Power1',
