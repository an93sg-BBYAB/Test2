// game.js (v8.14 - 모든 오타 및 쓰레기 문자 제거)

// --- 데이터 정의 ---
const ItemData = {
    'sword':    { name: '검', type: 'weapon', color: 0x8B4513 }, 'shield':   { name: '방패', type: 'shield', color: 0x8B4513 },
    'helmet':   { name: '투구', type: 'helmet', color: 0x8B4513 }, 'armor':    { name: '갑옷', type: 'armor', color: 0x8B4513 },
    'gloves':   { name: '장갑', type: 'gloves', color: 0x8B4513 }, 'belt':     { name: '허리띠', type: 'belt',   color: 0x8B4513 },
    'boots':    { name: '장화', type: 'boots',  color: 0x8B4513 }
};
const ALL_ITEM_KEYS = Object.keys(ItemData);
const EnemyData = {
    'slime':   { name: '슬라임', hp: 20, atk: 3, color: 0x00aa00, dropRate: 0.10, illustKey: 'slime_illust', attackTime: 1.0 },
    'goblin': { name: '고블린',   hp: 50, atk: 5, color: 0xeeeeee, dropRate: 0.15, illustKey: 'goblin_illust', attackTime: 1.0 },
    'orc':      { name: '오크',   hp: 80, atk: 8, color: 0x008800, dropRate: 0.20, illustKey: 'orc_illust',    attackTime: 1.0 },
    'demon':    { name: '악마',   hp: 400, atk: 12, color: 0xcc0000, dropRate: 0.25, illustKey: 'demon_illust',  attackTime: 1.0 },
    'skeleton':    { name: '해골', hp: 50, atk: 10, color: 0x00ffff, dropRate: 0.05, illustKey: 'skeleton_illust',    attackTime: 1.0 }
};
const SPAWNABLE_ENEMY_KEYS = ['slime', 'goblin', 'orc', 'skeleton' ];
const TILE_TYPE_EMPTY = 0; const TILE_TYPE_PATH = 1; const TILE_TYPE_ENEMY2 = 2;
const TILE_TYPE_ENEMY3 = 3; const TILE_TYPE_ENEMY5 = 5; const TILE_TYPE_START = 6;

