// game.js (v6.5 - Redraw 호출 시점 변경)

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
        this.initialRedrawDone = false; // [신규] redraw 최초 실행 플래그
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

        this.generateRandomLoop();
        
        this.scale.on('resize', this.redraw, this);
        this.events.on('combatComplete', this.onCombatComplete, this);
        
        this.heroData = { hp: 100, maxHp: 100 };
        
        this.time.delayedCall(100, () => { 
             if (this.scene.isActive('UIScene')) {
                this.scene.get('UIScene').events.emit('updateHeroHP', this.heroData.hp, this.heroData.maxHp);
             }
        });

        // [수정] create에서 redraw 호출 제거
        // this.redraw(this.scale.gameSize); 
    }
    
    redraw(gameSize) {
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
            // 전투 후에는 body가 없을 수 있으므로 확인 후 reset
            if (this.hero.body) {
                this.hero.body.reset(currentPos.x, currentPos.y); 
            }
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
        // [신규] ★★★ 최초 1회 redraw 실행 ★★★
        if (!this.initialRedrawDone && this.cameras.main.width > 1 && this.cameras.main.height > 1) {
            console.log("Initial redraw triggered in GameScene update");
            this.redraw(this.scale.gameSize);
            this.initialRedrawDone = true;
        }

        if (!this.hero || !this.hero.active) return;
        this.moveHero();
    }

    generateRandomLoop() {
        this.grid = Array(this.GRID_HEIGHT).fill(0).map(()
