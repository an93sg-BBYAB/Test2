// game.js (v8.3 - 루프, 전투, UI, 재시작 기능 대규모 수정)

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

const EnemyData = {
    'goblin':   { name: '고블린', hp: 30, atk: 5, color: 0x00aa00, dropRate: 0.10, illustKey: 'goblin_illust', attackTime: 1.0 },
    'skeleton': { name: '해골',   hp: 50, atk: 3, color: 0xeeeeee, dropRate: 0.15, illustKey: 'skeleton_illust', attackTime: 1.0 },
    'orc':      { name: '오크',   hp: 80, atk: 8, color: 0x008800, dropRate: 0.20, illustKey: 'orc_illust',    attackTime: 1.0 },
    'demon':    { name: '악마',   hp: 40, atk: 12, color: 0xcc0000, dropRate: 0.25, illustKey: 'demon_illust',  attackTime: 1.0 }, // 적 4
    'slime':    { name: '슬라임', hp: 20, atk: 2, color: 0x00ffff, dropRate: 0.05, illustKey: 'slime_illust',    attackTime: 1.0 } // 적 5
};
const SPAWNABLE_ENEMY_KEYS = ['goblin', 'skeleton', 'orc', 'slime'];

const TILE_TYPE_EMPTY = 0;
const TILE_TYPE_PATH = 1;
const TILE_TYPE_ENEMY2 = 2;
const TILE_TYPE_ENEMY3 = 3;
const TILE_TYPE_ENEMY5 = 5;
const TILE_TYPE_START = 6; // [신규] 출발점 타일

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
        this.pathCoords = []; // 그리드 좌표 (순서대로)
        this.pathCoordsWithOffset = []; // 픽셀 좌표 (순서대로)
        this.grid = []; // 맵 타일 타입 (2D 배열)
        this.specialTileCoords = { [TILE_TYPE_ENEMY2]: [], [TILE_TYPE_ENEMY3]: [], [TILE_TYPE_ENEMY5]: [] };
        this.tilesMovedSinceLastDay = 0;
        this.isInitialDrawComplete = false; 
        this.startingCombat = false; // [신규] 중복 전투 방지 플래그
    }

    preload() {
        const pixelData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/wcAAwAB/epA8AAAAABJRU5ErkJggg==';
        if (!this.textures.exists('pixel')) { 
            this.textures.addBase64('pixel', pixelData);
        }
    }

    create() {
        console.log("GameScene create start");
        this.scene.run('UIScene'); 
        
        this.registry.set('isPaused', false);

        this.pathIndex = 0;
        this.day = 1;
        this.tilesMovedTotal = 0;
        this.enemyTriggers = this.physics.add.group();
        this.mapGraphics = this.add.group();

        this.generateRandomLoop(); // 루프 경로 생성 (데이터만)
        
        this.scale.on('resize', this.redraw, this);
        this.events.on('combatComplete', this.onCombatComplete, this);
        
        this.heroData = { hp: 100, maxHp: 100, attackTime: 0.8 }; 
        
        this.time.delayedCall(200, () => { 
             const uiScene = this.scene.get('UIScene');
             if (uiScene && this.scene.isActive('UIScene')) {
                uiScene.events.emit('updateHeroHP', this.heroData.hp, this.heroData.maxHp);
             } else {
                 console.warn("UIScene not active or ready for initial events.");
             }
        });

        console.log("GameScene calling initial redraw");
        if (this.pathCoords && this.pathCoords.length > 0) {
            this.time.delayedCall(50, () => { 
                 console.log("Executing delayed initial redraw for GameScene");
                this.redraw(this.scale.gameSize); 
            }, [], this);
        } else {
            console.error("Initial redraw skipped: pathCoords is invalid after generation!");
             this.generateDefaultLoop(); 
             this.assignSpecialTiles(); // 기본 루프에도 특수 타일 할당
             if (this.pathCoords && this.pathCoords.length > 0) {
                  this.time.delayedCall(50, () => {
                     console.log("Executing delayed fallback redraw for GameScene");
                    this.redraw(this.scale.gameSize); 
                }, [], this);
             } else {
                 console.error("FATAL: Failed to generate even default loop!");
             }
        }
        
        this.input.keyboard.on('keydown-SPACE', this.togglePause, this);

        console.log("GameScene create end");
    }
    
    togglePause() {
        const newState = !this.registry.get('isPaused');
        this.registry.set('isPaused', newState); 
        console.log("Pause Toggled:", newState);
    }

    redraw(gameSize) {
        console.log("GameScene redraw start", gameSize);
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
            this.physics.add.overlap(this.hero, this.enemyTriggers, this.onMeetEnemy, null, this);
             this.hero.setDepth(1); 
            
        } else if (this.hero && this.pathCoordsWithOffset.length > 0) { 
             console.log("GameScene repositioning hero");
            const currentPos = this.pathCoordsWithOffset[this.pathIndex];
             if (!currentPos) {
                 console.error("Cannot reposition hero, current position is invalid!");
                 return;
             }
            this.hero.setPosition(currentPos.x, currentPos.y);
             this.hero.setDepth(1); 
            if (this.hero.body) {
                this.hero.body.reset(currentPos.x, currentPos.y); 
            } else if (!this.hero.body && this.hero.active) { // [수정] G.O. 후가 아닌데 body가 없는 경우
                 console.log("Re-enabling physics body for hero");
                this.physics.world.enable(this.hero);
                if(this.hero.body) this.hero.body.reset(currentPos.x, currentPos.y);
            }
        }
        this.isInitialDrawComplete = true; 
        console.log("GameScene redraw end");
    }

    calculateMapOffsets(gameWidth, gameHeight) {
         if (!this.pathCoords || this.pathCoords.length === 0) {
             this.MAP_OFFSET_X = (gameWidth - this.RIGHT_UI_WIDTH) / 2;
             this.MAP_OFFSET_Y = this.TOP_UI_HEIGHT + (gameHeight - this.TOP_UI_HEIGHT) / 2;
             console.warn("calculateMapOffsets using default center due to empty pathCoords.");
             return;
         }
        
         let sumX = 0, sumY = 0;
         let validCoords = 0;
         this.pathCoords.forEach(coord => {
             if (coord && typeof coord.x === 'number' && typeof coord.y === 'number') {
                sumX += coord.x;
                sumY += coord.y;
                validCoords++;
             }
         });

         if (validCoords === 0) { 
             this.MAP_OFFSET_X = (gameWidth - this.RIGHT_UI_WIDTH) / 2;
             this.MAP_OFFSET_Y = this.TOP_UI_HEIGHT + (gameHeight - this.TOP_UI_HEIGHT) / 2;
             console.warn("calculateMapOffsets using default center due to invalid pathCoords content.");
             return;
         }

         const avgGridX = sumX / validCoords;
         const avgGridY = sumY / validCoords;

        const gameplayAreaWidth = gameWidth - this.RIGHT_UI_WIDTH;
        const gameplayAreaHeight = gameHeight - this.TOP_UI_HEIGHT;
        const gameplayCenterX = gameplayAreaWidth / 2;
        const gameplayCenterY = this.TOP_UI_HEIGHT + (gameplayAreaHeight / 2);

        // [수정] 타일 좌상단 기준이 아닌 중앙점 기준으로 오프셋 계산
        const avgPixelX_noOffset = avgGridX * this.TILE_SIZE + this.TILE_SIZE / 2;
        const avgPixelY_noOffset = avgGridY * this.TILE_SIZE + this.TILE_SIZE / 2;

        this.MAP_OFFSET_X = gameplayCenterX - avgPixelX_noOffset;
        this.MAP_OFFSET_Y = gameplayCenterY - avgPixelY_noOffset;

         console.log(`Calculated Offsets: X=${this.MAP_OFFSET_X.toFixed(1)}, Y=${this.MAP_OFFSET_Y.toFixed(1)}`);
    }

    update(time, delta) {
        if (this.registry.get('isPaused')) {
             if (this.hero && this.hero.body) { this.hero.body.setVelocity(0, 0); }
            return;
        }
        if (!this.isInitialDrawComplete || !this.hero || !this.hero.active) return;
        this.moveHero();
    }

    // [수정] ★★★ 단일 경로 루프 생성 (Strict Push/Pull) v8.2 ★★★
    generateRandomLoop() {
        this.grid = Array(this.GRID_HEIGHT).fill(0).map(() => Array(this.GRID_WIDTH).fill(TILE_TYPE_EMPTY));
        this.pathCoords = []; // 최종 경로 저장
        this.specialTileCoords = { [TILE_TYPE_ENEMY2]: [], [TILE_TYPE_ENEMY3]: [], [TILE_TYPE_ENEMY5]: [] };
        
        const minLoopSize = 5;
        const maxLoopSize = 7;
        const baseWidth = Phaser.Math.Between(minLoopSize, maxLoopSize);
        const baseHeight = Phaser.Math.Between(minLoopSize, maxLoopSize);
        const startX = Math.floor(this.GRID_WIDTH / 2 - baseWidth / 2);
        const startY = Math.floor(this.GRID_HEIGHT / 2 - baseHeight / 2);

        // 1. 기본 사각 루프 grid에 그리기
        for (let x = startX; x <= startX + baseWidth; x++) this.setGrid(x, startY, TILE_TYPE_PATH);
        for (let y = startY + 1; y <= startY + baseHeight; y++) this.setGrid(startX + baseWidth, y, TILE_TYPE_PATH);
        for (let x = startX + baseWidth - 1; x >= startX; x--) this.setGrid(x, startY + baseHeight, TILE_TYPE_PATH);
        for (let y = startY + baseHeight - 1; y > startY; y--) this.setGrid(startX, y, TILE_TYPE_PATH); 
        this.setGrid(startX, startY, TILE_TYPE_START); // [신규] 출발점 표시

        let currentLength = 2 * (baseWidth + baseHeight);
        const targetDetours = Phaser.Math.Between(3, 4);
        let detoursAdded = 0;
        let detoursPerSide = { top: 0, right: 0, bottom: 0, left: 0 };
        
        const maxDeformation = 2;
        let attempts = 30; // 최대 시도 횟수
        
        // 2. 경로 변형 시도
        while (detoursAdded < targetDetours && attempts > 0) {
            attempts--;
            
            // 2.1. 변형할 변 랜덤 선택
            const side = Phaser.Math.RND.pick(['top', 'right', 'bottom', 'left']);
            if (detoursPerSide[side] >= 2) continue; // 변 당 최대 2개

            // 2.2. 해당 변의 후보 타일 찾기 (코너 제외)
            let candidates = [];
            if (side === 'top') {
                for (let x = startX + 1; x < startX + baseWidth; x++) candidates.push({ x, y: startY });
            } else if (side === 'right') {
                for (let y = startY + 1; y < startY + baseHeight; y++) candidates.push({ x: startX + baseWidth, y });
            } else if (side === 'bottom') {
                for (let x = startX + 1; x < startX + baseWidth; x++) candidates.push({ x, y: startY + baseHeight });
            } else { // left
                for (let y = startY + 1; y < startY + baseHeight; y++) candidates.push({ x: startX, y });
            }
            if (candidates.length === 0) continue;
            
            const pivot = Phaser.Math.RND.pick(candidates);
            
            // 2.3. 변형 방향 및 크기 결정
            let dx = 0, dy = 0; // "ㄷ"자 방향 (경로에 수직)
            let segmentDirX = 0, segmentDirY = 0; // 경로 진행 방향
            if (side === 'top') { dy = -1; segmentDirX = 1; } // 위로
            else if (side === 'bottom') { dy = 1; segmentDirX = -1; } // 아래로
            else if (side === 'right') { dx = 1; segmentDirY = 1; } // 오른쪽으로
            else { dx = -1; segmentDirY = -1; } // 왼쪽으로
            
            // 50% 확률로 방향 뒤집기 (안쪽/바깥쪽)
            if (Math.random() < 0.5) { dx *= -1; dy *= -1; }

            const deformAmount = Phaser.Math.Between(1, maxDeformation);
            let detourPath = []; // A, B, C 저장
            let p1 = { x: pivot.x - segmentDirX, y: pivot.y - segmentDirY }; // M의 이전 점
            let p2 = { x: pivot.x + segmentDirX, y: pivot.y + segmentDirY }; // M의 다음 점
            let A = { x: pivot.x + dx, y: pivot.y + dy };
            let B = { x: A.x + segmentDirX, y: A.y + segmentDirY };
            let C = { x: B.x - dx, y: B.y - dy }; // = p2

            // 2.4. 유효성 검사
            const isValid = (x, y) => { return x > 0 && x < this.GRID_WIDTH - 1 && y > 0 && y < this.GRID_HEIGHT - 1; };
            const countNeighbors = (x, y) => {
                 let count = 0;
                 if (this.grid[y+1]?.[x] >= TILE_TYPE_PATH) count++;
                 if (this.grid[y-1]?.[x] >= TILE_TYPE_PATH) count++;
                 if (this.grid[y]?.[x+1] >= TILE_TYPE_PATH) count++;
                 if (this.grid[y]?.[x-1] >= TILE_TYPE_PATH) count++;
                 return count;
            };

            let possible = true;
            if (!isValid(A.x, A.y) || this.grid[A.y][A.x] !== TILE_TYPE_EMPTY || countNeighbors(A.x, A.y) > 0) possible = false;
            if (possible && (!isValid(B.x, B.y) || this.grid[B.y][B.x] !== TILE_TYPE_EMPTY || countNeighbors(B.x, B.y) > 0)) possible = false;
            
            if (possible) {
                 // 임시로 grid 변경해서 p1, p2의 이웃 수 검사
                 this.setGrid(pivot.x, pivot.y, TILE_TYPE_EMPTY); // M 제거
                 this.setGrid(A.x, A.y, TILE_TYPE_PATH);
                 this.setGrid(B.x, B.y, TILE_TYPE_PATH);
                 
                 if (countNeighbors(p1.x, p1.y) > 2 || countNeighbors(p2.x, p2.y) > 2) {
                     possible = false;
                 }
                 
                 if (!possible) { // 원상 복구
                      this.setGrid(pivot.x, pivot.y, TILE_TYPE_PATH); 
                      this.setGrid(A.x, A.y, TILE_TYPE_EMPTY);
                      this.setGrid(B.x, B.y, TILE_TYPE_EMPTY);
                 } else {
                     // 성공! Detour 확정
                      console.log("Detour added");
                      detoursAdded++;
                      detoursPerSide[side]++;
                      currentLength += 2; // 타일 2개 추가 (A, B)
                 }
            }
        } // end of while loop

        // 3. 최종 경로 `pathCoords` 생성 (grid 따라가기)
        this.pathCoords = [];
        let current = { x: startX, y: startY };
        let cameFrom = null; 

         const startNeighbors = this.getPathNeighbors(startX, startY);
         if (startNeighbors.length === 2) {
             // grid[startY][startX-1]이 경로인지 확인하여 cameFrom을 왼쪽 또는 위쪽으로 설정
             if (this.grid[startY]?.[startX-1] >= TILE_TYPE_PATH) cameFrom = { x: startX - 1, y: startY };
             else if (this.grid[startY-1]?.[startX] >= TILE_TYPE_PATH) cameFrom = { x: startX, y: startY - 1};
             else cameFrom = startNeighbors[0]; // 둘 중 하나
         } else {
              console.error("Loop start point is invalid, neighbors:", startNeighbors.length);
              this.generateDefaultLoop(); 
              this.assignSpecialTiles();
              return; 
         }

        do {
            this.pathCoords.push({ ...current });
            const neighbors = this.getPathNeighbors(current.x, current.y);
            let next = null;

            if (neighbors.length !== 2) {
                if ((current.x === startX && current.y === startY) && this.pathCoords.length > 1) {
                     break; 
                } else {
                     console.error(`Path generation error: Invalid neighbor count (${neighbors.length}) at`, current);
                      this.generateDefaultLoop(); 
                      this.assignSpecialTiles();
                      return; 
                }
            } else {
                if (cameFrom && neighbors[0].x === cameFrom.x && neighbors[0].y === cameFrom.y) {
                    next = neighbors[1];
                } else {
                    next = neighbors[0];
                }
            }
            cameFrom = { ...current };
            current = { ...next };
        } while ((current.x !== startX || current.y !== startY) && this.pathCoords.length <= (this.GRID_WIDTH * this.GRID_HEIGHT));
        
        if (this.pathCoords.length < 10 || this.pathCoords.length > (this.GRID_WIDTH * this.GRID_HEIGHT)) {
             console.warn("Final loop trace failed or invalid length, creating default loop.");
             this.generateDefaultLoop();
        }
        
        // --- 특수 타일 지정 ---
        this.assignSpecialTiles(); 

        console.log("Final loop length:", this.pathCoords.length);
        console.log("Final Special Tiles:", this.specialTileCoords);
    }
    
    // [수정] setGrid, getPathNeighbors, generateDefaultLoop, assignSpecialTiles (v8.1 코드 사용)
    setGrid(x, y, value) {
         if (y >= 0 && y < this.GRID_HEIGHT && x >= 0 && x < this.GRID_WIDTH) {
             if (!this.grid[y]) this.grid[y] = [];
             this.grid[y][x] = value;
             return true;
         }
         return false;
    }
    getPathNeighbors(x, y) {
        const neighbors = []; const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]]; 
        for (const [dx, dy] of dirs) { const nx = x + dx; const ny = y + dy; if (this.grid[ny]?.[nx] >= TILE_TYPE_PATH) { neighbors.push({ x: nx, y: ny }); } }
        return neighbors;
    }
    generateDefaultLoop() {
        console.log("Generating default loop...");
        this.grid = Array(this.GRID_HEIGHT).fill(0).map(() => Array(this.GRID_WIDTH).fill(TILE_TYPE_EMPTY)); 
        this.pathCoords = [];
        const loopSize = 5; const startX = 5, startY = 5;
        for (let x = startX; x <= startX + loopSize; x++) { this.setGrid(x, startY, TILE_TYPE_PATH); this.pathCoords.push({ x: x, y: startY }); }
        for (let y = startY + 1; y <= startY + loopSize; y++) { this.setGrid(startX + loopSize, y, TILE_TYPE_PATH); this.pathCoords.push({ x: startX + loopSize, y: y }); }
        for (let x = startX + loopSize - 1; x >= startX; x--) { this.setGrid(x, startY + loopSize, TILE_TYPE_PATH); this.pathCoords.push({ x: x, y: startY + loopSize }); }
        for (let y = startY + loopSize - 1; y > startY; y--) { this.setGrid(startX, y, TILE_TYPE_PATH); this.pathCoords.push({ x: startX, y: y }); }
         this.setGrid(startX, startY, TILE_TYPE_START); // 출발점 표시
    }
     assignSpecialTiles() {
         if (this.pathCoords.length <= 1) { console.warn("Cannot assign special tiles: Path is too short or empty."); return; }
         const pathIndices = Array.from(Array(this.pathCoords.length).keys()); 
         pathIndices.shift(); // 시작점(0) 제외
         Phaser.Utils.Array.Shuffle(pathIndices); 
         this.specialTileCoords = { [TILE_TYPE_ENEMY2]: [], [TILE_TYPE_ENEMY3]: [], [TILE_TYPE_ENEMY5]: [] }; 
         const placeTile = (type, count) => {
             let placed = 0;
             while(placed < count && pathIndices.length > 0) {
                 const index = pathIndices.pop();
                 if (index === undefined) break;
                 const coord = this.pathCoords[index];
                 if (coord && this.grid[coord.y]?.[coord.x] === TILE_TYPE_PATH) { this.grid[coord.y][coord.x] = type; this.specialTileCoords[type].push(coord); placed++; }
             }
             if (placed < count) console.warn(`Could only place ${placed}/${count} tiles of type ${type}.`);
         };
         placeTile(TILE_TYPE_ENEMY2, 2);
         placeTile(TILE_TYPE_ENEMY3, 3);
         placeTile(TILE_TYPE_ENEMY5, 1);
     }
    
    updatePathCoordsWithOffset() {
         if (!this.pathCoords || this.pathCoords.length === 0) {
             this.pathCoordsWithOffset = [];
             console.warn("updatePathCoordsWithOffset skipped: pathCoords is empty.");
             return;
         }
        this.pathCoordsWithOffset = this.pathCoords.map(coord => {
            if (!coord || typeof coord.x !== 'number' || typeof coord.y !== 'number') {
                 console.warn("Invalid coordinate in pathCoords during offset update:", coord);
                 return null; 
            }
            return new Phaser.Math.Vector2(
                coord.x * this.TILE_SIZE + this.TILE_SIZE / 2 + this.MAP_OFFSET_X,
                coord.y * this.TILE_SIZE + this.TILE_SIZE / 2 + this.MAP_OFFSET_Y
            );
        }).filter(v => v !== null); 
         
         if (this.pathCoordsWithOffset.length > 0 && this.pathCoordsWithOffset.length === this.pathCoords.length) { // [수정] 마지막 점(시작점) 추가
             this.pathCoordsWithOffset.push(this.pathCoordsWithOffset[0]);
         } else if (this.pathCoordsWithOffset.length === 0 && this.pathCoords.length > 0) {
             console.error("FATAL: pathCoordsWithOffset became empty after filtering invalid coordinates!");
         }
    }

    drawTiles(gameWidth, gameHeight) {
        const bgGraphics = this.add.graphics();
        this.mapGraphics.add(bgGraphics);
        
        bgGraphics.fillStyle(0x000000).fillRect(0, 0, gameWidth, gameHeight); 
        
        this.pathCoords.forEach(coord => {
             if (!coord || typeof coord.x !== 'number' || typeof coord.y !== 'number') return;
            const tileX = coord.x * this.TILE_SIZE + this.MAP_OFFSET_X;
            const tileY = coord.y * this.TILE_SIZE + this.MAP_OFFSET_Y;
            
             let tileType = TILE_TYPE_PATH; 
             if (coord.y >= 0 && coord.y < this.grid.length && coord.x >= 0 && coord.x < (this.grid[coord.y]?.length || 0) && this.grid[coord.y][coord.x] !== undefined) {
                 tileType = this.grid[coord.y][coord.x];
                 if (tileType === TILE_TYPE_EMPTY) tileType = TILE_TYPE_PATH;
             } else {
                 if (!this.grid[coord.y]) this.grid[coord.y] = [];
                 this.grid[coord.y][coord.x] = TILE_TYPE_PATH;
             }

            let fillColor;
            switch(tileType) {
                case TILE_TYPE_START: fillColor = 0x90ee90; break; // [신규] 연두색
                case TILE_TYPE_ENEMY2: fillColor = 0x0000ff; break;
                case TILE_TYPE_ENEMY3: fillColor = 0x00ff00; break;
                case TILE_TYPE_ENEMY5: fillColor = 0x800080; break;
                case TILE_TYPE_PATH: 
                default: fillColor = 0x555555; break;
            }

            const tileGraphics = this.add.graphics();
            this.mapGraphics.add(tileGraphics); 
            tileGraphics.fillStyle(fillColor).fillRect(tileX, tileY, this.TILE_SIZE, this.TILE_SIZE).lineStyle(1, 0x8B4513).strokeRect(tileX, tileY, this.TILE_SIZE, this.TILE_SIZE);
        });
    }

    moveHero() {
        if (!this.hero || !this.hero.body || !this.pathCoordsWithOffset || this.pathCoordsWithOffset.length <= 1) return; // 경로에 최소 2개 점(시작,끝) 필요

        if(this.pathIndex < 0 || this.pathIndex >= this.pathCoordsWithOffset.length) {
            console.error("Invalid pathIndex:", this.pathIndex, "Resetting to 0.");
            this.pathIndex = 0;
             if (this.pathCoordsWithOffset.length === 0) return;
        }

        const targetPos = this.pathCoordsWithOffset[this.pathIndex];
        if (!targetPos || typeof targetPos.x !== 'number' || typeof targetPos.y !== 'number') {
            console.error("Invalid target position:", targetPos, "at index:", this.pathIndex);
             this.pathIndex = (this.pathIndex + 1) % this.pathCoordsWithOffset.length; 
            return;
        }
        
        const distance = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, targetPos.x, targetPos.y);

        if (distance < 4) {
             // [수정] 마지막 인덱스(시작점과 동일)에 도달했는지 확인
             if (this.pathIndex === this.pathCoordsWithOffset.length - 1) {
                 this.pathIndex = 0; // 0번 인덱스로 루프
                 this.spawnEnemy5(); // 출발점 밟음
             } else {
                this.pathIndex++;
             }
            
            this.tilesMovedTotal++;
            this.tilesMovedSinceLastDay++; 

            if (this.tilesMovedSinceLastDay >= 12) {
                this.advanceDay();
            }
        } else {
            this.physics.moveTo(this.hero, targetPos.x, targetPos.y, 150); 
        }
    }
    
    advanceDay() {
        if (this.registry.get('isPaused')) return; 
        this.day++; this.tilesMovedSinceLastDay = 0; console.log(`Day ${this.day} started`);
        const uiScene = this.scene.get('UIScene'); if(uiScene && uiScene.events && this.scene.isActive('UIScene')) { uiScene.events.emit('updateDay', this.day); }
        if (this.hero) { this.hero.hp = this.hero.maxHp; if(uiScene && uiScene.events && this.scene.isActive('UIScene')) { uiScene.events.emit('updateHeroHP', this.hero.hp, this.hero.maxHp); } } 
        else if (this.heroData){ this.heroData.hp = this.heroData.maxHp; }
        this.spawnEnemy1(); if (this.day % 2 === 0) this.spawnEnemy2(); if (this.day % 3 === 0) this.spawnEnemy3();
    }

    spawnEnemy1() { 
        if (Math.random() < 0.10) { if (this.pathCoordsWithOffset.length < 2) return; const spawnIndex = Phaser.Math.Between(1, this.pathCoordsWithOffset.length - 2); const spawnPos = this.pathCoordsWithOffset[spawnIndex]; if(spawnPos) this.spawnEnemyTriggerAt('goblin', spawnPos.x, spawnPos.y); }
    }
    spawnEnemy2() { 
        this.specialTileCoords[TILE_TYPE_ENEMY2].forEach(coord => { const spawnPos = this.getPixelCoord(coord); if(spawnPos) this.spawnEnemyTriggerAt('skeleton', spawnPos.x, spawnPos.y); });
    }
    spawnEnemy3() { 
        this.specialTileCoords[TILE_TYPE_ENEMY3].forEach(coord => { const spawnPos = this.getPixelCoord(coord); if(spawnPos) this.spawnEnemyTriggerAt('orc', spawnPos.x, spawnPos.y); });
    }
    spawnEnemy5() { 
         if (this.specialTileCoords[TILE_TYPE_ENEMY5].length > 0) { const coord = this.specialTileCoords[TILE_TYPE_ENEMY5][0]; const spawnPos = this.getPixelCoord(coord); if (spawnPos) { for(let i=0; i<3; i++) { const offsetX = Phaser.Math.Between(-this.TILE_SIZE * 0.2, this.TILE_SIZE * 0.2); const offsetY = Phaser.Math.Between(-this.TILE_SIZE * 0.2, this.TILE_SIZE * 0.2); this.spawnEnemyTriggerAt('slime', spawnPos.x + offsetX, spawnPos.y + offsetY); } } }
    }

    spawnEnemyTriggerAt(enemyKey, x, y) {
        if (!EnemyData[enemyKey]) return;
        // console.log(`Spawning ${enemyKey} at (${x.toFixed(0)}, ${y.toFixed(0)})`);
        const enemy = this.enemyTriggers.create(x, y, 'pixel').setDisplaySize(this.TILE_SIZE * 0.4, this.TILE_SIZE * 0.4).setTint(EnemyData[enemyKey].color);
        enemy.enemyKey = enemyKey; enemy.setDepth(1); 
    }
    
    getPixelCoord(gridCoord) {
        if (!gridCoord || typeof gridCoord.x !== 'number' || typeof gridCoord.y !== 'number') return null;
        return new Phaser.Math.Vector2( gridCoord.x * this.TILE_SIZE + this.TILE_SIZE / 2 + this.MAP_OFFSET_X, gridCoord.y * this.TILE_SIZE + this.TILE_SIZE / 2 + this.MAP_OFFSET_Y );
    }

    onMeetEnemy(hero, enemyTrigger) {
        if (!this.hero || !this.hero.body || this.registry.get('isPaused') || this.startingCombat) return; 
        
        this.startingCombat = true; // [신규] 전투 시작 플래그
        this.hero.body.stop();
        
        let combatants = []; // [신규] 다중 적 배열
        let overlappingEnemies = [];
        
        // 1. 현재 겹친 모든 적 찾기
        this.enemyTriggers.getChildren().forEach(enemy => {
             if (enemy.active && Phaser.Math.Distance.Between(this.hero.x, this.hero.y, enemy.x, enemy.y) < this.TILE_SIZE * 0.6) {
                 overlappingEnemies.push(enemy);
             }
        });
        
        console.log(`Multiple enemies found: ${overlappingEnemies.length}`);
        
        // 2. 전투원 배열 생성 및 적 제거
        overlappingEnemies.forEach(enemy => {
             if (EnemyData[enemy.enemyKey]) {
                combatants.push(EnemyData[enemy.enemyKey]);
             }
             enemy.destroy();
        });
        
        if (combatants.length === 0) { // 만약의 경우
             this.startingCombat = false;
             return;
        }

        const combatData = {
            enemies: combatants, // [신규] 적 배열 전달
            heroHp: this.hero.hp,
            heroMaxHp: this.hero.maxHp,
            heroAttackTime: this.heroData.attackTime 
        };
        
        this.scene.pause(); 
        this.scene.launch('CombatScene', combatData);
        
        // 전투 씬이 끝날 때 플래그 해제 (onCombatComplete에서)
    }
    
    onCombatComplete(data) {
        this.startingCombat = false; // [신규] 전투 종료 플래그 해제

        if (!this.hero) return; 

        this.hero.hp = data.heroHp;
        const uiScene = this.scene.get('UIScene');
         if(uiScene && this.scene.isActive('UIScene')) {
            uiScene.events.emit('updateHeroHP', this.hero.hp, this.hero.maxHp);
         }
        
        if (data.loot) {
            if(uiScene && this.scene.isActive('UIScene')) {
                 uiScene.events.emit('addItem', data.loot);
            }
        }
        
        if (this.hero.hp <= 0) {
            this.hero.destroy(); 
            this.hero = null; 
             const gameOverText = this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2, 'GAME OVER\nPress "R" to Restart', { fontSize: '40px', fill: '#ff0000', align: 'center' }).setOrigin(0.5);
             gameOverText.setDepth(10); 
             
             // [신규] ★★★ 재시작 리스너 등록 ★★★
             this.input.keyboard.on('keydown-R', this.restartGame, this);
        } else {
            this.scene.resume();
            console.log("GameScene calling redraw after combat");
            this.time.delayedCall(0, () => { this.redraw(this.scale.gameSize); }, [], this);
        }
    }
    
    // [신규] ★★★ 게임 재시작 함수 ★★★
    restartGame() {
        console.log("Restarting game...");
        this.input.keyboard.off('keydown-R', this.restartGame, this); // 리스너 제거
        this.registry.set('isPaused', false); // 일시정지 해제
        this.scene.start('GameScene'); // GameScene부터 다시 시작
    }
} // End of GameScene class

