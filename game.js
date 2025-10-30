// game.js (v8.10 - 모든 오타 및 문법 오류 수정)

// --- 데이터 정의 ---
const ItemData = {
    'sword':    { name: '검', type: 'weapon', color: 0x8B4513 }, 'shield':   { name: '방패', type: 'shield', color: 0x8B4513 },
    'helmet':   { name: '투구', type: 'helmet', color: 0x8B4513 }, 'armor':    { name: '갑옷', type: 'armor', color: 0x8B4513 },
    'gloves':   { name: '장갑', type: 'gloves', color: 0x8B4513 }, 'belt':     { name: '허리띠', type: 'belt',   color: 0x8B4513 },
    'boots':    { name: '장화', type: 'boots',  color: 0x8B4513 }
};
const ALL_ITEM_KEYS = Object.keys(ItemData);
const EnemyData = {
    'goblin':   { name: '고블린', hp: 30, atk: 5, color: 0x00aa00, dropRate: 0.10, illustKey: 'goblin_illust', attackTime: 1.0 },
    'skeleton': { name: '해골',   hp: 50, atk: 3, color: 0xeeeeee, dropRate: 0.15, illustKey: 'skeleton_illust', attackTime: 1.0 },
    'orc':      { name: '오크',   hp: 80, atk: 8, color: 0x008800, dropRate: 0.20, illustKey: 'orc_illust',    attackTime: 1.0 },
    'demon':    { name: '악마',   hp: 40, atk: 12, color: 0xcc0000, dropRate: 0.25, illustKey: 'demon_illust',  attackTime: 1.0 },
    'slime':    { name: '슬라임', hp: 20, atk: 2, color: 0x00ffff, dropRate: 0.05, illustKey: 'slime_illust',    attackTime: 1.0 }
};
const SPAWNABLE_ENEMY_KEYS = ['goblin', 'skeleton', 'orc', 'slime'];
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
    }

    create() {
        console.log("GameScene create start");
        this.scene.run('UIScene');
        this.registry.set('isPaused', false);
        this.pathIndex = 0; this.day = 1; this.tilesMovedTotal = 0;
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
        this.input.keyboard.on('keydown-R', this.restartGame, this); // 언제든 재시작

        console.log("GameScene create end");
    }
    
    shutdown() {
        console.log("GameScene shutdown");
        this.scale.off('resize', this.redraw, this);
        this.events.off('combatComplete', this.onCombatComplete, this);
        this.input.keyboard.off('keydown-SPACE', this.togglePause, this);
        this.input.keyboard.off('keydown-R', this.restartGame, this); 
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
        this.pathCoordsWithOffset = this.pathCoords.map(coord => { if (!coord || typeof coord.x !== 'number' || typeof coord.y !== 'number') { console.warn("Invalid coordinate in pathCoords during offset update:", coord); return null; } return new Phaser.Math.Vector2( coord.x * this.TILE_SIZE + this.
