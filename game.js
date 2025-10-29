// game.js (v7.0 - 타일/루프/시간/스폰 시스템 대규모 변경)

// --- 데이터 정의 ---
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

// [수정] 5번째 적(슬라임) 추가
const EnemyData = {
    'goblin':   { name: '고블린', hp: 30, atk: 5, color: 0x00aa00, dropRate: 0.10, illustKey: 'goblin_illust' }, // 적 1
    'skeleton': { name: '해골',   hp: 50, atk: 3, color: 0xeeeeee, dropRate: 0.15, illustKey: 'skeleton_illust' }, // 적 2
    'orc':      { name: '오크',   hp: 80, atk: 8, color: 0x008800, dropRate: 0.20, illustKey: 'orc_illust' },    // 적 3
    'demon':    { name: '악마',   hp: 40, atk: 12, color: 0xcc0000, dropRate: 0.25, illustKey: 'demon_illust' },  // 적 4 (전투 참가용 - 현재 스폰 안됨)
    'slime':    { name: '슬라임', hp: 20, atk: 2, color: 0x00ffff, dropRate: 0.05, illustKey: 'slime_illust'}     // 적 5 (임시 illustKey)
};
// [수정] 스폰 로직에서 사용할 키 배열 (적4 제외)
const SPAWNABLE_ENEMY_KEYS = ['goblin', 'skeleton', 'orc', 'slime'];
// 타일 타입 상수 정의
const TILE_TYPE_EMPTY = 0;
const TILE_TYPE_PATH = 1;
const TILE_TYPE_ENEMY2 = 2; // 스켈레톤 스폰 위치
const TILE_TYPE_ENEMY3 = 3; // 오크 스폰 위치
const TILE_TYPE_ENEMY5 = 5; // 슬라임 스폰 위치