// --- 2. 전투 씬 --- (다중 적 전투 수정)
class CombatScene extends Phaser.Scene {
    constructor() {
        super('CombatScene');
        this.combatRunning = false;
        
        this.heroAttackGauge = 0;
        this.heroAttackSpeed = 0;
        
        // [수정] 적 관련 변수들을 배열로
        this.enemiesData = [];
        this.enemyIllusts = [];
        this.enemyHps = [];
        this.enemyMaxHps = [];
        this.enemyAttackGauges = [];
        this.enemyAttackSpeeds = [];
        this.enemyHpBarBGs = [];
        this.enemyHpBarFills = [];
        this.enemyAttackGaugeBGs = [];
        this.enemyAttackGaugeFills = [];
    }
    
    init(data) {
        this.enemiesData = data.enemies; // [수정] 적 배열 받기
        this.heroHp = data.heroHp; 
        this.heroMaxHp = data.heroMaxHp;
        
        this.heroAttackSpeed = 100 / (data.heroAttackTime || 0.8); 
        
        // [수정] 적 속성 배열 초기화
        this.enemiesData.forEach(enemyData => {
             this.enemyHps.push(enemyData.hp);
             this.enemyMaxHps.push(enemyData.hp);
             this.enemyAttackSpeeds.push(100 / (enemyData.attackTime || 1.0));
             this.enemyAttackGauges.push(0);
        });
    }
    