// --- 1. 메인 게임 씬 (필드 탐험) ---
class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.TILE_SIZE = 48; this.TOP_UI_HEIGHT = 50; this.RIGHT_UI_WIDTH = 190;
        this.GRID_WIDTH = 25; this.GRID_HEIGHT = 18;
        this.MAP_OFFSET_X = 0; this.MAP_OFFSET_Y = 0; this.mapGraphics = null; this.hero = null;
        this.pathCoords = []; this.pathCoordsWithOffset = []; this.grid = [];
        this.specialTileCoords = { [TILE_TYPE_ENEMY2]: [], [TILE_TYPE_ENEMY3]: [], [TILE_TYPE_ENEMY5]: [] };
        this.tilesMovedSinceLastDay = 0; this.isInitialDrawComplete = false; this.startingCombat = false;
    }

    preload() {
        const pixelData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/wcAAwAB/epA8AAAAABJRU5ErkJggg==';
        if (!this.textures.exists('pixel')) { this.textures.addBase64('pixel', pixelData); }
        this.load.image('hero_illust', 'hero_illust.png');        // 전투 씬에서 사용할 영웅의 이미지
        this.load.image('slime_illust', 'slime.png');             // 전투 씬에서 사용할 슬라임의 이미지
    }

    create() {
        console.log("GameScene create start");
        this.scene.run('UIScene');
        this.registry.set('isPaused', false);
        this.pathIndex = 0; this.day = 1; this.tilesMovedTotal = 0;
        // [추가] ★★★ 루프 카운터 초기화 ★★★
        this.loopCount = 1;
        this.registry.set('loopCount', this.loopCount);
            
        this.enemyTriggers = this.physics.add.group(); this.mapGraphics = this.add.group();
            
        this.generateRandomLoop(); // 루프 경로 생성 (데이터만)

        this.scale.on('resize', this.redraw, this);
        this.events.on('combatComplete', this.onCombatComplete, this);
        this.heroData = { hp: 100, maxHp: 100, attackTime: 0.8 };

        this.time.delayedCall(200, () => {
             const uiScene = this.scene.get('UIScene');
             if (uiScene && this.scene.isActive('UIScene')) {
                uiScene.events.emit('updateHeroHP', this.heroData.hp, this.heroData.maxHp);
             } else { console.warn("UIScene not active or ready for initial events."); }
        });

        console.log("GameScene calling initial redraw");
        if (this.pathCoords && this.pathCoords.length > 0) {
            this.time.delayedCall(50, () => { console.log("Executing delayed initial redraw for GameScene"); this.redraw(this.scale.gameSize); }, [], this);
        } else {
            console.error("Initial redraw skipped: pathCoords is invalid after generation!");
             this.generateDefaultLoop(); this.assignSpecialTiles();
             if (this.pathCoords && this.pathCoords.length > 0) {
                  this.time.delayedCall(50, () => { console.log("Executing delayed fallback redraw for GameScene"); this.redraw(this.scale.gameSize); }, [], this);
             } else { console.error("FATAL: Failed to generate even default loop!"); }
        }
        this.input.keyboard.on('keydown-SPACE', this.togglePause, this);
        // 'R'키 리스너를 여기서 '항상' 등록합니다.
        this.input.keyboard.on('keydown-R', this.restartGame, this);

        // [추가] ★★★ 배속 기능 변수 ★★★
        this.speedLevels = [0.25, 0.5, 1, 2, 4];
        this.speedIndex = 2; // 기본값 1x
        
        // [추가] ★★★ 배속 레지스트리 등록 및 리스너 ★★★
        this.registry.set('gameSpeed', this.speedLevels[this.speedIndex]);
        this.time.timeScale = this.speedLevels[this.speedIndex]; // 씬의 초기 속도 설정
        this.registry.events.on('changedata-gameSpeed', (parent, key, data) => {
            if (this.time) this.time.timeScale = data; // 속도 변경 시 씬의 timeScale 업데이트
        }, this);
        
        // [추가] ★★★ 배속 키 등록 (v8.15에서 키가 반대로 되었던 오류 수정) ★★★
        this.input.keyboard.on('keydown-X', this.decreaseSpeed, this); // X키 = 감소
        this.input.keyboard.on('keydown-C', this.increaseSpeed, this); // C키 = 증가        
            
        console.log("GameScene create end");
    }
    
    shutdown() {
        console.log("GameScene shutdown");
        this.scale.off('resize', this.redraw, this);
        this.events.off('combatComplete', this.onCombatComplete, this);
        this.input.keyboard.off('keydown-SPACE', this.togglePause, this);
        // 여기서 'R'키 리스너를 '항상' 제거합니다.
        this.input.keyboard.off('keydown-R', this.restartGame, this); 
        
        // [추가] ★★★ 배속 리스너 제거 ★★★
        this.registry.events.off('changedata-gameSpeed', null, this); // 이 씬의 모든 gameSpeed 리스너 제거
        this.input.keyboard.off('keydown-X', this.decreaseSpeed, this);
        this.input.keyboard.off('keydown-C', this.increaseSpeed, this);
        
        this.time.removeAllEvents();
        if (this.enemyTriggers) this.enemyTriggers.destroy(true);
        if (this.mapGraphics) this.mapGraphics.destroy(true);
        this.hero = null;
        this.mapGraphics = null;
        this.enemyTriggers = null;
    }

    togglePause() {
        const newState = !this.registry.get('isPaused');
        this.registry.set('isPaused', newState); console.log("Pause Toggled:", newState);
    }

    redraw(gameSize) {
        console.log("GameScene redraw start", gameSize);
        if (!this.pathCoords || this.pathCoords.length === 0) { console.warn("GameScene redraw skipped: pathCoords is invalid."); return; }
        const gameWidth = gameSize ? gameSize.width : this.cameras.main.width; const gameHeight = gameSize ? gameSize.height : this.cameras.main.height;
        if (gameWidth <= 1 || gameHeight <= 1) { console.warn("GameScene redraw skipped due to invalid size:", gameWidth, gameHeight); return; }

        if (this.mapGraphics) this.mapGraphics.clear(true, true); 
        this.calculateMapOffsets(gameWidth, gameHeight);
        this.drawTiles(gameWidth, gameHeight);
        this.updatePathCoordsWithOffset();

        if (!this.hero && this.pathCoordsWithOffset.length > 0) {
            console.log("GameScene creating hero");
            const startPos = this.pathCoordsWithOffset[0]; if (!startPos) { console.error("Cannot create hero, start position is invalid!"); return; }
            this.hero = this.physics.add.sprite(startPos.x, startPos.y, 'pixel').setDisplaySize(this.TILE_SIZE * 0.5, this.TILE_SIZE * 0.75).setTint(0x00ffff);
            this.hero.hp = this.heroData.hp; this.hero.maxHp = this.heroData.maxHp;
            this.hero.setDepth(1);

        } else if (this.hero && this.pathCoordsWithOffset.length > 0) {
             console.log("GameScene repositioning hero");
            const currentPos = this.pathCoordsWithOffset[this.pathIndex]; if (!currentPos) { console.error("Cannot reposition hero, current position is invalid!"); return; }
            this.hero.setPosition(currentPos.x, currentPos.y); this.hero.setDepth(1);
            if (this.hero.body) { this.hero.body.reset(currentPos.x, currentPos.y); }
            else if (this.hero.active) { console.log("Re-enabling physics body for hero"); this.physics.world.enable(this.hero); if(this.hero.body) this.hero.body.reset(currentPos.x, currentPos.y); }
        }
        this.isInitialDrawComplete = true; console.log("GameScene redraw end");
    }
    calculateMapOffsets(gameWidth, gameHeight) {
         if (!this.pathCoords || this.pathCoords.length === 0) { this.MAP_OFFSET_X = (gameWidth - this.RIGHT_UI_WIDTH) / 2; this.MAP_OFFSET_Y = this.TOP_UI_HEIGHT + (gameHeight - this.TOP_UI_HEIGHT) / 2; console.warn("calculateMapOffsets using default center due to empty pathCoords."); return; }
         let sumX = 0, sumY = 0; let validCoords = 0;
         this.pathCoords.forEach(coord => { if (coord && typeof coord.x === 'number' && typeof coord.y === 'number') { sumX += coord.x; sumY += coord.y; validCoords++; } });
         if (validCoords === 0) { this.MAP_OFFSET_X = (gameWidth - this.RIGHT_UI_WIDTH) / 2; this.MAP_OFFSET_Y = this.TOP_UI_HEIGHT + (gameHeight - this.TOP_UI_HEIGHT) / 2; console.warn("calculateMapOffsets using default center due to invalid pathCoords content."); return; }
         const avgGridX = sumX / validCoords; const avgGridY = sumY / validCoords;
        const gameplayAreaWidth = gameWidth - this.RIGHT_UI_WIDTH; const gameplayAreaHeight = gameHeight - this.TOP_UI_HEIGHT;
        const gameplayCenterX = gameplayAreaWidth / 2; const gameplayCenterY = this.TOP_UI_HEIGHT + (gameplayAreaHeight / 2);
        const avgPixelX_noOffset = avgGridX * this.TILE_SIZE + this.TILE_SIZE / 2; const avgPixelY_noOffset = avgGridY * this.TILE_SIZE + this.TILE_SIZE / 2;
        this.MAP_OFFSET_X = gameplayCenterX - avgPixelX_noOffset; this.MAP_OFFSET_Y = gameplayCenterY - avgPixelY_noOffset;
         console.log(`Calculated Offsets: X=${this.MAP_OFFSET_X.toFixed(1)}, Y=${this.MAP_OFFSET_Y.toFixed(1)}`);
    }
    update(time, delta) {
        if (this.registry.get('isPaused')) { if (this.hero && this.hero.body) { this.hero.body.setVelocity(0, 0); } return; }
        if (!this.isInitialDrawComplete || !this.hero || !this.hero.active) return;
        if (!this.startingCombat) { this.moveHero(); }
    }
    generateRandomLoop() {
        this.grid = Array(this.GRID_HEIGHT).fill(0).map(() => Array(this.GRID_WIDTH).fill(TILE_TYPE_EMPTY));
        this.pathCoords = [];
        this.specialTileCoords = { [TILE_TYPE_ENEMY2]: [], [TILE_TYPE_ENEMY3]: [], [TILE_TYPE_ENEMY5]: [] };
        const startX = Math.floor(this.GRID_WIDTH / 2);
        const startY = Math.floor(this.GRID_HEIGHT / 2);
        this.setGrid(startX, startY, TILE_TYPE_START);
        let stack = [{ x: startX, y: startY }];
        let visited = new Set([`${startX},${startY}`]);
        let path = []; 
        path.push({x: startX, y: startY});
        const targetLength = Phaser.Math.Between(30, 40);
        let failsafe = 1000; 
        while (stack.length > 0 && path.length < targetLength && failsafe-- > 0) {
            let current = stack[stack.length - 1];
            let neighbors = [];
            const directions = [[0, -2], [0, 2], [-2, 0], [2, 0]];
            Phaser.Utils.Array.Shuffle(directions);
            for (const [dx, dy] of directions) {
                const nx = current.x + dx;
                const ny = current.y + dy;
                if (nx > 0 && nx < this.GRID_WIDTH - 1 && ny > 0 && ny < this.GRID_HEIGHT - 1 && !visited.has(`${nx},${ny}`)) {
                    neighbors.push({ x: nx, y: ny, wallX: current.x + dx / 2, wallY: current.y + dy / 2 });
                }
            }
            if (neighbors.length > 0) {
                const next = neighbors[0];
                this.setGrid(next.wallX, next.wallY, TILE_TYPE_PATH);
                path.push({x: next.wallX, y: next.wallY});
                this.setGrid(next.x, next.y, TILE_TYPE_PATH);
                path.push({x: next.x, y: next.y});
                visited.add(`${next.x},${next.y}`);
                stack.push({ x: next.x, y: next.y });
            } else {
                stack.pop(); 
            }
        }
         if (failsafe <= 0) console.warn("Maze generation timeout!");
        let lastPos = path[path.length-1];
         if (lastPos && (lastPos.x !== startX || lastPos.y !== startY)) {
             if (Math.abs(lastPos.x - startX) === 1 && lastPos.y === startY && this.grid[startY]?.[Math.min(lastPos.x, startX)] === TILE_TYPE_EMPTY) {
                  this.setGrid(Math.min(lastPos.x, startX), startY, TILE_TYPE_PATH); path.push({x: Math.min(lastPos.x, startX), y: startY});
             } else if (Math.abs(lastPos.y - startY) === 1 && lastPos.x === startX && this.grid[Math.min(lastPos.y, startY)]?.[startX] === TILE_TYPE_EMPTY) {
                  this.setGrid(startX, Math.min(lastPos.y, startY), TILE_TYPE_PATH); path.push({x: startX, y: Math.min(lastPos.y, startY)});
             }
         }
        this.pathCoords = [];
        let current = { x: startX, y: startY };
        let cameFrom = null; 
        const startNeighbors = [];
        if (this.grid[startY]?.[startX+1] >= TILE_TYPE_PATH) startNeighbors.push({x: startX+1, y: startY});
        if (this.grid[startY+1]?.[startX] >= TILE_TYPE_PATH) startNeighbors.push({x: startX, y: startY+1});
        if (this.grid[startY]?.[startX-1] >= TILE_TYPE_PATH) startNeighbors.push({x: startX-1, y: startY});
        if (this.grid[startY-1]?.[startX] >= TILE_TYPE_PATH) startNeighbors.push({x: startX, y: startY-1});
        if (startNeighbors.length < 2) { 
             console.error("Loop start point is invalid after maze gen, neighbors:", startNeighbors.length);
             this.generateDefaultLoop();
             this.assignSpecialTiles();
             return;
        }
        cameFrom = startNeighbors[0]; 
        do {
            this.pathCoords.push({ ...current });
            const neighbors = this.getPathNeighbors(current.x, current.y);
            let next = null;
            if (neighbors.length !== 2 && !(current.x === startX && current.y === startY && neighbors.length > 0)) { 
                 console.error(`Path generation error: Invalid neighbor count (${neighbors.length}) at`, current);
                  this.generateDefaultLoop();
                  this.assignSpecialTiles();
                  return;
            }
             const searchOrder = [
                 { x: current.x + 1, y: current.y }, // 우
                 { x: current.x, y: current.y + 1 }, // 하
                 { x: current.x - 1, y: current.y }, // 좌
                 { x: current.x, y: current.y - 1 }  // 상
             ];
            for (const potentialNext of searchOrder) {
                const isNeighbor = neighbors.some(n => n.x === potentialNext.x && n.y === potentialNext.y);
                const isCameFrom = cameFrom && (potentialNext.x === cameFrom.x && potentialNext.y === cameFrom.y);
                if (isNeighbor && !isCameFrom) {
                    next = potentialNext;
                    break;
                }
            }
             if (!next && current.x === startX && current.y === startY && this.pathCoords.length > 1) {
                  break; // 루프 완성
             } else if (!next) {
                  console.error("Path trace error: Cannot find next clockwise step from", current);
                  this.generateDefaultLoop();
                  this.assignSpecialTiles();
                  return;
             }
            cameFrom = { ...current };
            current = { ...next };
        } while ((current.x !== startX || current.y !== startY) && this.pathCoords.length <= (this.GRID_WIDTH * this.GRID_HEIGHT));
        if (this.pathCoords.length < 10 || this.pathCoords.length > (this.GRID_WIDTH * this.GRID_HEIGHT)) {
             console.warn("Final loop trace failed or invalid length, creating default loop.");
             this.generateDefaultLoop();
        }
        this.assignSpecialTiles();
        console.log("Final loop length:", this.pathCoords.length);
        console.log("Final Special Tiles:", this.specialTileCoords);
    }
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
         this.setGrid(startX, startY, TILE_TYPE_START);
    }
     assignSpecialTiles() {
         if (this.pathCoords.length <= 1) { console.warn("Cannot assign special tiles: Path is too short or empty."); return; }
         const pathIndices = Array.from(Array(this.pathCoords.length).keys()); 
         pathIndices.shift(); 
         Phaser.Utils.Array.Shuffle(pathIndices); 
         this.specialTileCoords = { [TILE_TYPE_ENEMY2]: [], [TILE_TYPE_ENEMY3]: [], [TILE_TYPE_ENEMY5]: [] }; 
         const placeTile = (type, count) => {
             let placed = 0;
             while(placed < count && pathIndices.length > 0) {
                 const index = pathIndices.pop();
                 if (index === undefined) break;
                 const coord = this.pathCoords[index];
                 if (coord && this.grid[coord.y]?.[coord.x] === TILE_TYPE_PATH) { 
                     this.grid[coord.y][coord.x] = type;
                     this.specialTileCoords[type].push(coord);
                     placed++;
                 }
             }
             if (placed < count) console.warn(`Could only place ${placed}/${count} tiles of type ${type}.`);
         };
         placeTile(TILE_TYPE_ENEMY2, 2);
         placeTile(TILE_TYPE_ENEMY3, 3);
         placeTile(TILE_TYPE_ENEMY5, 1);
     }
    updatePathCoordsWithOffset() {
         if (!this.pathCoords || this.pathCoords.length === 0) { this.pathCoordsWithOffset = []; console.warn("updatePathCoordsWithOffset skipped: pathCoords is empty."); return; }
        this.pathCoordsWithOffset = this.pathCoords.map(coord => { if (!coord || typeof coord.x !== 'number' || typeof coord.y !== 'number') { console.warn("Invalid coordinate in pathCoords during offset update:", coord); return null; } return new Phaser.Math.Vector2( coord.x * this.TILE_SIZE + this.TILE_SIZE / 2 + this.MAP_OFFSET_X, coord.y * this.TILE_SIZE + this.TILE_SIZE / 2 + this.MAP_OFFSET_Y ); }).filter(v => v !== null); 
         if (this.pathCoordsWithOffset.length > 0) { 
             this.pathCoordsWithOffset.push(this.pathCoordsWithOffset[0]);
         } else if (this.pathCoords.length > 0) { console.error("FATAL: pathCoordsWithOffset became empty after filtering invalid coordinates!"); }
    }
    drawTiles(gameWidth, gameHeight) {
        const bgGraphics = this.add.graphics(); if(this.mapGraphics) this.mapGraphics.add(bgGraphics);
        bgGraphics.fillStyle(0x000000).fillRect(0, 0, gameWidth, gameHeight); 
        for (let y = 0; y < this.grid.length; y++) {
            for (let x = 0; x < (this.grid[y]?.length || 0); x++) {
                 const tileType = this.grid[y][x];
                 if (tileType >= TILE_TYPE_PATH) {
                    const tileX = x * this.TILE_SIZE + this.MAP_OFFSET_X;
                    const tileY = y * this.TILE_SIZE + this.MAP_OFFSET_Y;
                    let fillColor;
                    switch(tileType) {
                        case TILE_TYPE_START: fillColor = 0x90ee90; break;
                        case TILE_TYPE_ENEMY2: fillColor = 0x0000ff; break;
                        case TILE_TYPE_ENEMY3: fillColor = 0x00ff00; break;
                        case TILE_TYPE_ENEMY5: fillColor = 0x800080; break;
                        case TILE_TYPE_PATH: default: fillColor = 0x555555; break;
                    }
                    const tileGraphics = this.add.graphics(); if(this.mapGraphics) this.mapGraphics.add(tileGraphics);
                    tileGraphics.fillStyle(fillColor).fillRect(tileX, tileY, this.TILE_SIZE, this.TILE_SIZE).lineStyle(1, 0x8B4513).strokeRect(tileX, tileY, this.TILE_SIZE, this.TILE_SIZE);
                 }
            }
        }
    }
    
    // (v8.4와 동일 - 전투 시작 시점)
    moveHero() {
        if (!this.hero || !this.hero.body || !this.pathCoordsWithOffset || this.pathCoordsWithOffset.length <= 1) return;
        if(this.pathIndex < 0 || this.pathIndex >= this.pathCoordsWithOffset.length) { this.pathIndex = 0; if (this.pathCoordsWithOffset.length === 0) return; }
        const targetPos = this.pathCoordsWithOffset[this.pathIndex];
        if (!targetPos || typeof targetPos.x !== 'number' || typeof targetPos.y !== 'number') { this.pathIndex = (this.pathIndex + 1) % this.pathCoordsWithOffset.length; return; }
        const distance = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, targetPos.x, targetPos.y);
        if (distance < 4) {
             let currentGridIndex = this.pathIndex;
             if (this.pathIndex === this.pathCoordsWithOffset.length - 1) {
                 currentGridIndex = 0;
             }
             const arrivedCoord = this.pathCoords[currentGridIndex]; 
             if (arrivedCoord) {
                 const combatStarted = this.checkEnemiesAtTile(arrivedCoord.x, arrivedCoord.y);
                 if (combatStarted) {
                     return; 
                 }
             }
             if (this.pathIndex === this.pathCoordsWithOffset.length - 1) { 
                 this.pathIndex = 0; 
                 this.spawnEnemy5(); 
                 
                 // [추가] ★★★ 출발점 도착 시 체력 회복 ★★★
                 if (this.hero) {
                     this.hero.hp = this.hero.maxHp;
                     const uiScene = this.scene.get('UIScene');
                     if(uiScene && this.scene.isActive('UIScene')) {
                         uiScene.events.emit('updateHeroHP', this.hero.hp, this.hero.maxHp);
                     }
                     console.log("Hero HP restored at start point.");
                 }

                 // [추가] ★★★ 루프 카운터 증가 ★★★
                 this.loopCount++;
                 this.registry.set('loopCount', this.loopCount);
                 
             } else {
                this.pathIndex++;
             }
            this.tilesMovedTotal++;
            this.tilesMovedSinceLastDay++; 
            if (this.tilesMovedSinceLastDay >= 12) {
                this.advanceDay();
            }
        } else {
            const gameSpeed = this.registry.get('gameSpeed') || 1;
            this.physics.moveTo(this.hero, targetPos.x, targetPos.y, 150 * gameSpeed); // [수정] 150 -> 150 * gameSpeed
        }
    }
    checkEnemiesAtTile(gridX, gridY) {
         if (this.startingCombat || this.registry.get('isPaused')) return false; 
         const tileCenterX = gridX * this.TILE_SIZE + this.TILE_SIZE / 2 + this.MAP_OFFSET_X;
         const tileCenterY = gridY * this.TILE_SIZE + this.TILE_SIZE / 2 + this.MAP_OFFSET_Y;
         let enemiesOnTile = [];
         if (this.enemyTriggers && this.enemyTriggers.getChildren) {
             this.enemyTriggers.getChildren().forEach(enemy => {
                 if (enemy.active && 
                     Phaser.Math.Distance.Between(tileCenterX, tileCenterY, enemy.x, enemy.y) < this.TILE_SIZE * 0.5)
                 {
                     enemiesOnTile.push(enemy);
                 }
             });
         }
         if (enemiesOnTile.length > 0) {
             this.startCombat(enemiesOnTile);
             return true; 
         }
         return false; 
    }
    advanceDay() {
        if (this.registry.get('isPaused')) return; 
        this.day++; this.tilesMovedSinceLastDay = 0; console.log(`Day ${this.day} started`);
        const uiScene = this.scene.get('UIScene'); if(uiScene && uiScene.events && this.scene.isActive('UIScene')) { uiScene.events.emit('updateDay', this.day); }
        
        // [수정] ★★★ 최대 체력의 0.25배 만큼 '회복' ★★★
        if (this.hero) { 
            // 현재 체력에 최대 체력의 25%를 더하되, 최대 체력을 넘지 않도록 합니다.
            this.hero.hp = Math.min(this.hero.hp + (this.hero.maxHp * 0.25), this.hero.maxHp);
            if(uiScene && uiScene.events && this.scene.isActive('UIScene')) { 
                uiScene.events.emit('updateHeroHP', this.hero.hp, this.hero.maxHp); 
            } 
        } 
        else if (this.heroData){ 
            this.heroData.hp = Math.min(this.heroData.hp + (this.heroData.maxHp * 0.25), this.heroData.maxHp);
        }

        this.spawnEnemy1(); if (this.day % 2 === 0) this.spawnEnemy2(); if (this.day % 3 === 0) this.spawnEnemy3();
    }
    spawnEnemy1() { 
        if (Math.random() < 0.10) {
                if (this.pathCoordsWithOffset.length < 2) return; 
                const spawnIndex = Phaser.Math.Between(1, this.pathCoordsWithOffset.length - 2);
                const spawnPos = this.pathCoordsWithOffset[spawnIndex]; if(spawnPos) this.spawnEnemyTriggerAt('slime', spawnPos.x, spawnPos.y); 
        }
    }
    spawnEnemy2() { 
        this.specialTileCoords[TILE_TYPE_ENEMY2].forEach(coord => { const spawnPos = this.getPixelCoord(coord); 
        if(spawnPos) this.spawnEnemyTriggerAt('goblin', spawnPos.x, spawnPos.y); });
    }
    spawnEnemy3() { 
        this.specialTileCoords[TILE_TYPE_ENEMY3].forEach(coord => { const spawnPos = this.getPixelCoord(coord); 
        if(spawnPos) this.spawnEnemyTriggerAt('orc', spawnPos.x, spawnPos.y); });
    }
    spawnEnemy5() { 
        if (this.specialTileCoords[TILE_TYPE_ENEMY5].length > 0) {
                const coord = this.specialTileCoords[TILE_TYPE_ENEMY5][0];
                const spawnPos = this.getPixelCoord(coord); if (spawnPos) { 
                for(let i=0; i<3; i++) { 
                        const offsetX = Phaser.Math.Between(-this.TILE_SIZE * 0.2, this.TILE_SIZE * 0.2); 
                        const offsetY = Phaser.Math.Between(-this.TILE_SIZE * 0.2, this.TILE_SIZE * 0.2); 
                        this.spawnEnemyTriggerAt('skeleton', spawnPos.x + offsetX, spawnPos.y + offsetY);
                        }
                }
        }
    }
    spawnEnemyTriggerAt(enemyKey, x, y) {
        if (!EnemyData[enemyKey]) return;
        if (!this.enemyTriggers) {
            console.warn("Cannot spawn enemy, enemyTriggers group is null (likely during shutdown)");
            return;
        }
        const enemy = this.enemyTriggers.create(x, y, 'pixel').setDisplaySize(this.TILE_SIZE * 0.4, this.TILE_SIZE * 0.4).setTint(EnemyData[enemyKey].color);
        enemy.enemyKey = enemyKey; enemy.setDepth(1); 
    }
    getPixelCoord(gridCoord) {
        if (!gridCoord || typeof gridCoord.x !== 'number' || typeof gridCoord.y !== 'number') return null;
        return new Phaser.Math.Vector2( gridCoord.x * this.TILE_SIZE + this.TILE_SIZE / 2 + this.MAP_OFFSET_X, gridCoord.y * this.TILE_SIZE + this.TILE_SIZE / 2 + this.MAP_OFFSET_Y );
    }
    startCombat(enemiesToFight) {
        if (this.startingCombat || !enemiesToFight || enemiesToFight.length === 0) { 
             return; 
        }
        this.startingCombat = true;
        if(this.hero && this.hero.body) this.hero.body.stop(); 
        let combatants = [];
        enemiesToFight.forEach(enemy => {
            if (enemy.active && EnemyData[enemy.enemyKey]) { 
                combatants.push(JSON.parse(JSON.stringify(EnemyData[enemy.enemyKey]))); 
                enemy.destroy(); 
            }
        });
        if (combatants.length === 0) { 
             this.startingCombat = false;
             return;
        }
        console.log(`Starting combat with ${combatants.length} enemies.`);
        const heroCurrentHp = this.hero ? this.hero.hp : this.heroData.hp;
        const heroCurrentMaxHp = this.hero ? this.hero.maxHp : this.heroData.maxHp;
        const combatData = {
            enemies: combatants, 
            heroHp: heroCurrentHp,
            heroMaxHp: heroCurrentMaxHp,
            heroAttackTime: this.heroData.attackTime 
        };
        this.scene.pause(); 
        this.scene.launch('CombatScene', combatData);
    }
    
    // [수정] ★★★ 'hasListeners' 오류가 수정된 함수 ★★★
    onCombatComplete(data) {
        this.startingCombat = false; 
        
        // [수정] 471줄 오류 원인이었던 'if (!this.hero)' 블록
        // 'hasListeners'를 호출하던 코드를 제거하고 'return'으로 변경
        if (!this.hero) { 
             return; // hero가 없으면(ex: 씬 종료 중) 아무것도 하지 않고 종료
        }

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
            // v8.5의 버그 수정 (일시정지 중 게임오버시 재시작 가능하게)
            this.scene.resume('GameScene'); 

            this.hero.destroy(); 
            this.hero = null; 
             // 'GAME OVER' 텍스트 출력
             const gameOverText = this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2, 'GAME OVER\nPress "R" to Restart', { fontSize: '40px', fill: '#ff0000', align: 'center', backgroundColor: '#000000' }).setOrigin(0.5);
             gameOverText.setDepth(10); 
             
             // [수정] 493줄 오류 원인이었던 'hasListeners' if문 제거
             // 'R'키 리스너는 create에서 이미 등록했으므로 여기서 또 등록할 필요가 없습니다.
        
        } else {
            this.scene.resume();
            console.log("GameScene calling redraw after combat");
            this.time.delayedCall(20, () => { 
                if (this.scene.isActive()) this.redraw(this.scale.gameSize); 
            }, [], this);
        }
    }
    
    // v8.5의 'isActive' 체크 제거 (재시작 버그 수정)
    restartGame(event) {
    // [수정] ★★★ 'queue' 오류 수정을 위해 재시작을 1 프레임 지연 ★★★
        
        // 1. 리스너를 즉시 제거하여 'R'키 중복 호출 방지
        this.input.keyboard.off('keydown-R', this.restartGame, this); 
        this.input.keyboard.off('keydown-SPACE', this.togglePause, this); 

        // 2. 씬 파괴 및 재시작은 키보드 이벤트 처리가 끝난 다음 틱(tick)으로 지연
        this.time.delayedCall(1, () => {
            console.log("Restarting game (delayed call)...");
                
            // GameScene.shutdown()이 호출되어 어차피 모든 리스너가 제거되지만,
            // 여기서 즉시 제거하는 것이 가장 안전합니다.
            
            this.scene.remove('UIScene'); 
            this.scene.remove('CombatScene');
            this.scene.start('GameScene'); 
        }, [], this);
    }

    // [추가] ★★★ 배속 조절 함수 ★★★
    decreaseSpeed() {
        if (this.speedIndex > 0) {
            this.speedIndex--;
            this.updateGameSpeed();
        }
    }
    increaseSpeed() {
        if (this.speedIndex < this.speedLevels.length - 1) {
            this.speedIndex++;
            this.updateGameSpeed();
        }
    }
    updateGameSpeed() {
        const newSpeed = this.speedLevels[this.speedIndex];
        // 레지스트리 값을 변경하면, GameScene, CombatScene, UIScene의
        // 'changedata-gameSpeed' 리스너가 모두 자동으로 호출됩니다.
        this.registry.set('gameSpeed', newSpeed); 
        console.log("Game speed set to:", newSpeed + "x");
    }
    
} // End of GameScene class