// --- 1. 메인 게임 씬 (필드 탐험) ---
class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        // [수정] 타일 크기 변경
        this.TILE_SIZE = 48; 
        this.TOP_UI_HEIGHT = 50; 
        this.RIGHT_UI_WIDTH = 190;
        // 그리드 크기는 루프 생성 범위 제한용으로 사용
        this.GRID_WIDTH = 25; 
        this.GRID_HEIGHT = 18; 
        
        this.MAP_OFFSET_X = 0; 
        this.MAP_OFFSET_Y = 0;
        this.mapGraphics = null;
        this.hero = null;
        this.pathCoords = []; // 그리드 좌표 경로 (x, y)
        this.pathCoordsWithOffset = []; // 화면 픽셀 좌표 경로 (Vector2)
        this.grid = []; // 맵 타일 정보 저장 (타일 타입)
        this.specialTileCoords = { // 특수 타일 좌표 저장
            [TILE_TYPE_ENEMY2]: [],
            [TILE_TYPE_ENEMY3]: [],
            [TILE_TYPE_ENEMY5]: []
        };
        this.tilesMovedSinceLastDay = 0; // [신규] 날짜 계산용
    }

    preload() {
        this.load.image('pixel', 'https://labs.phaser.io/assets/textures/white-pixel.png');
        this.load.image('hero_illust', 'https://labs.phaser.io/assets/textures/white-pixel.png'); 
        this.load.image('goblin_illust', 'https://labs.phaser.io/assets/textures/white-pixel.png');
        this.load.image('skeleton_illust', 'https://labs.phaser.io/assets/textures/white-pixel.png');
        this.load.image('orc_illust', 'https://labs.phaser.io/assets/textures/white-pixel.png');
        this.load.image('demon_illust', 'https://labs.phaser.io/assets/textures/white-pixel.png');
        this.load.image('slime_illust', 'https://labs.phaser.io/assets/textures/white-pixel.png'); // 슬라임 임시
    }

    create() {
        console.log("GameScene create start");
        this.scene.launch('UIScene'); // [수정] run 대신 launch 사용 (혹시 모를 초기화 순서 문제 방지)
        
        this.pathIndex = 0;
        this.day = 1;
        this.tilesMovedTotal = 0;
        this.enemyTriggers = this.physics.add.group();
        this.mapGraphics = this.add.group();

        // [수정] 복잡한 랜덤 루프 생성 시도
        this.generateRandomLoop(); 
        
        this.scale.on('resize', this.redraw, this);
        this.events.on('combatComplete', this.onCombatComplete, this);
        
        this.heroData = { hp: 100, maxHp: 100 };
        
        // UIScene이 준비될 시간을 조금 더 확보
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
        this.drawTiles(gameWidth, gameHeight); // 타일 그리기가 오프셋 계산 이후 수행되어야 함
        this.updatePathCoordsWithOffset(); // 오프셋 적용된 경로 업데이트
        
        if (!this.hero && this.pathCoordsWithOffset.length > 0) { // 경로 생성 확인
            console.log("GameScene creating hero");
            const startPos = this.pathCoordsWithOffset[0];
            if (!startPos) {
                 console.error("Cannot create hero, start position is invalid!");
                 return;
            }
            this.hero = this.physics.add.sprite(startPos.x, startPos.y, 'pixel').setDisplaySize(this.TILE_SIZE * 0.5, this.TILE_SIZE * 0.75).setTint(0x00ffff); // 영웅 크기 조정
            this.hero.hp = this.heroData.hp;
            this.hero.maxHp = this.heroData.maxHp;
            this.physics.add.overlap(this.hero, this.enemyTriggers, this.onMeetEnemy, null, this);
        } else if (this.hero && this.pathCoordsWithOffset.length > 0) { // 경로 생성 확인
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
        // [수정] 맵의 실제 픽셀 크기를 계산 (루프 경로 기반)
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.pathCoords.forEach(coord => {
            minX = Math.min(minX, coord.x);
            minY = Math.min(minY, coord.y);
            maxX = Math.max(maxX, coord.x);
            maxY = Math.max(maxY, coord.y);
        });
        const mapPixelWidth = (maxX - minX + this.TILE_SIZE); // 경로 전체 폭
        const mapPixelHeight = (maxY - minY + this.TILE_SIZE); // 경로 전체 높이

        const gameplayAreaWidth = gameWidth - this.RIGHT_UI_WIDTH;
        const gameplayAreaHeight = gameHeight - this.TOP_UI_HEIGHT;
        
        // 오프셋 계산 시, 맵의 좌상단 좌표(minX, minY)를 고려
        this.MAP_OFFSET_X = (gameplayAreaWidth / 2) - (mapPixelWidth / 2);
        this.MAP_OFFSET_Y = this.TOP_UI_HEIGHT + (gameplayAreaHeight / 2) - (mapPixelHeight / 2);
    }

    update(time, delta) {
        if (!this.hero || !this.hero.active) return;
        this.moveHero();
    }

    // [수정] Random Walk 기반 루프 생성
    generateRandomLoop() {
        this.grid = Array(this.GRID_HEIGHT).fill(0).map(() => Array(this.GRID_WIDTH).fill(0));
        this.pathCoords = [];
        this.specialTileCoords = { [TILE_TYPE_ENEMY2]: [], [TILE_TYPE_ENEMY3]: [], [TILE_TYPE_ENEMY5]: [] };

        const targetLength = Phaser.Math.Between(30, 40);
        const startX = Math.floor(this.GRID_WIDTH / 3); // 중앙 약간 왼쪽에서 시작
        const startY = Math.floor(this.GRID_HEIGHT / 2);
        let currentX = startX;
        let currentY = startY;
        let lastDir = -1; // 이전 이동 방향 (0:상, 1:하, 2:좌, 3:우)

        this.grid[currentY][currentX] = TILE_TYPE_PATH;
        this.pathCoords.push({ x: currentX, y: currentY });

        const directions = [ { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 } ]; // 상하좌우

        for (let i = 1; i < targetLength; i++) {
            let possibleDirs = [0, 1, 2, 3];
            // 바로 이전 방향으로 되돌아가지 않기 (왔던 길 바로 X)
            if (lastDir !== -1) {
                possibleDirs.splice(possibleDirs.indexOf(lastDir ^ 1), 1); // 반대 방향 제거 (0^1=1, 1^1=0, 2^1=3, 3^1=2)
            }

            let moved = false;
            while (possibleDirs.length > 0) {
                const randIndex = Phaser.Math.Between(0, possibleDirs.length - 1);
                const dirIndex = possibleDirs[randIndex];
                const dir = directions[dirIndex];
                const nextX = currentX + dir.dx;
                const nextY = currentY + dir.dy;

                // 맵 경계 체크 및 이미 방문한 곳인지 체크 (단, 마지막에 시작점으로 돌아가는 것은 허용)
                if (nextX >= 1 && nextX < this.GRID_WIDTH - 1 && 
                    nextY >= 1 && nextY < this.GRID_HEIGHT - 1 &&
                    (this.grid[nextY][nextX] === TILE_TYPE_EMPTY || (i === targetLength - 1 && nextX === startX && nextY === startY)) )
                {
                    currentX = nextX;
                    currentY = nextY;
                    this.grid[currentY][currentX] = TILE_TYPE_PATH;
                    this.pathCoords.push({ x: currentX, y: currentY });
                    lastDir = dirIndex;
                    moved = true;
                    break;
                } else {
                    possibleDirs.splice(randIndex, 1); // 불가능한 방향 제거
                }
            }
            if (!moved) break; // 더 이상 이동 불가 시 중단
        }
        
        // 마지막 지점이 시작점이 아니면, 강제로 시작점 추가 (억지 루프)
        if (currentX !== startX || currentY !== startY) {
             this.pathCoords.push({ x: startX, y: startY });
        }
        
        // 생성된 경로가 너무 짧으면 기본 사각 루프 생성 (안전장치)
        if(this.pathCoords.length < 10) {
            console.warn("Random walk failed, creating default loop.");
            this.generateDefaultLoop(); // 기본 사각 루프로 대체
            return;
        }

        // --- 특수 타일 지정 ---
        const pathIndices = Array.from(this.pathCoords.keys()); // [0, 1, 2, ...]
        pathIndices.shift(); // 출발점(0번 인덱스) 제외
        Phaser.Utils.Array.Shuffle(pathIndices); // 인덱스 섞기

        // 적 2 스폰 타일 (2개)
        for(let i = 0; i < 2 && pathIndices.length > 0; i++) {
            const index = pathIndices.pop();
            const coord = this.pathCoords[index];
            this.grid[coord.y][coord.x] = TILE_TYPE_ENEMY2;
            this.specialTileCoords[TILE_TYPE_ENEMY2].push(coord);
        }
        // 적 3 스폰 타일 (3개)
        for(let i = 0; i < 3 && pathIndices.length > 0; i++) {
            const index = pathIndices.pop();
            const coord = this.pathCoords[index];
            this.grid[coord.y][coord.x] = TILE_TYPE_ENEMY3;
            this.specialTileCoords[TILE_TYPE_ENEMY3].push(coord);
        }
        // 적 5 스폰 타일 (1개)
        if(pathIndices.length > 0) {
            const index = pathIndices.pop();
            const coord = this.pathCoords[index];
            this.grid[coord.y][coord.x] = TILE_TYPE_ENEMY5;
            this.specialTileCoords[TILE_TYPE_ENEMY5].push(coord);
        }
        console.log("Generated loop length:", this.pathCoords.length);
        console.log("Special Tiles:", this.specialTileCoords);
    }

    // 기본 사각 루프 생성 (Fallback)
    generateDefaultLoop() {
        this.grid = Array(this.GRID_HEIGHT).fill(0).map(() => Array(this.GRID_WIDTH).fill(0));
        this.pathCoords = [];
        const loopSize = 5;
        const startX = 5, startY = 5;
        this.startGridPos = {x: startX, y: startY};
        for (let x = startX; x <= startX + loopSize; x++) { this.grid[startY][x] = 1; this.pathCoords.push({ x: x, y: startY }); }
        for (let y = startY + 1; y <= startY + loopSize; y++) { this.grid[y][startX + loopSize] = 1; this.pathCoords.push({ x: startX + loopSize, y: y }); }
        for (let x = startX + loopSize - 1; x >= startX; x--) { this.grid[startY + loopSize][x] = 1; this.pathCoords.push({ x: x, y: startY + loopSize }); }
        for (let y = startY + loopSize - 1; y > startY; y--) { this.grid[y][startX] = 1; this.pathCoords.push({ x: startX, y: y }); }
        this.pathCoords.push({ x: startX, y: startY }); // 마지막은 시작점
        // Fallback에서는 특수 타일 지정 생략
    }
    
    // [수정] pathCoords를 기반으로 오프셋 적용된 Vector2 배열 생성
    updatePathCoordsWithOffset() {
        this.pathCoordsWithOffset = this.pathCoords.map(coord => {
            return new Phaser.Math.Vector2(
                coord.x * this.TILE_SIZE + this.TILE_SIZE / 2 + this.MAP_OFFSET_X, // 타일 중앙 좌표
                coord.y * this.TILE_SIZE + this.TILE_SIZE / 2 + this.MAP_OFFSET_Y
            );
        });
    }

    drawTiles(gameWidth, gameHeight) {
        const bgGraphics = this.add.graphics();
        this.mapGraphics.add(bgGraphics);
        
        // 배경색 채우기는 UIScene이 담당하므로 여기서는 제거
        // bgGraphics.fillStyle(0x000000).fillRect(0, 0, gameWidth, gameHeight); 
        
        // 맵 영역 배경 (이전과 동일, 단 위치는 오프셋 사용)
        // const mapBgWidth = (this.GRID_WIDTH * this.TILE_SIZE); // 이제 그리드 크기가 아닌 실제 루프 크기 기반
        // const mapBgHeight = (this.GRID_HEIGHT * this.TILE_SIZE);
        // bgGraphics.fillStyle(0x333333)
        //     .fillRect(this.MAP_OFFSET_X, this.MAP_OFFSET_Y, mapBgWidth, mapBgHeight)
        //     .lineStyle(2, 0x8B4513)
        //     .strokeRect(this.MAP_OFFSET_X, this.MAP_OFFSET_Y, mapBgWidth, mapBgHeight);

        // [수정] pathCoords 기준으로 타일 그리기
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
            // 타일 도착
            this.pathIndex = (this.pathIndex + 1) % this.pathCoordsWithOffset.length;
            this.tilesMovedTotal++;
            this.tilesMovedSinceLastDay++; // [신규] 날짜 계산용 카운터 증가

            // [수정] 날짜 변경 로직
            if (this.tilesMovedSinceLastDay >= 12) {
                this.advanceDay();
            }

            // [수정] 루프 완료 (출발점 도착) 시 적 5 스폰
            if (this.pathIndex === 0) {
                 this.spawnEnemy5();
            }
            
            // 적 스폰은 날짜 변경 시 처리하므로 checkSpawns 제거
            // this.checkSpawns(); 

        } else {
            // 다음 타일로 이동
            this.physics.moveTo(this.hero, targetPos.x, targetPos.y, 150); // 이동 속도 약간 증가
        }
    }
    
    // [신규] 날짜 변경 및 관련 처리 함수
    advanceDay() {
        this.day++;
        this.tilesMovedSinceLastDay = 0;
        console.log(`Day ${this.day} started`);
        
        // UI 업데이트
        this.scene.get('UIScene').events.emit('updateDay', this.day);
        
        // (요청) 체력 회복
        if (this.hero) {
            this.hero.hp = this.hero.maxHp;
            this.scene.get('UIScene').events.emit('updateHeroHP', this.hero.hp, this.hero.maxHp);
        } else {
             this.heroData.hp = this.heroData.maxHp; // 영웅 생성 전이면 데이터만 업데이트
        }
        
        // --- 날짜 기반 적 스폰 ---
        // 1번 적 (10% 확률)
        this.spawnEnemy1();
        
        // 2번 적 (2일 주기)
        if (this.day % 2 === 0) {
            this.spawnEnemy2();
        }
        
        // 3번 적 (3일 주기)
        if (this.day % 3 === 0) {
            this.spawnEnemy3();
        }
    }

    // [신규] 적 스폰 함수들
    spawnEnemy1() { // 고블린
        if (Math.random() < 0.10) {
             // 출발점을 제외한 경로 인덱스 중 랜덤 선택
            const spawnIndex = Phaser.Math.Between(1, this.pathCoordsWithOffset.length - 1); 
            const spawnPos = this.pathCoordsWithOffset[spawnIndex];
             if(spawnPos) this.spawnEnemyTriggerAt('goblin', spawnPos.x, spawnPos.y);
        }
    }
    spawnEnemy2() { // 스켈레톤
        this.specialTileCoords[TILE_TYPE_ENEMY2].forEach(coord => {
            const spawnPos = this.getPixelCoord(coord);
             if(spawnPos) this.spawnEnemyTriggerAt('skeleton', spawnPos.x, spawnPos.y);
        });
    }
    spawnEnemy3() { // 오크
        this.specialTileCoords[TILE_TYPE_ENEMY3].forEach(coord => {
            const spawnPos = this.getPixelCoord(coord);
            if(spawnPos) this.spawnEnemyTriggerAt('orc', spawnPos.x, spawnPos.y);
        });
    }
    spawnEnemy5() { // 슬라임 (3마리)
        if (this.specialTileCoords[TILE_TYPE_ENEMY5].length > 0) {
            const coord = this.specialTileCoords[TILE_TYPE_ENEMY5][0];
            const spawnPos = this.getPixelCoord(coord);
            if (spawnPos) {
                 for(let i=0; i<3; i++) {
                     // 약간의 위치 변동을 주어 겹치지 않게
                     const offsetX = Phaser.Math.Between(-5, 5);
                     const offsetY = Phaser.Math.Between(-5, 5);
                    this.spawnEnemyTriggerAt('slime', spawnPos.x + offsetX, spawnPos.y + offsetY);
                 }
            }
        }
    }

    // [신규] 특정 위치에 적 트리거 생성
    spawnEnemyTriggerAt(enemyKey, x, y) {
        if (!EnemyData[enemyKey]) return;
        console.log(`Spawning ${enemyKey} at (${x.toFixed(0)}, ${y.toFixed(0)})`);
        const enemy = this.enemyTriggers.create(x, y, 'pixel')
            .setDisplaySize(this.TILE_SIZE * 0.4, this.TILE_SIZE * 0.4) // 적 크기 조정
            .setTint(EnemyData[enemyKey].color);
        enemy.enemyKey = enemyKey; 
    }
    
    // [신규] 그리드 좌표를 화면 픽셀 좌표(타일 중앙)로 변환
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
        
        // [보류] 적4(demon) 전투 참가 로직 필요
        // if (enemyKey === 'goblin' && Math.random() < 0.40) {
        //     combatData.reinforcement = EnemyData['demon'];
        // }

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
            // 영웅 위치/상태 복구는 redraw에서 처리
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
        // [보류] 증원군 데이터 처리 필요
        // this.reinforcementData = data.reinforcement; 
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
        
        // [보류] 증원군 등장 로직 추가 필요
        // if(this.reinforcementData) { ... }
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
        // endCombat이 여러 번 호출될 수 있으므로 GameScene 존재 확인
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
        this.inventory = new Array(16).fill(null); // 인벤토리 데이터 초기화
        
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