    create() {
        const gameWidth = this.cameras.main.width;
        const gameHeight = this.cameras.main.height;
        
        const combatPanelWidth = gameWidth * 0.5;
        const combatPanelHeight = gameHeight * 0.5;
        const combatPanelX = (gameWidth - combatPanelWidth) / 2;
        const combatPanelY = (gameHeight - combatPanelHeight) / 2;
        
        this.add.graphics().fillStyle(0x000000, 0.7).fillRect(0, 0, gameWidth, gameHeight); 
        this.add.graphics().fillStyle(0x333333).fillRect(combatPanelX, combatPanelY, combatPanelWidth, combatPanelHeight).lineStyle(2, 0x8B4513).strokeRect(combatPanelX, combatPanelY, combatPanelWidth, combatPanelHeight);
        
        // --- 영웅 생성 (동일) ---
        this.heroIllust = this.add.image(combatPanelX + combatPanelWidth * 0.3, combatPanelY + combatPanelHeight * 0.65, 'pixel').setDisplaySize(120, 160).setTint(0x00ffff);
        const hpBarWidth = 100; const hpBarHeight = 10;
        const heroHpBarX = this.heroIllust.x - hpBarWidth / 2; 
        const heroHpBarY = this.heroIllust.y - 100; 
        this.heroHpBarBG = this.add.rectangle(heroHpBarX, heroHpBarY, hpBarWidth, hpBarHeight, 0xff0000).setOrigin(0);
        this.heroHpBarFill = this.add.rectangle(heroHpBarX, heroHpBarY, hpBarWidth, hpBarHeight, 0x00ff00).setOrigin(0);
        const attackGaugeWidth = hpBarWidth; const attackGaugeHeight = hpBarHeight * 0.25; 
        const heroAttackGaugeY = heroHpBarY + hpBarHeight + 2; 
        this.heroAttackGaugeBG = this.add.rectangle(heroHpBarX, heroAttackGaugeY, attackGaugeWidth, attackGaugeHeight, 0x555555).setOrigin(0); 
        this.heroAttackGaugeFill = this.add.rectangle(heroHpBarX, heroAttackGaugeY, 0, attackGaugeHeight, 0xffff00).setOrigin(0); 
        this.heroAttackGauge = 0; // 게이지 초기화
        
        // --- [수정] 다중 적 생성 ---
        const numEnemies = this.enemiesData.length;
        const enemySpacing = combatPanelWidth * 0.7 / (numEnemies + 1); // 적들 사이 간격

        this.enemiesData.forEach((enemyData, index) => {
            const enemyX = (combatPanelX + combatPanelWidth * 0.3) + (enemySpacing * (index + 1));
            const enemyY = combatPanelY + combatPanelHeight * 0.65;
            
            const enemyIllust = this.add.image(enemyX, enemyY, 'pixel').setDisplaySize(100, 140).setTint(enemyData.color); // 크기 약간 줄임
            
            const eHpBarX = enemyIllust.x - hpBarWidth / 2;
            const eHpBarY = enemyIllust.y - 90;
            const eAttackGaugeY = eHpBarY + hpBarHeight + 2;

            this.enemyIllusts.push(enemyIllust);
            this.enemyHpBarBGs.push(this.add.rectangle(eHpBarX, eHpBarY, hpBarWidth, hpBarHeight, 0xff0000).setOrigin(0));
            this.enemyHpBarFills.push(this.add.rectangle(eHpBarX, eHpBarY, hpBarWidth, hpBarHeight, 0x00ff00).setOrigin(0));
            this.enemyAttackGaugeBGs.push(this.add.rectangle(eHpBarX, eAttackGaugeY, attackGaugeWidth, attackGaugeHeight, 0x555555).setOrigin(0));
            this.enemyAttackGaugeFills.push(this.add.rectangle(eHpBarX, eAttackGaugeY, 0, attackGaugeHeight, 0xffff00).setOrigin(0));
        });

        this.updateHpBars(); 
        this.updateAttackGauges(); 
        
        this.combatRunning = true;
        this.input.keyboard.on('keydown-SPACE', this.toggleGamePause, this);
    }
    
