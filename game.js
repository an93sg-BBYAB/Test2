// game.js (v7.2 - 안정성 강화 및 오류 수정)

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
    'goblin':   { name: '고블린', hp: 30, atk: 5, color: 0x00aa00, dropRate: 0.10, illustKey: 'goblin_illust' }, // 적 1
    'skeleton': { name: '해골',   hp: 50, atk: 3, color: 0xeeeeee, dropRate: 0.15, illustKey: 'skeleton_illust' }, // 적 2
    'orc':      { name: '오크',   hp: 80, atk: 8, color: 0x008800, dropRate: 0.20, illustKey: 'orc_illust' },    // 적 3
    'demon':    { name: '악마',   hp: 40, atk: 12, color: 0xcc0000, dropRate: 0.25, illustKey: 'demon_illust' },  // 적 4
    'slime':    { name: '슬라임', hp: 20, atk: 2, color: 0x00ffff, dropRate: 0.05, illustKey: 'slime_illust'}     // 적 5
};
const SPAWNABLE_ENEMY_KEYS = ['goblin', 'skeleton', 'orc', 'slime'];

const TILE_TYPE_EMPTY = 0;
const TILE_TYPE_PATH = 1;
const TILE_TYPE_ENEMY2 = 2;
const TILE_TYPE_ENEMY3 = 3;
const TILE_TYPE_ENEMY5 = 5;

