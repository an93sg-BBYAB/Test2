// game.js (v7.1 - Base Shape + Deformation 루프 생성)

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
    'demon':    { name: '악마',   hp: 40, atk: 12, color: 0xcc0000, dropRate: 0.25, illustKey: 'demon_illust' },  // 적 4 (전투 참가용 - 현재 스폰 안됨)
    'slime':    { name: '슬라임', hp: 20, atk: 2, color: 0x00ffff, dropRate: 0.05, illustKey: 'slime_illust'}     // 적 5 (임시 illustKey)
};
const SPAWNABLE_ENEMY_KEYS = ['goblin', 'skeleton', 'orc', 'slime'];

const TILE_TYPE_EMPTY = 0;
const TILE_TYPE_PATH = 1;
const TILE_TYPE_ENEMY2 = 2; // 스켈레톤 스폰 위치
const TILE_TYPE_ENEMY3 = 3; // 오크 스폰 위치
const TILE_TYPE_ENEMY5 = 5; // 슬라임 스폰 위치

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
        this.pathCoords = []; // 그리드 좌표 경로 (x, y 객체 배열)
        this.pathCoordsWithOffset = []; // 화면 픽셀 좌표 경로 (Vector2 배열)
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
        this.scene.launch('UIScene'); 
        
        this.pathIndex = 0;
        this.day = 1;
        this.tilesMovedTotal = 0;
        this.enemyTriggers = this.physics.add.group();
        this.mapGraphics = this.add.group();

        this.generateRandomLoop(); // [수정] 새로운 루프 생성 함수 호출
        
        this.scale.on('resize', this.redraw, this);
        this.events.on('combatComplete', this.onCombatComplete, this);
        
        this.heroData = { hp: 100, maxHp: 100 };
        
        this.time.delayedCall(200, () => { 
             if (this.scene.isActive('UIScene')) {
                this.scene.get('UIScene').events.emit('updateHeroHP', this.heroData.hp, this.heroData.maxHp);
             }
        });

        console.log("GameScene calling initial redraw");
        this.redraw(this.scale.gameSize); 
        console.log("GameScene create end");
    }
    
    redraw(gameSize) {
        console.log("GameScene redraw start", gameSize);
        const gameWidth = gameSize ? gameSize.width : this.cameras.main.width;
        const gameHeight = gameSize ? gameSize.height : this.cameras.main.height;
        
        if (gameWidth <= 1 || gameHeight <= 1) {
             console.warn("GameScene redraw skipped due to invalid size:", gameWidth, gameHeight);
            return;
        }

        this.mapGraphics.clear(true, true);
        
        this.calculateMapOffsets(gameWidth, gameHeight);
        this.drawTiles(gameWidth, gameHeight); 
        this.updatePathCoordsWithOffset(); // 오프셋 적용된 최종 경로 생성
        
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
            this.physics.add.overlap(this.hero, this.enemyTriggers, this.onMeetEnemy, null, this);
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
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.pathCoords.forEach(coord => {
            minX = Math.min(minX, coord.x);
            minY = Math.min(minY, coord.y);
            maxX = Math.max(maxX, coord.x);
            maxY = Math.max(maxY, coord.y);
        });
        const mapPixelWidth = (maxX - minX + 1) * this.TILE_SIZE; // 그리드 칸 수 * 타일 크기
        const mapPixelHeight = (maxY - minY + 1) * this.TILE_SIZE;

        const gameplayAreaWidth = gameWidth - this.RIGHT_UI_WIDTH;
        const gameplayAreaHeight = gameHeight - this.TOP_UI_HEIGHT;
        
        // 중앙 정렬 + 좌상단 좌표(minX, minY) 보정
        this.MAP_OFFSET_X = (gameplayAreaWidth / 2) - (mapPixelWidth / 2);
        this.MAP_OFFSET_Y = this.TOP_UI_HEIGHT + (gameplayAreaHeight / 2) - (mapPixelHeight / 2);
    }

    update(time, delta) {
        if (!this.hero || !this.hero.active) return;
        this.moveHero();
    }

    // [수정] ★★★ Base Shape + Deformation 루프 생성 함수 ★★★
    generateRandomLoop() {
        this.grid = Array(this.GRID_HEIGHT).fill(0).map(() => Array(this.GRID_WIDTH).fill(0));
        this.pathCoords = [];
        this.specialTileCoords = { [TILE_TYPE_ENEMY2]: [], [TILE_TYPE_ENEMY3]: [], [TILE_TYPE_ENEMY5]: [] };

        const minLoopSize = 5;
        const maxLoopSize = 8;
        const baseWidth = Phaser.Math.Between(minLoopSize, maxLoopSize);
        const baseHeight = Phaser.Math.Between(minLoopSize, maxLoopSize);
        
        // 그리드 중앙 근처에 기본 사각형 배치
        const startX = Math.floor(this.GRID_WIDTH / 2 - baseWidth / 2);
        const startY = Math.floor(this.GRID_HEIGHT / 2 - baseHeight / 2);
        
        let segments = []; // 각 변의 시작점과 끝점, 방향 저장

        // 1. 기본 사각형 경로 생성 및 세그먼트 정보 저장
        let currentPath = [];
        // Top (left to right)
        for (let x = startX; x <= startX + baseWidth; x++) currentPath.push({ x: x, y: startY });
        segments.push({ start: { x: startX, y: startY }, end: { x: startX + baseWidth, y: startY }, dir: 'right' });
        // Right (top to bottom)
        for (let y = startY + 1; y <= startY + baseHeight; y++) currentPath.push({ x: startX + baseWidth, y: y });
        segments.push({ start: { x: startX + baseWidth, y: startY + 1 }, end: { x: startX + baseWidth, y: startY + baseHeight }, dir: 'down' });
        // Bottom (right to left)
        for (let x = startX + baseWidth - 1; x >= startX; x--) currentPath.push({ x: startX + baseHeight, y: x }); // 버그 수정: y좌표 수정
        segments.push({ start: { x: startX + baseWidth - 1, y: startY + baseHeight }, end: { x: startX, y: startY + baseHeight }, dir: 'left' });
        // Left (bottom to top)
        for (let y = startY + baseHeight - 1; y > startY; y--) currentPath.push({ x: startX, y: y });
        segments.push({ start: { x: startX, y: startY + baseHeight - 1 }, end: { x: startX, y: startY + 1 }, dir: 'up' });
        
        // 2. 경로 변형 (Detour 추가)
        let finalPath = [];
        let totalTiles = 0;
        const maxTiles = 40; // 최대 타일 수 제한
        
        for(const segment of segments) {
            let segmentPath = [];
            const len = (segment.dir === 'right' || segment.dir === 'left') ? 
                        Math.abs(segment.end.x - segment.start.x) + 1:
                        Math.abs(segment.end.y - segment.start.y) + 1;
            
            // 현재 세그먼트의 모든 점 추가 (Detour 없을 경우 대비)
             if (segment.dir === 'right') for (let x = segment.start.x; x <= segment.end.x; x++) segmentPath.push({ x: x, y: segment.start.y });
             else if (segment.dir === 'down') for (let y = segment.start.y; y <= segment.end.y; y++) segmentPath.push({ x: segment.start.x, y: y });
             else if (segment.dir === 'left') for (let x = segment.start.x; x >= segment.end.x; x--) segmentPath.push({ x: x, y: segment.start.y });
             else if (segment.dir === 'up') for (let y = segment.start.y; y >= segment.end.y; y--) segmentPath.push({ x: segment.start.x, y: y });

            // 일정 확률(50%) 및 타일 수 여유 있을 때 Detour 시도
            if (len > 3 && Math.random() < 0.5 && totalTiles + segmentPath.length + 4 < maxTiles) { // Detour는 최소 4칸 추가
                const detourLength = Phaser.Math.Between(1, 2); // 돌출 길이
                const detourStartIdx = Phaser.Math.Between(1, segmentPath.length - 3); // 변의 중간 부분에서 시작
                const p1 = segmentPath[detourStartIdx];
                const p2 = segmentPath[detourStartIdx + 1];
                let detourPath = [];

                // Detour 방향 결정 (변의 진행 방향에 수직) & 공간 확인
                let dx1, dy1, dx2, dy2;
                if (segment.dir === 'right' || segment.dir === 'left') { // 수평 이동 시 수직 Detour
                    dx1 = 0; dy1 = Math.random() < 0.5 ? -1 : 1; // 위 또는 아래
                    dx2 = (segment.dir === 'right' ? 1 : -1); dy2 = 0; // 원래 진행 방향
                } else { // 수직 이동 시 수평 Detour
                    dx1 = Math.random() < 0.5 ? -1 : 1; dy1 = 0; // 좌 또는 우
                    dx2 = 0; dy2 = (segment.dir === 'down' ? 1 : -1); // 원래 진행 방향
                }

                // Detour 경로 생성 및 공간 확인 (그리드 범위 및 비어있는지)
                let possible = true;
                let tempPath = [];
                let cx = p1.x, cy = p1.y;
                for(let i=0; i<detourLength; i++) {
                    cx += dx1; cy += dy1;
                    if (cx<1 || cx>=this.GRID_WIDTH-1 || cy<1 || cy>=this.GRID_HEIGHT-1 || this.grid[cy][cx] !== TILE_TYPE_EMPTY) { possible = false; break; }
                    tempPath.push({x: cx, y: cy});
                }
                if(possible) {
                    for(let i=0; i<1; i++) { // 가로/세로 길이 1만큼 이동
                        cx += dx2; cy += dy2;
                        if (cx<1 || cx>=this.GRID_WIDTH-1 || cy<1 || cy>=this.GRID_HEIGHT-1 || this.grid[cy][cx] !== TILE_TYPE_EMPTY) { possible = false; break; }
                        tempPath.push({x: cx, y: cy});
                    }
                }
                if(possible) {
                    for(let i=0; i<detourLength; i++) {
                        cx -= dx1; cy -= dy1; // 반대 방향으로 복귀
                        if (cx<1 || cx>=this.GRID_WIDTH-1 || cy<1 || cy>=this.GRID_HEIGHT-1 || this.grid[cy][cx] !== TILE_TYPE_EMPTY) { possible = false; break; }
                        tempPath.push({x: cx, y: cy});
                    }
                }
                 // 마지막 지점이 p2와 일치하는지 확인
                 if (possible && cx === p2.x && cy === p2.y) {
                    // Detour 성공: segmentPath 중간을 detourPath로 교체
                    detourPath = tempPath;
                    segmentPath.splice(detourStartIdx + 1, 0, ...detourPath.slice(0, -1)); // p2 제외하고 삽입
                    
                    // Detour 경로를 grid에 표시 (겹침 방지용)
                    detourPath.forEach(p => this.grid[p.y][p.x] = TILE_TYPE_PATH); 
                }
            }
            
            // 최종 경로에 추가 (마지막 점은 다음 세그먼트의 시작점이므로 제외)
            finalPath.push(...segmentPath.slice(0, -1));
            totalTiles += segmentPath.length -1;
             
             // grid 업데이트 (Detour 없을 경우) - Detour 시에는 위에서 이미 처리됨
             if (detourPath.length === 0) {
                 segmentPath.forEach(p => this.grid[p.y][p.x] = TILE_TYPE_PATH);
             }
        }
        
        // 시작점으로 돌아오도록 마지막 점 추가
        finalPath.push(finalPath[0]);
        this.pathCoords = finalPath;

        // --- 특수 타일 지정 (이전과 동일) ---
        if(this.pathCoords.length > 10) { // 경로가 유효할 때만
            const pathIndices = Array.from(this.pathCoords.keys()); 
            pathIndices.shift(); // 출발점 제외
             pathIndices.pop(); // 도착점(출발점과 동일) 제외
            Phaser.Utils.Array.Shuffle(pathIndices); 

            for(let i = 0; i < 2 && pathIndices.length > 0; i++) {
                const index = pathIndices.pop();
                const coord = this.pathCoords[index];
                this.grid[coord.y][coord.x] = TILE_TYPE_ENEMY2;
                this.specialTileCoords[TILE_TYPE_ENEMY2].push(coord);
            }
            for(let i = 0; i < 3 && pathIndices.length > 0; i++) {
                const index = pathIndices.pop();
                const coord = this.pathCoords[index];
                this.grid[coord.y][coord.x] = TILE_TYPE_ENEMY3;
                this.specialTileCoords[TILE_TYPE_ENEMY3].push(coord);
            }
            if(pathIndices.length > 0) {
                const index = pathIndices.pop();
                const coord = this.pathCoords[index];
                this.grid[coord.y][coord.x] = TILE_TYPE_ENEMY5;
                this.specialTileCoords[TILE_TYPE_ENEMY5].push(coord);
            }
        }
        console.log("Generated loop length:", this.pathCoords.length);
        console.log("Special Tiles:", this.specialTileCoords);
    }
    
    updatePathCoordsWithOffset() {
        this.pathCoordsWithOffset = this.pathCoords.map(coord => {
            return new Phaser.Math.Vector2(
                coord.x * this.TILE_SIZE + this.TILE_SIZE / 2 + this.MAP_OFFSET_X,
                coord.y * this.TILE_SIZE + this.TILE_SIZE / 2 + this.MAP_OFFSET_Y
            );
        });
    }

    drawTiles(gameWidth, gameHeight) {
        const bgGraphics = this.add.graphics();
        this.mapGraphics.add(bgGraphics);
        
        bgGraphics.fillStyle(0x000000).fillRect(0, 0, gameWidth, gameHeight); 
        
        // 맵 배경은 그리지 않음 (루프 타일만 그림)

        this.pathCoords.forEach(coord => {
            const tileX = coord.x * this.TILE_SIZE + this.MAP_OFFSET_X;
            const tileY = coord.y * this.TILE_SIZE + this.MAP_OFFSET_Y;
            const tileType = this.grid[coord.y][coord.x];
            let fillColor;

            switch(tileType) {
                case TILE_TYPE_ENEMY2: fillColor = 0x0000ff; break; // 파란색
                case TILE_TYPE_ENEMY3: fillColor = 0x00ff00; break; // 녹색
                case TILE_TYPE_ENEMY5: fillColor = 0x800080; break; // 보라색
                case TILE_TYPE_PATH: 
                default: fillColor = 0x555555; break; // 기본 회색
            }

            const tileGraphics = this.add.graphics();
            this.mapGraphics.add(tileGraphics); 
                
            tileGraphics.fillStyle(fillColor)
                    .fillRect(tileX, tileY, this.TILE_SIZE, this.TILE_SIZE)
                    .lineStyle(1, 0x8B4513)
                    .strokeRect(tileX, tileY, this.TILE_SIZE, this.TILE_SIZE);
        });
    }

    moveHero() {
        if (!this.hero || !this.hero.body || !this.pathCoordsWithOffset || this.pathCoordsWithOffset.length === 0) return;

        const targetPos = this.pathCoordsWithOffset[this.pathIndex];
        if (!targetPos || typeof targetPos.x !== 'number' || typeof targetPos.y !== 'number') {
            console.error("Invalid target position:", targetPos, "at index:", this.pathIndex);
            return;
        }
        
        const distance = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, targetPos.x, targetPos.y);

        if (distance < 4) {
            this.pathIndex = (this.pathIndex + 1) % this.pathCoordsWithOffset.length;
            this.tilesMovedTotal++;
            this.tilesMovedSinceLastDay++; 

            if (this.tilesMovedSinceLastDay >= 12) {
                this.advanceDay();
            }
            if (this.pathIndex === 0) { // 루프 완료 시점 확인 (advanceDay 이후)
                 this.spawnEnemy5();
            }
        } else {
            this.physics.moveTo(this.hero, targetPos.x, targetPos.y, 150); 
        }
    }
    
    advanceDay() {
        this.day++;
        this.tilesMovedSinceLastDay = 0;
        console.log(`Day ${this.day} started`);
        
        this.scene.get('UIScene').events.emit('updateDay', this.day);
        
        if (this.hero) {
            this.hero.hp = this.hero.maxHp;
            this.scene.get('UIScene').events.emit('updateHeroHP', this.hero.hp, this.hero.maxHp);
        } else {
             this.heroData.hp = this.heroData.maxHp;
        }
        
        this.spawnEnemy1();
        if (this.day % 2 === 0) this.spawnEnemy2();
        if (this.day % 3 === 0) this.spawnEnemy3();
    }

    spawnEnemy1() { 
        if (Math.random() < 0.10) {
            const spawnIndex = Phaser.Math.Between(1, this.pathCoordsWithOffset.length - 2); // 출발/도착 제외
            const spawnPos = this.pathCoordsWithOffset[spawnIndex];
             if(spawnPos) this.spawnEnemyTriggerAt('goblin', spawnPos.x, spawnPos.y);
        }
    }
    spawnEnemy2() { 
        this.specialTileCoords[TILE_TYPE_ENEMY2].forEach(coord => {
            const spawnPos = this.getPixelCoord(coord);
             if(spawnPos) this.spawnEnemyTriggerAt('skeleton', spawnPos.x, spawnPos.y);
        });
    }
    spawnEnemy3() { 
        this.specialTileCoords[TILE_TYPE_ENEMY3].forEach(coord => {
            const spawnPos = this.getPixelCoord(coord);
            if(spawnPos) this.spawnEnemyTriggerAt('orc', spawnPos.x, spawnPos.y);
        });
    }
    spawnEnemy5() { 
        if (this.specialTileCoords[TILE_TYPE_ENEMY5].length > 0) {
            const coord = this.specialTileCoords[TILE_TYPE_ENEMY5][0];
            const spawnPos = this.getPixelCoord(coord);
            if (spawnPos) {
                 for(let i=0; i<3; i++) {
                     const offsetX = Phaser.Math.Between(-this.TILE_SIZE * 0.2, this.TILE_SIZE * 0.2); // 스폰 위치 미세 조정
                     const offsetY = Phaser.Math.Between(-this.TILE_SIZE * 0.2, this.TILE_SIZE * 0.2);
                    this.spawnEnemyTriggerAt('slime', spawnPos.x + offsetX, spawnPos.y + offsetY);
                 }
            }
        }
    }

    spawnEnemyTriggerAt(enemyKey, x, y) {
        if (!EnemyData[enemyKey]) return;
        console.log(`Spawning ${enemyKey} at (${x.toFixed(0)}, ${y.toFixed(0)})`);
        const enemy = this.enemyTriggers.create(x, y, 'pixel')
            .setDisplaySize(this.TILE_SIZE * 0.4, this.TILE_SIZE * 0.4) 
            .setTint(EnemyData[enemyKey].color);
        enemy.enemyKey = enemyKey; 
    }
    
    getPixelCoord(gridCoord) {
        if (!gridCoord) return null;
        return new Phaser.Math.Vector2(
            gridCoord.x * this.TILE_SIZE + this.TILE_SIZE / 2 + this.MAP_OFFSET_X,
            gridCoord.y * this.TILE_SIZE + this.TILE_SIZE / 2 + this.MAP_OFFSET_Y
        );
    }

    onMeetEnemy(hero, enemyTrigger) {
        if (!this.hero || !this.hero.body) return;
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
            console.log("GameScene calling redraw after combat");
            this.redraw(this.scale.gameSize); 
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
        const gameScene = this.scene.get('GameScene');
        if (gameScene) {
            gameScene.events.emit('combatComplete', { 
                loot: loot, 
                heroHp: this.heroHp 
            });
        }
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

// --- 3. UI 씬 --- (v6.6과 동일)
class UIScene extends Phaser.Scene {
    constructor() {
        super('UIScene');
        this.inventorySlots = [];
        this.equipSlots = {};
        this.inventory = new Array(16).fill(null);
        
        this.UI_WIDTH = 190;
        this.UI_PADDING = 10;
        this.TOP_UI_HEIGHT = 50;
        
        this.labelStyle = { fontSize: '11px', fill: '#cccccc', align: 'center' };
        this.inventoryLabelStyle = { fontSize: '14px', fill: '#cccccc', align: 'left' };
        this.hpStaTextStyle = { fontSize: '12px', fill: '#ffffff' };
        
        this.uiElements = null;
        this.itemIcons = null;
    }
    
    create() {
        console.log("UIScene create start");
        this.uiElements = this.add.group();
        this.itemIcons = this.add.group();

        this.scale.on('resize', this.redraw, this);
        this.events.on('wake', this.handleWake, this);

        const gameScene = this.scene.get('GameScene');
        gameScene.events.on('updateDay', (day) => {
            if (this.dayText) this.dayText.setText(`Day: ${day}`);
        }, this);
        gameScene.events.on('updateHeroHP', this.updateHeroHP, this);
        this.events.on('addItem', this.addItem, this);
        
        console.log("UIScene calling initial redraw");
        this.redraw(this.scale.gameSize);
        console.log("UIScene create end");
    }
    
    handleWake() {
        console.log("UIScene wake, calling redraw");
        this.redraw(this.scale.gameSize);
    }
    
    redraw(gameSize) {
        console.log("UIScene redraw start", gameSize);
        const gameWidth = gameSize ? gameSize.width : this.cameras.main.width;
        const gameHeight = gameSize ? gameSize.height : this.cameras.main.height;
        
        if (gameWidth <= 1 || gameHeight <= 1) {
             console.warn("UIScene redraw skipped due to invalid size:", gameWidth, gameHeight);
            return;
        }

        this.uiElements.clear(true, true);
        this.inventorySlots = [];
        this.equipSlots = {};
        
        this.UI_START_X = gameWidth - this.UI_WIDTH;

        // --- 상단 UI 프레임 ---
        const topBar = this.add.graphics().fillStyle(0x666666).fillRect(0, 0, gameWidth, this.TOP_UI_HEIGHT);
        this.uiElements.add(topBar);
        
        const text1 = this.add.text(10, 15, '시간의 흐름', { fontSize: '10px', fill: '#000000' });
        const gameSceneRef = this.scene.get('GameScene');
        this.dayText = this.add.text(80, 15, `Day: ${gameSceneRef.day || 1}`, { fontSize: '14px', fill: '#000000' });
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
        
        let initialHp = 100, initialMaxHp = 100;
        if (gameSceneRef.hero) {
             initialHp = gameSceneRef.hero.hp;
             initialMaxHp = gameSceneRef.hero.maxHp;
        } else if (gameSceneRef.heroData) {
            initialHp = gameSceneRef.heroData.hp;
            initialMaxHp = gameSceneRef.heroData.maxHp;
        } 
        this.updateHeroHP(initialHp, initialMaxHp);
        this.refreshInventory();
        console.log("UIScene redraw end");
    }
    
    updateHeroHP(hp, maxHp) {
        if (!this.scene.isActive() || !this.heroHpText || !this.heroHpBarFill) return;
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
        this.itemIcons.clear(true, true);

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
        if (this.errorText) {
            this.errorText.setText(message);
            this.time.delayedCall(2000, () => {
                if(this.errorText) this.errorText.setText('');
            });
        }
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