    toggleGamePause() {
        const gameScene = this.scene.get('GameScene');
        if (gameScene) {
             gameScene.togglePause(); 
        }
    }

    update(time, delta) {
        if (!this.combatRunning) return;

        const deltaSeconds = delta / 1000; 

        // 영웅 게이지
        this.heroAttackGauge += this.heroAttackSpeed * deltaSeconds;
        if (this.heroAttackGauge >= 100) {
            this.heroAttackGauge = 0; 
            this.playerAttack();      
             if (!this.combatRunning) return; 
        }

        // [수정] 다중 적 게이지
        this.enemiesData.forEach((enemyData, index) => {
             if (this.enemyHps[index] > 0) { // 살아있는 적만
                this.enemyAttackGauges[index] += this.enemyAttackSpeeds[index] * deltaSeconds;
                if (this.enemyAttackGauges[index] >= 100) {
                    this.enemyAttackGauges[index] = 0; 
                     this.enemyAttack(index); // 해당 인덱스의 적이 공격
                      if (!this.combatRunning) return; 
                }
             }
        });
        
        this.updateAttackGauges();
    }
    
    updateHpBars() {
        // 영웅 HP
        const barWidth = 100;
        const heroPercent = Math.max(0, this.heroHp / this.heroMaxHp);
        this.heroHpBarFill.width = barWidth * heroPercent; 
        
        // [수정] 다중 적 HP
        this.enemiesData.forEach((enemyData, index) => {
             const enemyPercent = Math.max(0, this.enemyHps[index] / this.enemyMaxHps[index]);
             if (this.enemyHpBarFills[index]) {
                this.enemyHpBarFills[index].width = barWidth * enemyPercent;
             }
        });
        
        const uiScene = this.scene.get('UIScene');
        if (uiScene && this.scene.isActive('UIScene')) { 
             uiScene.events.emit('updateHeroHP', this.heroHp, this.heroMaxHp);
        }
    }
    