// --- 2. 전투 씬 --- (v8.13 - 모든 오타 제거)
class CombatScene extends Phaser.Scene {
    constructor() {
        super('CombatScene');
        this.combatRunning = false;
        this.heroAttackGauge = 0; this.heroAttackSpeed = 0;
        this.enemiesData = []; this.enemyIllusts = [];
        this.enemyHps = []; this.enemyMaxHps = [];
        this.enemyAttackGauges = []; this.enemyAttackSpeeds = [];
        this.enemyHpBarBGs = []; this.enemyHpBarFills = [];
        this.enemyAttackGaugeBGs = []; this.enemyAttackGaugeFills = [];
    }
    init(data) {
        this.enemiesData = data.enemies || []; 
        this.heroHp = data.heroHp; this.heroMaxHp = data.heroMaxHp;
        this.heroAttackSpeed = 100 / (data.heroAttackTime || 0.8); 
        this.enemyIllusts = []; this.enemyHps = []; this.enemyMaxHps = [];
        this.enemyAttackGauges = []; this.enemyAttackSpeeds = [];
        this.enemyHpBarBGs = []; this.enemyHpBarFills = [];
        this.enemyAttackGaugeBGs = []; this.enemyAttackGaugeFills = [];
        this.enemiesData.forEach(enemyData => {
             this.enemyHps.push(enemyData.hp);
             this.enemyMaxHps.push(enemyData.hp);
             this.enemyAttackSpeeds.push(100 / (enemyData.attackTime || 1.0));
             this.enemyAttackGauges.push(0);
        });
    }
    create() {
        const gameWidth = this.cameras.main.width; const gameHeight = this.cameras.main.height;
        const combatPanelWidth = gameWidth * 0.5; const combatPanelHeight = gameHeight * 0.5;
        const combatPanelX = (gameWidth - combatPanelWidth) / 2; const combatPanelY = (gameHeight - combatPanelHeight) / 2;
        this.add.graphics().fillStyle(0x000000, 0.7).fillRect(0, 0, gameWidth, gameHeight); 
        this.add.graphics().fillStyle(0x333333).fillRect(combatPanelX, combatPanelY, combatPanelWidth, combatPanelHeight).lineStyle(2, 0x8B4513).strokeRect(combatPanelX, combatPanelY, combatPanelWidth, combatPanelHeight);
        this.heroIllust = this.add.image(combatPanelX + combatPanelWidth * 0.3, combatPanelY + combatPanelHeight * 0.5, 'hero_illust').setDisplaySize(240, 320).setOrigin(0.5);
        const hpBarWidth = 100; const hpBarHeight = 10;
        const heroHpBarX = this.heroIllust.x - hpBarWidth / 2; 
        const heroHpBarY = this.heroIllust.y - this.heroIllust.displayHeight / 2 - 25; 
        this.heroHpBarBG = this.add.rectangle(heroHpBarX, heroHpBarY, hpBarWidth, hpBarHeight, 0xff0000).setOrigin(0);
        this.heroHpBarFill = this.add.rectangle(heroHpBarX, heroHpBarY, hpBarWidth, hpBarHeight, 0x00ff00).setOrigin(0);
        const attackGaugeWidth = hpBarWidth; const attackGaugeHeight = hpBarHeight * 0.25; 
        const heroAttackGaugeY = heroHpBarY + hpBarHeight + 2; 
        this.heroAttackGaugeBG = this.add.rectangle(heroHpBarX, heroAttackGaugeY, attackGaugeWidth, attackGaugeHeight, 0x555555).setOrigin(0); 
        this.heroAttackGaugeFill = this.add.rectangle(heroHpBarX, heroAttackGaugeY, 0, attackGaugeHeight, 0xffff00).setOrigin(0); 
        this.heroAttackGauge = 0;
        const numEnemies = this.enemiesData.length;
        const enemyStartX = combatPanelX + combatPanelWidth * 0.7; 
        const enemyTotalHeight = 140 * numEnemies; 
        const enemySpacingY = (numEnemies > 1) ? (combatPanelHeight * 0.8 / (numEnemies -1)) : 0; 
        const firstEnemyY = combatPanelY + (combatPanelHeight / 2) - (enemyTotalHeight / 2) + 70; 
        this.enemiesData.forEach((enemyData, index) => {
            const enemyX = enemyStartX;
            const enemyY = (numEnemies > 1) ? (firstEnemyY + (enemySpacingY * index)) : (combatPanelY + combatPanelHeight / 2); 
            
            let enemyIllust;
            // 1. enemyData에 illustKey가 있고(ex: 'slime_illust') 1단계에서 로드에 성공했다면
            if (enemyData.illustKey && this.textures.exists(enemyData.illustKey)) {
                // 해당 키의 이미지(ex: 'slime_illust')를 사용 (setTint 제거)
                enemyIllust = this.add.image(enemyX, enemyY, enemyData.illustKey).setDisplaySize(100, 140).setOrigin(0.5);
            } else {
                // 2. illustKey가 없거나 로드되지 않았다면 (기존 방식)
                enemyIllust = this.add.image(enemyX, enemyY, 'pixel').setDisplaySize(100, 140).setTint(enemyData.color).setOrigin(0.5); 
            }
            
            const eHpBarX = enemyIllust.x - hpBarWidth / 2;
            const eHpBarY = enemyIllust.y - enemyIllust.displayHeight / 2 - 25; 
            const eAttackGaugeY = eHpBarY + hpBarHeight + 2;
            this.enemyIllusts.push(enemyIllust);
            this.enemyHpBarBGs.push(this.add.rectangle(eHpBarX, eHpBarY, hpBarWidth, hpBarHeight, 0xff0000).setOrigin(0));
            this.enemyHpBarFills.push(this.add.rectangle(eHpBarX, eHpBarY, hpBarWidth, hpBarHeight, 0x00ff00).setOrigin(0));
            this.enemyAttackGaugeBGs.push(this.add.rectangle(eHpBarX, eAttackGaugeY, attackGaugeWidth, attackGaugeHeight, 0x555555).setOrigin(0));
            this.enemyAttackGaugeFills.push(this.add.rectangle(eHpBarX, eAttackGaugeY, 0, attackGaugeHeight, 0xffff00).setOrigin(0));
        });
        this.updateHpBars(); 
        this.updateAttackGauges(); 

        // [추가] ★★★ 배속 기능 적용 ★★★
        this.time.timeScale = this.registry.get('gameSpeed'); // 씬의 초기 속도 설정
        this.registry.events.on('changedata-gameSpeed', (parent, key, data) => {
            if (this.time) this.time.timeScale = data; // 속도 변경 시 씬의 timeScale 업데이트
        }, this);
        
        this.combatRunning = true;
        this.input.keyboard.on('keydown-SPACE', this.toggleGamePause, this);
    }
    shutdown() {
        console.log("CombatScene shutdown");
        this.input.keyboard.off('keydown-SPACE', this.toggleGamePause, this);
        // [추가] ★★★ 배속 리스너 제거 ★★★
        this.registry.events.off('changedata-gameSpeed', null, this);
    }
    toggleGamePause() {
        const gameScene = this.scene.get('GameScene');
        if (gameScene) {
             gameScene.togglePause();
        }
    }
    update(time, delta) {
        // [추가] ★★★ 전역 일시정지 확인 (스페이스바 안먹히던 문제 해결) ★★★
        // if (this.registry.get('isPaused')) return;
        
        if (!this.combatRunning) return;
        const deltaSeconds = delta / 1000; 
        this.heroAttackGauge += this.heroAttackSpeed * deltaSeconds;
        if (this.heroAttackGauge >= 100) {
            this.heroAttackGauge = 0; 
            this.playerAttack();      
             if (!this.combatRunning) return;
        }
        this.enemiesData.forEach((enemyData, index) => {
             if (this.enemyHps[index] > 0) { 
                this.enemyAttackGauges[index] += this.enemyAttackSpeeds[index] * deltaSeconds;
                if (this.enemyAttackGauges[index] >= 100) {
                    this.enemyAttackGauges[index] = 0; 
                     this.enemyAttack(index); 
                      if (!this.combatRunning) return; 
                }
             }
        });
        this.updateAttackGauges();
    }
    updateHpBars() {
        const barWidth = 100;
        const heroPercent = Math.max(0, this.heroHp / this.heroMaxHp);
        if(this.heroHpBarFill) this.heroHpBarFill.width = barWidth * heroPercent;
        this.enemiesData.forEach((enemyData, index) => {
             const enemyPercent = Math.max(0, this.enemyHps[index] / this.enemyMaxHps[index]);
             if (this.enemyHpBarFills[index]) {
                this.enemyHpBarFills[index].width = barWidth * enemyPercent;
             }
        });
        const uiScene = this.scene.get('UIScene');
        if (uiScene && uiScene.events && uiScene.scene.isActive()) {
             uiScene.events.emit('updateHeroHP', this.heroHp, this.heroMaxHp);
        }
    }
    updateAttackGauges() {
        const gaugeWidth = 100;
        const heroGaugePercent = Math.min(1, this.heroAttackGauge / 100); 
        if (this.heroAttackGaugeFill) this.heroAttackGaugeFill.width = gaugeWidth * heroGaugePercent;
         this.enemiesData.forEach((enemyData, index) => {
             const enemyGaugePercent = Math.min(1, this.enemyAttackGauges[index] / 100);
             if (this.enemyAttackGaugeFills[index]) {
                this.enemyAttackGaugeFills[index].width = gaugeWidth * enemyGaugePercent;
             }
         });
    }
    playerAttack() {
        if (!this.combatRunning || !this.heroIllust.active) return;
        
        let livingTargets = [];
        this.enemyHps.forEach((hp, index) => {
            if (hp > 0) livingTargets.push(index);
        });
        
        if (livingTargets.length === 0) return; 
        
        const targetIndex = Phaser.Math.RND.pick(livingTargets);
        const targetIllust = this.enemyIllusts[targetIndex];
         if (!targetIllust || !targetIllust.active) return; 

        // [추가] ★★★ 배속 적용 ★★★
        const gameSpeed = this.registry.get('gameSpeed') || 1;

        this.add.tween({ 
            targets: this.heroIllust, 
            x: this.heroIllust.x + 20, 
            duration: 100 / gameSpeed, // [수정]
            ease: 'Power1', yoyo: true,
            onComplete: () => {
                if (!this.combatRunning) return; 
                this.enemyHps[targetIndex] -= 10;
                this.updateHpBars(); 
                if (this.enemyHps[targetIndex] <= 0) {
                    this.defeatEnemy(targetIndex); 
                } 
            }
        });
    }
        