// --- 1. 메인 게임 씬 (필드 탐험) ---
class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.TILE_SIZE = 48; 
        this.TOP_UI_HEIGHT = 50; 
        this.RIGHT_UI_WIDTH = 190;
        this.GRID_WIDTH = 25; 
        this.GRID_HEIGHT = 18; 
        
        this.MAP_OFFSET_X = 0; 
        this.MAP_OFFSET_Y = 0;
        this.mapGraphics = null;
        this.hero = null;
        this.pathCoords = []; 
        this.pathCoordsWithOffset = []; 
        this.grid = []; 
        this.specialTileCoords = { [TILE_TYPE_ENEMY2]: [], [TILE_TYPE_ENEMY3]: [], [TILE_TYPE_ENEMY5]: [] };
        this.tilesMovedSinceLastDay = 0;
    }

    preload() {
        this.load.image('pixel', 'https://labs.phaser.io/assets/textures/white-pixel.png');
        this.load.image('hero_illust', 'https://labs.phaser.io/assets/textures/white-pixel.png'); 
        this.load.image('goblin_illust', 'https://labs.phaser.io/assets/textures/white-pixel.png');
        this.load.image('skeleton_illust', 'https://labs.phaser.io/assets/textures/white-pixel.png');
        this.load.image('orc_illust', 'https://labs.phaser.io/assets/textures/white-pixel.png');
        this.load.image('demon_illust', 'https://labs.phaser.io/assets/textures/white-pixel.png');
        this.load.image('slime_illust', 'https://labs.phaser.io/assets/textures/white-pixel.png'); 
    }

    create() {
        console.log("GameScene create start");
        // [수정] UIScene을 launch하여 동시에 실행 시작
        this.scene.launch('UIScene'); 
        
        this.pathIndex = 0;
        this.day = 1;
        this.tilesMovedTotal = 0;
        this.enemyTriggers = this.physics.add.group();
        this.mapGraphics = this.add.group();

        this.generateRandomLoop(); // 루프 경로 생성
        
        this.scale.on('resize', this.redraw, this);
        this.events.on('combatComplete', this.onCombatComplete, this);
        
        this.heroData = { hp: 100, maxHp: 100 };
        
        // UIScene이 준비될 시간을 약간 기다린 후 HP 업데이트 이벤트 전송
        this.time.delayedCall(200, () => { 
             if (this.scene.isActive('UIScene')) {
                this.scene.get('UIScene').events.emit('updateHeroHP', this.heroData.hp, this.heroData.maxHp);
             } else {
                 console.warn("UIScene not active when trying to update HP initially.");
             }
        });

        // create 마지막에 redraw를 1회 호출 (현재 화면 크기 기준)
        console.log("GameScene calling initial redraw");
        // [수정] redraw 호출 전 pathCoords 유효성 검사 추가
        if (this.pathCoords && this.pathCoords.length > 0) {
            this.redraw(this.scale.gameSize); 
        } else {
            console.error("Initial redraw skipped: pathCoords is invalid after generation!");
            // 여기서 오류 처리를 하거나 기본 맵을 그릴 수 있음
             this.generateDefaultLoop(); // 안전하게 기본 루프로 대체
             if (this.pathCoords && this.pathCoords.length > 0) {
                 this.redraw(this.scale.gameSize);
             } else {
                 console.error("FATAL: Failed to generate even default loop!");
             }
        }
        console.log("GameScene create end");
    }
    
    redraw(gameSize) {
        console.log("GameScene redraw start", gameSize);
        // [수정] redraw 시작 시 pathCoords 유효성 검사
        if (!this.pathCoords || this.pathCoords.length === 0) {
            console.warn("GameScene redraw skipped: pathCoords is invalid.");
            return; 
        }

        const gameWidth = gameSize ? gameSize.width : this.cameras.main.width;
        const gameHeight = gameSize ? gameSize.height : this.cameras.main.height;
        
        if (gameWidth <= 1 || gameHeight <= 1) {
             console.warn("GameScene redraw skipped due to invalid size:", gameWidth, gameHeight);
            return;
        }

        this.mapGraphics.clear(true, true);
        
        this.calculateMapOffsets(gameWidth, gameHeight);
        this.drawTiles(gameWidth, gameHeight); 
        this.updatePathCoordsWithOffset(); 
        
        if (!this.hero && this.pathCoordsWithOffset.length > 0) { 
            console.log("GameScene creating hero");
            const startPos = this.pathCoordsWithOffset[0];
            if (!startPos) {
                 console.error("Cannot create hero, start position is invalid!");
                 return;
            }
            this.hero = this.physics.add.sprite(startPos.x, startPos.y, 'pixel').setDisplaySize(this.TILE_SIZE * 0.5, this.TILE_SIZE * 0.75).setTint(0x00ffff);
            this.hero.hp = this.heroData.hp;
            this.hero.maxHp = this.heroData.maxHp;
            // overlap은 한 번만 추가
            if (!this.physics.world.overlap(this.hero, this.enemyTriggers)) { // 중복 추가 방지 (정확한 방법은 아님)
                 this.physics.add.overlap(this.hero, this.enemyTriggers, this.onMeetEnemy, null, this);
            }
        } else if (this.hero && this.pathCoordsWithOffset.length > 0) { 
             console.log("GameScene repositioning hero");
            const currentPos = this.pathCoordsWithOffset[this.pathIndex];
             if (!currentPos) {
                 console.error("Cannot reposition hero, current position is invalid!");
                 return;
             }
            this.hero.setPosition(currentPos.x, currentPos.y);
            if (this.hero.body) {
                this.hero.body.reset(currentPos.x, currentPos.y); 
            }
        }
        console.log("GameScene redraw end");
    }

    calculateMapOffsets(gameWidth, gameHeight) {
        // [수정] pathCoords 비어있을 경우 기본값 사용
        if (!this.pathCoords || this.pathCoords.length === 0) {
             this.MAP_OFFSET_X = (gameWidth - this.RIGHT_UI_WIDTH) / 2;
             this.MAP_OFFSET_Y = this.TOP_UI_HEIGHT + (gameHeight - this.TOP_UI_HEIGHT) / 2;
             console.warn("calculateMapOffsets using default due to empty pathCoords.");
             return;
        }
        
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.pathCoords.forEach(coord => {
             if (coord && typeof coord.x === 'number' && typeof coord.y === 'number') { // 유효성 검사
                minX = Math.min(minX, coord.x);
                minY = Math.min(minY, coord.y);
                maxX = Math.max(maxX, coord.x);
                maxY = Math.max(maxY, coord.y);
             } else {
                 console.warn("Invalid coordinate found in pathCoords:", coord);
             }
        });
        
        // 유효한 좌표가 하나도 없었을 경우 처리
         if (minX === Infinity) {
             this.MAP_OFFSET_X = (gameWidth - this.RIGHT_UI_WIDTH) / 2;
             this.MAP_OFFSET_Y = this.TOP_UI_HEIGHT + (gameHeight - this.TOP_UI_HEIGHT) / 2;
             console.warn("calculateMapOffsets using default due to invalid pathCoords content.");
             return;
         }

        const mapPixelWidth = (maxX - minX + 1) * this.TILE_SIZE;
        const mapPixelHeight = (maxY - minY + 1) * this.TILE_SIZE;

        const gameplayAreaWidth = gameWidth - this.