    updateAttackGauges() {
        const gaugeWidth = 100;
        const heroGaugePercent = Math.min(1, this.heroAttackGauge / 100); 
        this.heroAttackGaugeFill.width = gaugeWidth * heroGaugePercent;

        // [수정] 다중 적 게이지
         this.enemiesData.forEach((enemyData, index) => {
             const enemyGaugePercent = Math.min(1, this.enemyAttackGauges[index] / 100);
             if (this.enemyAttackGaugeFills[index]) {
                this.enemyAttackGaugeFills[index].width = gaugeWidth * enemyGaugePercent;
             }
         });
    }
    
    // [수정] 플레이어 공격 (랜덤 타겟)
    playerAttack() {
        if (!this.combatRunning || !this.heroIllust.active) return;
        
        // 살아있는 적 인덱스 찾기
        let livingTargets = [];
        this.enemyHps.forEach((hp, index) => {
            if (hp > 0) livingTargets.push(index);
        });
        
        if (livingTargets.length === 0) return; // 모든 적이 죽었으면 공격 안함
        
        const targetIndex = Phaser.Math.RND.pick(livingTargets);
        const targetIllust = this.enemyIllusts[targetIndex];

        this.add.tween({ 
            targets: this.heroIllust, 
            x: this.heroIllust.x + 20, 
            duration: 100, ease: 'Power1', yoyo: true,
            onComplete: () => {
                this.enemyHps[targetIndex] -= 10; 
                this.updateHpBars(); 
                if (this.enemyHps[targetIndex] <= 0) { 
                    this.defeatEnemy(targetIndex); 
                } 
            }
        });
    }
    