    enemyAttack(index) {
        if (!this.combatRunning || !this.heroIllust.active || !this.enemyIllusts[index] || !this.enemyIllusts[index].active) return;
        
        const enemyIllust = this.enemyIllusts[index];
        const enemyAtk = this.enemiesData[index].atk;

        // [추가] ★★★ 배속 적용 ★★★
        const gameSpeed = this.registry.get('gameSpeed') || 1;

        this.add.tween({ 
            targets: enemyIllust,
            x: enemyIllust.x - 20, 
            duration: 100 / gameSpeed, // [수정]
            ease: 'Power1', yoyo: true,
            onComplete: () => {
                if (!this.combatRunning) return; 
                this.heroHp -= enemyAtk;
                this.updateHpBars(); 
                if (this.heroHp <= 0) { this.defeatHero(); }
            }
        });
    }

    defeatEnemy(index) {
        if (!this.enemyIllusts[index] || !this.enemyIllusts[index].active) return;
        
        const enemyIllust = this.enemyIllusts[index];
        
        // [추가] ★★★ 배속 적용 ★★★
        const gameSpeed = this.registry.get('gameSpeed') || 1;

        this.add.tween({ 
            targets: enemyIllust, 
            alpha: 0, 
            duration: 500 / gameSpeed, // [수정]
            onComplete: () => {
                enemyIllust.active = false; 
                if(this.enemyHpBarBGs[index]) this.enemyHpBarBGs[index].setVisible(false);
                if(this.enemyHpBarFills[index]) this.enemyHpBarFills[index].setVisible(false);
                if(this.enemyAttackGaugeBGs[index]) this.enemyAttackGaugeBGs[index].setVisible(false);
                if(this.enemyAttackGaugeFills[index]) this.enemyAttackGaugeFills[index].setVisible(false);
                
                let loot = null;
                const allEnemiesDefeated = this.enemyHps.every(hp => hp <= 0);
                
                if (allEnemiesDefeated) {
                     this.combatRunning = false; 
                    console.log("All enemies defeated!");
                     if (Math.random() < this.enemiesData[index].dropRate) {
                         loot = Phaser.Math.RND.pick(ALL_ITEM_KEYS);
                     }
                    if (loot) this.dropItemAnimation(loot, enemyIllust.x, enemyIllust.y);
                    else this.endCombat(null);
                } 
            }
        });
    }
    