    // [수정] 적 공격 (인덱스 기반)
    enemyAttack(index) {
        if (!this.combatRunning || !this.heroIllust.active || !this.enemyIllusts[index] || !this.enemyIllusts[index].active) return;
        
        const enemyIllust = this.enemyIllusts[index];
        const enemyAtk = this.enemiesData[index].atk;

        this.add.tween({ 
            targets: enemyIllust, 
            x: enemyIllust.x - 20, 
            duration: 100, ease: 'Power1', yoyo: true,
            onComplete: () => {
                this.heroHp -= enemyAtk; 
                this.updateHpBars(); 
                if (this.heroHp <= 0) { this.defeatHero(); }
            }
        });
    }

    // [수정] 적 패배 (인덱스 기반)
    defeatEnemy(index) {
        if (!this.enemyIllusts[index]) return; // 이미 처리된 경우
        
        const enemyIllust = this.enemyIllusts[index];
        this.combatRunning = false; // 잠시 전투 멈춤 (애니메이션 중)
        
        this.add.tween({ 
            targets: enemyIllust, 
            alpha: 0, 
            duration: 500,
            onComplete: () => {
                enemyIllust.active = false;
                if(this.enemyHpBarBGs[index]) this.enemyHpBarBGs[index].destroy();
                if(this.enemyHpBarFills[index]) this.enemyHpBarFills[index].destroy();
                if(this.enemyAttackGaugeBGs[index]) this.enemyAttackGaugeBGs[index].destroy();
                if(this.enemyAttackGaugeFills[index]) this.enemyAttackGaugeFills[index].destroy();
                
                // 아이템 드랍 (첫 번째 죽은 적만 드랍, 또는 합산 등... 여기서는 첫 번째만)
                 let loot = null;
                 if (Math.random() < this.enemiesData[index].dropRate) {
                     loot = Phaser.Math.RND.pick(ALL_ITEM_KEYS);
                 }
                
                // 모든 적이 죽었는지 확인
                const allEnemiesDefeated = this.enemyHps.every(hp => hp <= 0);
                
                if (allEnemiesDefeated) {
                    if (loot) this.dropItemAnimation(loot, enemyIllust.x, enemyIllust.y);
                    else this.endCombat(null);
                } else {
                    this.combatRunning = true; // 전투 재개
                }
            }
        });
    }
    
    dropItemAnimation(itemKey, x, y) { // [수정] 드랍 위치 받기
        const itemData = ItemData[itemKey]; 
        const itemIcon = this.add.rectangle(x, y, 20, 20, itemData.color);
        const inventoryCenterSlotX = this.cameras.main.width - 190 + 50; 
        const inventoryCenterSlotY = 415;
        this.add.tween({ targets: itemIcon, x: inventoryCenterSlotX, y: inventoryCenterSlotY, duration: 700, ease: 'Back.easeIn',
            onComplete: () => { itemIcon.destroy(); this.endCombat(itemKey); }
        });
    }
    
    endCombat(loot) {
        this.combatRunning = false;
        this.input.keyboard.off('keydown-SPACE', this.toggleGamePause, this);
        const gameScene = this.scene.get('GameScene');
        if (gameScene && gameScene.events) { 
            gameScene.events.emit('combatComplete', { loot: loot, heroHp: this.heroHp });
        } else { console.warn("Cannot emit combatComplete: GameScene not found or ready."); }
        this.scene.stop();
    }
    
    defeatHero() {
        this.combatRunning = false;
        this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2, 'YOU DIED', { fontSize: '48px', fill: '#ff0000' }).setOrigin(0.5);
        this.heroIllust.active = false; 
        this.heroHpBarBG.destroy(); this.heroHpBarFill.destroy(); 
        this.heroAttackGaugeBG.destroy(); this.heroAttackGaugeFill.destroy();
        this.time.delayedCall(2000, () => { this.endCombat(null); }, [], this);
    }
} // End of CombatScene class

// --- 3. UI 씬 --- (Registry 이벤트 리스너 수정)
class UIScene extends Phaser.Scene {
    constructor() {
        super('UIScene');
        this.inventorySlots = []; this.equipSlots = {};
        this.inventory = new Array(16).fill(null);
        this.UI_WIDTH = 190; this.UI_PADDING = 10; this.TOP_UI_HEIGHT = 50;
        this.labelStyle = { fontSize: '11px', fill: '#cccccc', align: 'center' };
        this.inventoryLabelStyle = { fontSize: '14px', fill: '#cccccc', align: 'left' };
        this.hpStaTextStyle = { fontSize: '12px', fill: '#ffffff' };
        this.pauseTextStyle = { fontSize: '16px', fill: '#ffffff', align: 'center'}; 
        this.uiElements = null; this.itemIcons = null; this.pauseText = null; 
    }
    
    create() {
        console.log("UIScene create start");
        this.uiElements = this.add.group();
        this.itemIcons = this.add.group();

        this.scale.on('resize', this.redraw, this);
        // [수정] wake 이벤트 불필요 (sleep 안하므로)
        // this.events.on('wake', this.handleWake, this); 

        const gameScene = this.scene.get('GameScene');
        
         this.time.delayedCall(100, () => {
             if (gameScene && gameScene.events) {
                gameScene.events.on('updateDay', (day) => {
                    if (this.dayText) this.dayText.setText(`Day: ${day}`);
                }, this);
                
                // [수정] GameScene/CombatScene에서 오는 HP 이벤트 수신
                this.events.on('updateHeroHP', this.updateHeroHP, this); 
                
                if (gameScene.registry && gameScene.registry.events) {
                    console.log("UIScene attaching registry listener");
                    // [수정] ★★★ Registry의 'changedata-[key]' 이벤트를 수신 ★★★
                    gameScene.registry.events.on('changedata-isPaused', this.updatePauseText, this); 
                    this.updatePauseText(); // 초기 상태 반영
                } else {
                     console.warn("UIScene create: GameScene registry not ready for pause listener after delay.");
                }
             } else {
                 console.warn("UIScene create: GameScene not ready for event listeners after delay.");
             }
         }, [], this);
        
        this.events.on('addItem', this.addItem, this);
        
        console.log("UIScene calling initial redraw");
        this.time.delayedCall(0, () => {
             console.log("Executing delayed initial redraw for UIScene");
            this.redraw(this.scale.gameSize);
        }, [], this);
        console.log("UIScene create end");
    }
    
    // [수정] handleWake 함수 제거
    // handleWake() { ... }
    
    // [수정] ★★★ Registry 값을 직접 읽도록 변경 ★★★
    updatePauseText() {
         const gameScene = this.scene.get('GameScene');
         if(this.pauseText && gameScene && gameScene.registry) { 
            const isPaused = gameScene.registry.get('isPaused');
            this.pauseText.setText(isPaused ? '중지' : '진행');
            console.log("Pause text updated:", this.pauseText.text);
        } else {
            // console.warn("Pause text object or GameScene registry not ready yet in updatePauseText."); 
        }
    }