    dropItemAnimation(itemKey, x, y) { 
        const itemData = ItemData[itemKey]; 
        const itemIcon = this.add.rectangle(x, y, 20, 20, itemData.color);
        const inventoryCenterSlotX = this.cameras.main.width - 190 + 50; 
        const inventoryCenterSlotY = 415;

        // [추가] ★★★ 배속 적용 ★★★
        const gameSpeed = this.registry.get('gameSpeed') || 1;

        this.add.tween({ 
            targets: itemIcon, 
            x: inventoryCenterSlotX, 
            y: inventoryCenterSlotY, 
            duration: 700 / gameSpeed, // [수정]
            ease: 'Back.easeIn',
            onComplete: () => { itemIcon.destroy(); this.endCombat(itemKey); }
        });
    }
    endCombat(loot) {
        if (!this.scene.isActive()) return; 
        this.combatRunning = false;
        this.input.keyboard.off('keydown-SPACE', this.toggleGamePause, this);
        const gameScene = this.scene.get('GameScene');
        if (gameScene && gameScene.events) { 
            gameScene.events.emit('combatComplete', { loot: loot, heroHp: this.heroHp });
        } else { console.warn("Cannot emit combatComplete: GameScene not found or ready."); }
        this.scene.stop();
    }
    defeatHero() {
        if (!this.combatRunning) return; 
        this.combatRunning = false;
        this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2, 'YOU DIED', { fontSize: '48px', fill: '#ff0000' }).setOrigin(0.5);
        this.heroIllust.active = false; 
        if(this.heroHpBarBG) this.heroHpBarBG.destroy(); 
        if(this.heroHpBarFill) this.heroHpBarFill.destroy(); 
        if(this.heroAttackGaugeBG) this.heroAttackGaugeBG.destroy(); 
        if(this.heroAttackGaugeFill) this.heroAttackGaugeFill.destroy();
        this.time.delayedCall(2000, () => { this.endCombat(null); }, [], this);
    }
} // End of CombatScene class