    redraw(gameSize) {
        // ... (v8.1 redraw와 동일) ...
         console.log("UIScene redraw start", gameSize); const gameWidth = gameSize ? gameSize.width : this.cameras.main.width; const gameHeight = gameSize ? gameSize.height : this.cameras.main.height; if (gameWidth <= 1 || gameHeight <= 1) { console.warn("UIScene redraw skipped due to invalid size:", gameWidth, gameHeight); return; } this.uiElements.clear(true, true); this.inventorySlots = []; this.equipSlots = {}; this.UI_START_X = gameWidth - this.UI_WIDTH; const topBar = this.add.graphics().fillStyle(0x666666).fillRect(0, 0, gameWidth, this.TOP_UI_HEIGHT); this.uiElements.add(topBar); const text1 = this.add.text(10, 15, '시간의 흐름', { fontSize: '10px', fill: '#000000' }); const gameSceneRef = this.scene.get('GameScene'); const currentDay = (gameSceneRef && typeof gameSceneRef.day === 'number') ? gameSceneRef.day : 1; this.dayText = this.add.text(80, 15, `Day: ${currentDay}`, { fontSize: '14px', fill: '#000000' }); const text3 = this.add.text(200, 15, '계획', { fontSize: '10px', fill: '#000000' }); this.pauseText = this.add.text(gameWidth / 2, this.TOP_UI_HEIGHT / 2, '진행', this.pauseTextStyle).setOrigin(0.5); const text5 = this.add.text(this.UI_START_X - 150 > 500 ? this.UI_START_X - 150 : 500, 15, '몇 번째 루프', { fontSize: '10px', fill: '#000000' }); this.uiElements.addMultiple([text1, this.dayText, text3, this.pauseText, text5]); const rightBar = this.add.graphics().fillStyle(0x333333).fillRect(this.UI_START_X, 0, this.UI_WIDTH, gameHeight); this.uiElements.add(rightBar); const RIGHT_UI_START_X = this.UI_START_X + this.UI_PADDING; let currentY = this.TOP_UI_HEIGHT + this.UI_PADDING; this.heroHpText = this.add.text(RIGHT_UI_START_X, currentY, 'HP: 100/100', this.hpStaTextStyle); currentY += 18; this.hpBarWidth = this.UI_WIDTH - (this.UI_PADDING * 2) - 20; this.hpBarHeight = 8; this.heroHpBarBG = this.add.rectangle(RIGHT_UI_START_X, currentY, this.hpBarWidth, this.hpBarHeight, 0xff0000).setOrigin(0); this.heroHpBarFill = this.add.rectangle(RIGHT_UI_START_X, currentY, this.hpBarWidth, this.hpBarHeight, 0x00ff00).setOrigin(0); currentY += 15; const staText = this.add.text(RIGHT_UI_START_X, currentY, 'STA: 100/100', { fontSize: '12px', fill: '#B09253' }); currentY += 30; this.uiElements.addMultiple([this.heroHpText, this.heroHpBarBG, this.heroHpBarFill, staText]); const EQUIP_SLOT_SIZE = 36; const EQUIP_SLOT_GAP_X = 5; const EQUIP_SLOT_GAP_Y = 10; const helmetLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, 'helmet', this.labelStyle); this.equipSlots['helmet'] = this.createSlot(RIGHT_UI_START_X + 10, currentY + 15, 'helmet', EQUIP_SLOT_SIZE); currentY += EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_Y + 10; const armorLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, 'armor', this.labelStyle); this.equipSlots['armor']  = this.createSlot(RIGHT_UI_START_X + 10, currentY + 15, 'armor', EQUIP_SLOT_SIZE); const weaponLabel = this.add.text(RIGHT_UI_START_X + 10 + EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X, currentY, 'weapon', this.labelStyle); this.equipSlots['weapon'] = this.createSlot(RIGHT_UI_START_X + 10 + EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X, currentY + 15, 'weapon', EQUIP_SLOT_SIZE); const shieldLabel = this.add.text(RIGHT_UI_START_X + 10 + (EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X) * 2, currentY, 'shield', this.labelStyle); this.equipSlots['shield'] = this.createSlot(RIGHT_UI_START_X + 10 + (EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X) * 2, currentY + 15, 'shield', EQUIP_SLOT_SIZE); currentY += EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_Y + 10; const glovesLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, 'gloves', this.labelStyle); this.equipSlots['gloves'] = this.createSlot(RIGHT_UI_START_X + 10, currentY + 15, 'gloves', EQUIP_SLOT_SIZE); const beltLabel = this.add.text(RIGHT_UI_START_X + 10 + EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X, currentY, 'belt', this.labelStyle); this.equipSlots['belt']   = this.createSlot(RIGHT_UI_START_X + 10 + EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X, currentY + 15, 'belt', EQUIP_SLOT_SIZE); const bootsLabel = this.add.text(RIGHT_UI_START_X + 10 + (EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X) * 2, currentY, 'boots', this.labelStyle); this.equipSlots['boots']  = this.createSlot(RIGHT_UI_START_X + 10 + (EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X) * 2, currentY + 15, 'boots', EQUIP_SLOT_SIZE); currentY += EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_Y + 10; this.uiElements.addMultiple([helmetLabel, armorLabel, weaponLabel, shieldLabel, glovesLabel, beltLabel, bootsLabel]); const statsLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, '능력치', this.inventoryLabelStyle); currentY += 20; const damageLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, '피해: +X', this.hpStaTextStyle); currentY += 15; const defenseLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, '방어: +Y', this.hpStaTextStyle); currentY += 25; this.uiElements.addMultiple([statsLabel, damageLabel, defenseLabel]); const invLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, 'Inventory', this.inventoryLabelStyle); currentY += 20; this.uiElements.add(invLabel); const INV_SLOT_SIZE = 36; const INV_SLOT_GAP = 5; let slotIndex = 0; for (let y = 0; y < 4; y++) { for (let x = 0; x < 4; x++) { const slotX = RIGHT_UI_START_X + 5 + x * (INV_SLOT_SIZE + INV_SLOT_GAP); const slotY = currentY + y * (INV_SLOT_SIZE + INV_SLOT_GAP); this.inventorySlots.push(this.createSlot(slotX, slotY, slotIndex++, INV_SLOT_SIZE)); } } this.selectedHighlight = this.add.graphics().lineStyle(2, 0xcc99ff); this.selectedHighlight.visible = false; this.errorText = this.add.text(this.UI_START_X + this.UI_WIDTH / 2, gameHeight - 30, '', { fontSize: '10px', fill: '#ff0000' }).setOrigin(0.5); this.uiElements.addMultiple([this.selectedHighlight, this.errorText]); let initialHp = 100, initialMaxHp = 100; if (gameSceneRef && gameSceneRef.heroData) { initialHp = gameSceneRef.heroData.hp; initialMaxHp = gameSceneRef.heroData.maxHp; } if (gameSceneRef && gameSceneRef.hero) { initialHp = gameSceneRef.hero.hp; initialMaxHp = gameSceneRef.hero.maxHp; } this.updateHeroHP(initialHp, initialMaxHp); if (gameSceneRef && gameSceneRef.registry) { this.updatePauseText(); } this.refreshInventory(); console.log("UIScene redraw end");
    }
    
    updateHeroHP(hp, maxHp) {
        if (!this.scene.isActive() || !this.heroHpText || !this.heroHpBarFill) return;
        this.heroHpText.setText(`HP: ${hp.toFixed(0)}/${maxHp}`); 
        const percent = Math.max(0, hp / maxHp);
        if (typeof this.hpBarWidth === 'number') { this.heroHpBarFill.width = this.hpBarWidth * percent; } 
        else { console.warn("hpBarWidth is not defined in updateHeroHP"); }
    }
    
    createSlot(x, y, key, size = 40) {
        const slot = this.add.rectangle(x, y, size, size).setOrigin(0).setFillStyle(0x333333).setStrokeStyle(1, 0x666666); slot.setData('slotKey', key); slot.setInteractive(); slot.on('pointerdown', () => this.onSlotClick(slot)); this.uiElements.add(slot); return slot;
    }
    
    onSlotClick(slot) {
        const slotKey = slot.getData('slotKey'); if (this.selectedItemIndex !== null) { const itemKey = this.inventory[this.selectedItemIndex]; if (!itemKey) { this.clearSelection(); return; } const itemType = ItemData[itemKey].type; if (this.equipSlots[slotKey]) { if (slotKey === itemType) { this.equipItem(itemKey, slotKey); this.inventory[this.selectedItemIndex] = null; this.clearSelection(); this.refreshInventory(); } else { this.showError('해당 아이템을 장착할 수 없는 위치입니다.'); } } else { this.clearSelection(); } } else { if (typeof slotKey === 'number' && slotKey < this.inventory.length && this.inventory[slotKey]) { this.selectedItemIndex = slotKey; this.selectedHighlight.visible = true; if (this.selectedHighlight) { this.selectedHighlight.clear().lineStyle(2, 0xcc99ff).strokeRect(slot.x, slot.y, slot.width, slot.height); } } }
    }
    
    addItem(itemKey) {
        const emptySlotIndex = this.inventory.indexOf(null); if (emptySlotIndex !== -1) { this.inventory[emptySlotIndex] = itemKey; this.refreshInventory(); } else { this.showError('인벤토리가 가득 찼습니다!'); }
    }
    
    refreshInventory() {
         if (!this.itemIcons) { console.warn("Item icon group not ready in refreshInventory"); return; } this.itemIcons.clear(true, true); this.inventory.forEach((itemKey, index) => { if (itemKey) { const slot = (index < this.inventorySlots.length) ? this.inventorySlots[index] : null; if (slot) { const itemIcon = this.add.rectangle(slot.x + slot.width/2, slot.y + slot.height/2, slot.width * 0.8, slot.height * 0.8, ItemData[itemKey].color); this.itemIcons.add(itemIcon); } } }); Object.keys(this.equipSlots).forEach(slotKey => { const slot = this.equipSlots[slotKey]; if (slot && typeof slot.getData === 'function' && slot.getData('item')) { const itemKey = slot.getData('item'); const itemIcon = this.add.rectangle(slot.x + slot.width/2, slot.y + slot.height/2, slot.width * 0.8, slot.height * 0.8, ItemData[itemKey].color); this.itemIcons.add(itemIcon); } });
    }
    
    equipItem(itemKey, slotKey) {
        const slot = this.equipSlots[slotKey]; if (slot && typeof slot.setData === 'function') { slot.setData('item', itemKey); } else { console.error(`Equip slot ${slotKey} not found or invalid.`); }
    }
    
    clearSelection() {
        this.selectedItemIndex = null; if (this.selectedHighlight) { this.selectedHighlight.visible = false; }
    }
    
    showError(message) {
        if (this.errorText) { this.errorText.setText(message); if (this.scene.isActive()) { this.time.delayedCall(2000, () => { if(this.errorText) this.errorText.setText(''); }); } else { if(this.errorText) this.errorText.setText(''); console.warn("showError called while UIScene is inactive:", message); } }
    } 
} // End of UIScene class

// --- Phaser 게임 설정 --- (v7.1과 동일)
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

// --- 파일 끝 ---