// --- 3. UI 씬 --- (v8.10 - 오타 없음)
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
        const gameScene = this.scene.get('GameScene');
         this.time.delayedCall(100, () => {
             if (!this.scene.isActive()) {
                console.warn("UIScene create: Scene became inactive before listeners added.");
                return;
             }
             const gameScene = this.scene.get('GameScene'); 
             if (gameScene && gameScene.events) {
                gameScene.events.on('updateDay', this.onUpdateDay, this);
                this.events.on('updateHeroHP', this.updateHeroHP, this); 
                if (this.registry && this.registry.events) { 
                    console.log("UIScene attaching registry listener");
                    this.registry.events.on('changedata-isPaused', this.updatePauseText, this);
                    // [추가] ★★★ 배속 텍스트 리스너 ★★★
                    this.registry.events.on('changedata-gameSpeed', this.updateSpeedText, this);
                    // [추가] ★★★ 루프 카운터 리스너 ★★★
                    this.registry.events.on('changedata-loopCount', this.updateLoopText, this);
                    this.updatePauseText(); 
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
             if (this.scene.isActive()) this.redraw(this.scale.gameSize); 
        }, [], this);
        console.log("UIScene create end");
    }
    shutdown() {
        console.log("UIScene shutdown");
        this.scale.off('resize', this.redraw, this);
        const gameScene = this.scene.get('GameScene'); 
        if (gameScene && gameScene.events) {
                gameScene.events.off('updateDay', this.onUpdateDay, this);
        }
        if (this.registry && this.registry.events) {
            this.registry.events.off('changedata-isPaused', this.updatePauseText, this);
            // [추가] ★★★ 배속 텍스트 리스너 제거 ★★★
            this.registry.events.off('changedata-gameSpeed', this.updateSpeedText, this);
            // [추가] ★★★ 루프 카운터 리스너 제거 ★★★
            this.registry.events.off('changedata-loopCount', this.updateLoopText, this);
        }

        this.events.off('updateHeroHP', this.updateHeroHP, this);
        this.events.off('addItem', this.addItem, this);
        if (this.uiElements) this.uiElements.destroy(true);
        if (this.itemIcons) this.itemIcons.destroy(true);
        this.uiElements = null;
        this.itemIcons = null;
    }
    updateSpeedText(parent, key, data) {
            if (this.speedText) {
                this.speedText.setText(`${data}X`);
            }
    }
    onUpdateDay(day) {
        if (this.dayText) this.dayText.setText(`Day: ${day}`);
    }
    updatePauseText() {
         // [수정] 씬이 활성화 상태가 아니면(종료 중이면) 즉시 중단
         if (!this.scene.isActive()) return;

        if(this.pauseText && this.registry) { 
            const isPaused = this.registry.get('isPaused');
            this.pauseText.setText(isPaused ? '중지' : '진행');
         }    
    }
    redraw(gameSize) {
        console.log("UIScene redraw start", gameSize); 
        const gameWidth = gameSize ? gameSize.width : this.cameras.main.width; 
        const gameHeight = gameSize ? gameSize.height : this.cameras.main.height; 
        if (gameWidth <= 1 || gameHeight <= 1) { console.warn("UIScene redraw skipped due to invalid size:", gameWidth, gameHeight); return; } 
        
        if (this.uiElements) this.uiElements.clear(true, true); else this.uiElements = this.add.group();
        
        this.inventorySlots = []; 
        this.equipSlots = {}; 
        this.UI_START_X = gameWidth - this.UI_WIDTH; 
        
        // --- 상단 바 ---
        const topBar = this.add.graphics().fillStyle(0x666666).fillRect(0, 0, gameWidth, this.TOP_UI_HEIGHT); 
        this.uiElements.add(topBar); 
        
        // [수정] ★★★ 텍스트 흰색 변경 ★★★
        const text1 = this.add.text(10, 15, '시간의 흐름', { fontSize: '10px', fill: '#FFFFFF' }); 
        const gameSceneRef = this.scene.get('GameScene'); 
        const currentDay = (gameSceneRef && typeof gameSceneRef.day === 'number') ? gameSceneRef.day : 1; 
        this.dayText = this.add.text(80, 15, `Day: ${currentDay}`, { fontSize: '14px', fill: '#FFFFFF' }); 

        // [수정] ★★★ '계획' 텍스트(text3) 삭제 ★★★
        
        this.pauseText = this.add.text(gameWidth / 2, this.TOP_UI_HEIGHT / 2, '진행', this.pauseTextStyle).setOrigin(0.5); 
        
        // (배속 텍스트 - v8.15 수정안)
        const currentSpeed = (this.registry && this.registry.get('gameSpeed')) ? this.registry.get('gameSpeed') : 1;
        this.speedText = this.add.text(this.pauseText.x + this.pauseText.width/2 + 10, this.TOP_UI_HEIGHT / 2, `${currentSpeed}X`, this.pauseTextStyle).setOrigin(0, 0.5); // [수정] 위치 조정

        // [수정] ★★★ 루프 텍스트 동적 생성 및 흰색 변경 ★★★
        const currentLoop = (this.registry && this.registry.get('loopCount')) ? this.registry.get('loopCount') : 1;
        this.loopText = this.add.text(gameWidth - this.UI_WIDTH - 150, 15, `${currentLoop}번째 루프`, { fontSize: '14px', fill: '#FFFFFF' }); 

        // [수정] text3, text5 제거 / speedText, loopText 추가
        this.uiElements.addMultiple([text1, this.dayText, this.pauseText, this.speedText, this.loopText]); 
        
        // --- 우측 바 (이하 코드가 누락되었을 수 있음) ---
        const rightBar = this.add.graphics().fillStyle(0x333333).fillRect(this.UI_START_X, 0, this.UI_WIDTH, gameHeight); 
        this.uiElements.add(rightBar); 
        
        const RIGHT_UI_START_X = this.UI_START_X + this.UI_PADDING; 
        let currentY = this.TOP_UI_HEIGHT + this.UI_PADDING; 
        
        // HP/STA
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
        
        // 장비 슬롯
        const EQUIP_SLOT_SIZE = 36; const EQUIP_SLOT_GAP_X = 5; const EQUIP_SLOT_GAP_Y = 10; 
        const helmetLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, 'helmet', this.labelStyle); 
        this.equipSlots['helmet'] = this.createSlot(RIGHT_UI_START_X + 10, currentY + 15, 'helmet', EQUIP_SLOT_SIZE); 
        currentY += EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_Y + 10; 
        const armorLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, 'armor', this.labelStyle); 
        this.equipSlots['armor']  = this.createSlot(RIGHT_UI_START_X + 10, currentY + 15, 'armor', EQUIP_SLOT_SIZE); 
        const weaponLabel = this.add.text(RIGHT_UI_START_X + 10 + EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X, currentY, 'weapon', this.labelStyle); 
        this.equipSlots['weapon'] = this.createSlot(RIGHT_UI_START_X + 10 + EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X, currentY + 15, 'weapon', EQUIP_SLOT_SIZE); 
        const shieldLabel = this.add.text(RIGHT_UI_START_X + 10 + (EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X) * 2, currentY, 'shield', this.labelStyle); 
        this.equipSlots['shield'] = this.createSlot(RIGHT_UI_START_X + 10 + (EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X) * 2, currentY + 15, 'shield', EQUIP_SLOT_SIZE); 
        currentY += EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_Y + 10; 
        const glovesLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, 'gloves', this.labelStyle); 
        this.equipSlots['gloves'] = this.createSlot(RIGHT_UI_START_X + 10, currentY + 15, 'gloves', EQUIP_SLOT_SIZE); 
        const beltLabel = this.add.text(RIGHT_UI_START_X + 10 + EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X, currentY, 'belt', this.labelStyle); 
        this.equipSlots['belt']   = this.createSlot(RIGHT_UI_START_X + 10 + EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X, currentY + 15, 'belt', EQUIP_SLOT_SIZE); 
        const bootsLabel = this.add.text(RIGHT_UI_START_X + 10 + (EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X) * 2, currentY, 'boots', this.labelStyle); 
        this.equipSlots['boots']  = this.createSlot(RIGHT_UI_START_X + 10 + (EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X) * 2, currentY + 15, 'boots', EQUIP_SLOT_SIZE); 
        currentY += EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_Y + 10; 
        this.uiElements.addMultiple([helmetLabel, armorLabel, weaponLabel, shieldLabel, glovesLabel, beltLabel, bootsLabel]); 
        
        // 능력치
        const statsLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, '능력치', this.inventoryLabelStyle); 
        currentY += 20; 
        const damageLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, '피해: +X', this.hpStaTextStyle); 
        currentY += 15; 
        const defenseLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, '방어: +Y', this.hpStaTextStyle); 
        currentY += 25; 
        this.uiElements.addMultiple([statsLabel, damageLabel, defenseLabel]); 
        
        // 인벤토리
        const invLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, 'Inventory', this.inventoryLabelStyle); 
        currentY += 20; 
        this.uiElements.add(invLabel); 
        const INV_SLOT_SIZE = 36; const INV_SLOT_GAP = 5; let slotIndex = 0; 
        for (let y = 0; y < 4; y++) { 
            for (let x = 0; x < 4; x++) { 
                const slotX = RIGHT_UI_START_X + 5 + x * (INV_SLOT_SIZE + INV_SLOT_GAP); 
                const slotY = currentY + y * (INV_SLOT_SIZE + INV_SLOT_GAP); 
                this.inventorySlots.push(this.createSlot(slotX, slotY, slotIndex++, INV_SLOT_SIZE)); 
            } 
        } 
        
        // 기타 UI
        this.selectedHighlight = this.add.graphics().lineStyle(2, 0xcc99ff); 
        this.selectedHighlight.visible = false; 
        this.errorText = this.add.text(this.UI_START_X + this.UI_WIDTH / 2, gameHeight - 30, '', { fontSize: '10px', fill: '#ff0000' }).setOrigin(0.5); 
        this.uiElements.addMultiple([this.selectedHighlight, this.errorText]); 
        
        // 초기화
        let initialHp = 100, initialMaxHp = 100; 
        if (gameSceneRef && gameSceneRef.heroData) { initialHp = gameSceneRef.heroData.hp; initialMaxHp = gameSceneRef.heroData.maxHp; } 
        if (gameSceneRef && gameSceneRef.hero) { initialHp = gameSceneRef.hero.hp; initialMaxHp = gameSceneRef.hero.maxHp; } 
        this.updateHeroHP(initialHp, initialMaxHp); 
        if (gameSceneRef && gameSceneRef.registry) { this.updatePauseText(); } 
        this.refreshInventory(); 
        console.log("UIScene redraw end");
    }   
    updateHeroHP(hp, maxHp) {
        if (!this.scene.isActive() || !this.heroHpText || !this.heroHpBarFill) return;
        this.heroHpText.setText(`HP: ${hp.toFixed(0)}/${maxHp}`); 
        const percent = Math.max(0, hp / maxHp);
        if (typeof this.hpBarWidth === 'number') { this.heroHpBarFill.width = this.hpBarWidth * percent; }
        else { console.warn("hpBarWidth is not defined in updateHeroHP"); }
    }
    createSlot(x, y, key, size = 40) {
        const slot = this.add.rectangle(x, y, size, size).setOrigin(0).setFillStyle(0x333333).setStrokeStyle(1, 0x666666); slot.setData('slotKey', key); slot.setInteractive(); slot.on('pointerdown', () => this.onSlotClick(slot)); 
        if (this.uiElements) this.uiElements.add(slot); 
        return slot;
    }
    onSlotClick(slot) {
        if (!this.scene.isActive()) return;
        const slotKey = slot.getData('slotKey'); if (this.selectedItemIndex !== null) { const itemKey = this.inventory[this.selectedItemIndex]; if (!itemKey) { this.clearSelection(); return; } const itemType = ItemData[itemKey].type; if (this.equipSlots[slotKey]) { if (slotKey === itemType) { this.equipItem(itemKey, slotKey); this.inventory[this.selectedItemIndex] = null; this.clearSelection(); this.refreshInventory(); } else { this.showError('해당 아이템을 장착할 수 없는 위치입니다.'); } } else { this.clearSelection(); } } else { if (typeof slotKey === 'number' && slotKey < this.inventory.length && this.inventory[slotKey]) { this.selectedItemIndex = slotKey; this.selectedHighlight.visible = true; if (this.selectedHighlight) { this.selectedHighlight.clear().lineStyle(2, 0xcc99ff).strokeRect(slot.x, slot.y, slot.width, slot.height); } } }
    }
    addItem(itemKey) {
        if (!this.scene.isActive()) return;
        const emptySlotIndex = this.inventory.indexOf(null); if (emptySlotIndex !== -1) { this.inventory[emptySlotIndex] = itemKey; this.refreshInventory(); } else { this.showError('인벤토리가 가득 찼습니다!'); }
    }
    refreshInventory() {
         if (!this.itemIcons) { console.warn("Item icon group not ready in refreshInventory"); return; } 
         this.itemIcons.clear(true, true); 
         this.inventory.forEach((itemKey, index) => { if (itemKey) { const slot = (index < this.inventorySlots.length) ? this.inventorySlots[index] : null; if (slot) { const itemIcon = this.add.rectangle(slot.x + slot.width/2, slot.y + slot.height/2, slot.width * 0.8, slot.height * 0.8, ItemData[itemKey].color); this.itemIcons.add(itemIcon); } } }); Object.keys(this.equipSlots).forEach(slotKey => { const slot = this.equipSlots[slotKey]; if (slot && typeof slot.getData === 'function' && slot.getData('item')) { const itemKey = slot.getData('item'); const itemIcon = this.add.rectangle(slot.x + slot.width/2, slot.y + slot.height/2, slot.width * 0.8, slot.height * 0.8, ItemData[itemKey].color); this.itemIcons.add(itemIcon); } });
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

    // [추가] ★★★ 배속 텍스트 업데이트 함수 ★★★
    updateSpeedText(parent, key, data) {
        if (this.speedText) {
            this.speedText.setText(`${data}X`);
        }
    }
 
    // [추가] ★★★ 루프 텍스트 업데이트 함수 ★★★
    updateLoopText(parent, key, data) {
        if (this.loopText) {
            this.loopText.setText(`${data}번째 루프`);
        }
    }

        
} // End of UIScene class

// --- Phaser 게임 설정 ---
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
















