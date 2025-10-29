// game.js (v7.4 - SyntaxError 최종 수정)

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

// --- 1. 메인 게임 씬 (필드 탐험) --- (v7.3과 동일)
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
        this.isInitialDrawComplete = false; 
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
        this.scene.run('UIScene'); 
        
        this.pathIndex = 0;
        this.day = 1;
        this.tilesMovedTotal = 0;
        this.enemyTriggers = this.physics.add.group();
        this.mapGraphics = this.add.group();

        this.generateRandomLoop(); 
        
        this.scale.on('resize', this.redraw, this);
        this.events.on('combatComplete', this.onCombatComplete, this);
        
        this.heroData = { hp: 100, maxHp: 100 };
        
        this.time.delayedCall(200, () => { 
             const uiScene = this.scene.get('UIScene');
             if (uiScene && this.scene.isActive('UIScene')) {
                uiScene.events.emit('updateHeroHP', this.heroData.hp, this.heroData.maxHp);
             } else {
                 console.warn("UIScene not active or ready when trying to update HP initially.");
             }
        });

        console.log("GameScene calling initial redraw");
        if (this.pathCoords && this.pathCoords.length > 0) {
            this.time.delayedCall(0, () => {
                 console.log("Executing delayed initial redraw for GameScene");
                this.redraw(this.scale.gameSize); 
            }, [], this);
        } else {
            console.error("Initial redraw skipped: pathCoords is invalid after generation!");
             this.generateDefaultLoop(); 
             if (this.pathCoords && this.pathCoords.length > 0) {
                  this.time.delayedCall(0, () => {
                     console.log("Executing delayed fallback redraw for GameScene");
                    this.redraw(this.scale.gameSize); 
                }, [], this);
             } else {
                 console.error("FATAL: Failed to generate even default loop!");
             }
        }
        console.log("GameScene create end");
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
            if (!this.physics.world.getExistingGroup(this.hero, this.enemyTriggers)) {
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
            } else {
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
             console.warn("calculateMapOffsets using default due to empty pathCoords.");
             return;
        }
        
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.pathCoords.forEach(coord => {
             if (coord && typeof coord.x === 'number' && typeof coord.y === 'number') {
                minX = Math.min(minX, coord.x);
                minY = Math.min(minY, coord.y);
                maxX = Math.max(maxX, coord.x);
                maxY = Math.max(maxY, coord.y);
             } else {
                 console.warn("Invalid coordinate found in pathCoords:", coord);
             }
        });
        
         if (minX === Infinity) {
             this.MAP_OFFSET_X = (gameWidth - this.RIGHT_UI_WIDTH) / 2;
             this.MAP_OFFSET_Y = this.TOP_UI_HEIGHT + (gameHeight - this.TOP_UI_HEIGHT) / 2;
             console.warn("calculateMapOffsets using default due to invalid pathCoords content.");
             return;
         }

        const mapPixelWidth = (maxX - minX + 1) * this.TILE_SIZE;
        const mapPixelHeight = (maxY - minY + 1) * this.TILE_SIZE;

        const gameplayAreaWidth = gameWidth - this.RIGHT_UI_WIDTH;
        const gameplayAreaHeight = gameHeight - this.TOP_UI_HEIGHT;
        
        this.MAP_OFFSET_X = (gameplayAreaWidth / 2) - (mapPixelWidth / 2);
        this.MAP_OFFSET_Y = Math.max(this.TOP_UI_HEIGHT + 20, this.TOP_UI_HEIGHT + (gameplayAreaHeight / 2) - (mapPixelHeight / 2));
    }

    update(time, delta) {
        if (!this.isInitialDrawComplete || !this.hero || !this.hero.active) return;
        this.moveHero();
    }

    generateRandomLoop() {
        this.grid = Array(this.GRID_HEIGHT).fill(0).map(() => Array(this.GRID_WIDTH).fill(0));
        this.pathCoords = [];
        this.specialTileCoords = { [TILE_TYPE_ENEMY2]: [], [TILE_TYPE_ENEMY3]: [], [TILE_TYPE_ENEMY5]: [] };
    
        const minLoopSize = 5;
        const maxLoopSize = 8;
        const baseWidth = Phaser.Math.Between(minLoopSize, maxLoopSize);
        const baseHeight = Phaser.Math.Between(minLoopSize, maxLoopSize);
        
        const startX = Math.floor(this.GRID_WIDTH / 2 - baseWidth / 2);
        const startY = Math.floor(this.GRID_HEIGHT / 2 - baseHeight / 2);
        
        let segments = []; 
    
        segments.push({ start: { x: startX, y: startY }, end: { x: startX + baseWidth, y: startY }, dir: 'right' });
        segments.push({ start: { x: startX + baseWidth, y: startY }, end: { x: startX + baseWidth, y: startY + baseHeight }, dir: 'down' }); 
        segments.push({ start: { x: startX + baseWidth, y: startY + baseHeight }, end: { x: startX, y: startY + baseHeight }, dir: 'left' }); 
        segments.push({ start: { x: startX, y: startY + baseHeight }, end: { x: startX, y: startY }, dir: 'up' }); 
        
        let finalPath = [];
        let totalTiles = 0;
        const maxTiles = 40; 
        
        for(const segment of segments) {
            let segmentPathPoints = []; 
             if (segment.dir === 'right') for (let x = segment.start.x; x <= segment.end.x; x++) segmentPathPoints.push({ x: x, y: segment.start.y });
             else if (segment.dir === 'down') for (let y = segment.start.y; y <= segment.end.y; y++) segmentPathPoints.push({ x: segment.start.x, y: y });
             else if (segment.dir === 'left') for (let x = segment.start.x; x >= segment.end.x; x--) segmentPathPoints.push({ x: x, y: segment.start.y });
             else if (segment.dir === 'up') for (let y = segment.start.y; y >= segment.end.y; y--) segmentPathPoints.push({ x: segment.start.x, y: y });
    
            let detourPathPoints = [];
            let detourApplied = false;
            const len = segmentPathPoints.length;
    
            if (len > 3 && Math.random() < 0.5 && totalTiles + len + 4 < maxTiles) { 
                const detourLength = Phaser.Math.Between(1, 2); 
                const detourStartIdx = Phaser.Math.Between(1, len - 3); 
                const p1 = segmentPathPoints[detourStartIdx];
                const p2 = segmentPathPoints[detourStartIdx + 1];
                 if (!p1 || !p2) {
                     console.warn("Detour skipped: Invalid segment points.");
                     continue; 
                 }
    
                let dx1, dy1, dx2, dy2;
                if (segment.dir === 'right' || segment.dir === 'left') { 
                    dx1 = 0; dy1 = Math.random() < 0.5 ? -1 : 1; 
                    dx2 = (segment.dir === 'right' ? 1 : -1); dy2 = 0; 
                } else { 
                    dx1 = Math.random() < 0.5 ? -1 : 1; dy1 = 0; 
                    dx2 = 0; dy2 = (segment.dir === 'down' ? 1 : -1); 
                }
    
                let possible = true;
                let tempPath = [];
                let cx = p1.x, cy = p1.y;
                
                for(let i=0; i<detourLength; i++) {
                    cx += dx1; cy += dy1;
                    if (cx<1 || cx>=this.GRID_WIDTH-1 || cy<1 || cy>=this.GRID_HEIGHT-1 || (this.grid[cy] && this.grid[cy][cx] !== TILE_TYPE_EMPTY)) { possible = false; break; } 
                    tempPath.push({x: cx, y: cy});
                }
                if(possible) {
                     cx += dx2; cy += dy2;
                     if (cx<1 || cx>=this.GRID_WIDTH-1 || cy<1 || cy>=this.GRID_HEIGHT-1 || (this.grid[cy] && this.grid[cy][cx] !== TILE_TYPE_EMPTY)) { possible = false; }
                     else { tempPath.push({x: cx, y: cy}); }
                }
                if(possible) {
                    for(let i=0; i<detourLength; i++) {
                        cx -= dx1; cy -= dy1; 
                        if (i < detourLength -1 && (cx<1 || cx>=this.GRID_WIDTH-1 || cy<1 || cy>=this.GRID_HEIGHT-1 || (this.grid[cy] && this.grid[cy][cx] !== TILE_TYPE_EMPTY))) { possible = false; break; }
                         if (cx<0 || cx>=this.GRID_WIDTH || cy<0 || cy>=this.GRID_HEIGHT) { possible = false; break;}
                        tempPath.push({x: cx, y: cy});
                    }
                }
                 if (possible && cx === p2.x && cy === p2.y) {
                    detourPathPoints = tempPath;
                    segmentPathPoints.splice(detourStartIdx + 1, 0, ...detourPathPoints.slice(0,-1)); 
                    detourApplied = true;
                    detourPathPoints.forEach(p => {
                        if (!this.grid[p.y]) this.grid[p.y] = []; 
                        this.grid[p.y][p.x] = TILE_TYPE_PATH;
                    }); 
                 }
            }
            
            finalPath.push(...segmentPathPoints.slice(0, -1));
            totalTiles += segmentPathPoints.length -1;
             
             segmentPathPoints.forEach(p => {
                 if (!this.grid[p.y]) this.grid[p.y] = []; 
                 if(this.grid[p.y][p.x] === TILE_TYPE_EMPTY) this.grid[p.y][p.x] = TILE_TYPE_PATH;
             });
        }
        
        if (finalPath.length < 10 || !finalPath[0] || finalPath[0].x !== startX || finalPath[0].y !== startY) {
            console.warn("Deformation loop failed or too short, creating default loop.");
            this.generateDefaultLoop(); 
        } else {
             this.pathCoords = finalPath;
             if (this.pathCoords.length > 0) {
                this.pathCoords.push(this.pathCoords[0]); 
             }
        }
    
        if(this.pathCoords.length > 10) { 
            const pathIndices = Array.from(this.pathCoords.keys()); 
            pathIndices.shift(); 
             pathIndices.pop(); 
            Phaser.Utils.Array.Shuffle(pathIndices); 

            let count2 = 0, count3 = 0, count5 = 0;
            while(pathIndices.length > 0 && (count2 < 2 || count3 < 3 || count5 < 1)) {
                 const index = pathIndices.pop();
                 if (index === undefined) break;
                 const coord = this.pathCoords[index];
                
                 if (coord && this.grid[coord.y] && this.grid[coord.y][coord.x] === TILE_TYPE_PATH) {
                     if (count2 < 2) {
                        this.grid[coord.y][coord.x] = TILE_TYPE_ENEMY2;
                        this.specialTileCoords[TILE_TYPE_ENEMY2].push(coord);
                        count2++;
                     } else if (count3 < 3) {
                         this.grid[coord.y][coord.x] = TILE_TYPE_ENEMY3;
                         this.specialTileCoords[TILE_TYPE_ENEMY3].push(coord);
                         count3++;
                     } else if (count5 < 1) {
                         this.grid[coord.y][coord.x] = TILE_TYPE_ENEMY5;
                         this.specialTileCoords[TILE_TYPE_ENEMY5].push(coord);
                         count5++;
                     }
                 }
            }
        } else if (this.pathCoords.length > 0) {
             console.log("Assigning special tiles for default loop.");
              const pathIndices = Array.from(this.pathCoords.keys()); 
              pathIndices.shift(); 
              Phaser.Utils.Array.Shuffle(pathIndices); 
              if(pathIndices.length > 0) {
                 const idx2 = pathIndices.pop();
                 if(idx2 !== undefined && this.pathCoords[idx2] && this.grid[this.pathCoords[idx2].y]) this.grid[this.pathCoords[idx2].y][this.pathCoords[idx2].x] = TILE_TYPE_ENEMY2;
              }
              if(pathIndices.length > 0) {
                 const idx3 = pathIndices.pop();
                  if(idx3 !== undefined && this.pathCoords[idx3] && this.grid[this.pathCoords[idx3].y]) this.grid[this.pathCoords[idx3].y][this.pathCoords[idx3].x] = TILE_TYPE_ENEMY3;
              }
               if(pathIndices.length > 0) {
                 const idx5 = pathIndices.pop();
                  if(idx5 !== undefined && this.pathCoords[idx5] && this.grid[this.pathCoords[idx5].y]) this.grid[this.pathCoords[idx5].y][this.pathCoords[idx5].x] = TILE_TYPE_ENEMY5;
              }
        }
        
        console.log("Generated loop length:", this.pathCoords.length);
        // console.log("Grid dimensions:", this.grid.length, this.grid[0]?.length); // 디버깅용
        console.log("Special Tiles:", this.specialTileCoords);
    }
    
    generateDefaultLoop() {
        console.log("Generating default loop...");
        this.grid = Array(this.GRID_HEIGHT).fill(0).map(() => Array(this.GRID_WIDTH).fill(0));
        this.pathCoords = [];
        this.specialTileCoords = { [TILE_TYPE_ENEMY2]: [], [TILE_TYPE_ENEMY3]: [], [TILE_TYPE_ENEMY5]: [] }; 
        const loopSize = 5;
        const startX = 5, startY = 5;
        this.startGridPos = {x: startX, y: startY};
        for (let x = startX; x <= startX + loopSize; x++) { this.grid[startY][x] = 1; this.pathCoords.push({ x: x, y: startY }); }
        for (let y = startY + 1; y <= startY + loopSize; y++) { this.grid[y][startX + loopSize] = 1; this.pathCoords.push({ x: startX + loopSize, y: y }); }
        for (let x = startX + loopSize - 1; x >= startX; x--) { this.grid[startY + loopSize][x] = 1; this.pathCoords.push({ x: x, y: startY + loopSize }); }
        for (let y = startY + loopSize - 1; y > startY; y--) { this.grid[y][startX] = 1; this.pathCoords.push({ x: startX, y: y }); }
        if (this.pathCoords.length > 0) {
            this.pathCoords.push(this.pathCoords[0]);
        }
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
         
         if (this.pathCoordsWithOffset.length === 0 && this.pathCoords.length > 0) {
             console.error("FATAL: pathCoordsWithOffset became empty after filtering invalid coordinates!");
         }
    }

    drawTiles(gameWidth, gameHeight) {
        const bgGraphics = this.add.graphics();
        this.mapGraphics.add(bgGraphics);
        
        bgGraphics.fillStyle(0x000000).fillRect(0, 0, gameWidth, gameHeight); 
        
        this.pathCoords.forEach(coord => {
             if (!coord || typeof coord.x !== 'number' || typeof coord.y !== 'number') {
                 console.warn("Skipping drawing invalid tile coordinate:", coord);
                 return;
             }
            const tileX = coord.x * this.TILE_SIZE + this.MAP_OFFSET_X;
            const tileY = coord.y * this.TILE_SIZE + this.MAP_OFFSET_Y;
            
             let tileType = TILE_TYPE_PATH; 
             if (this.grid[coord.y] && this.grid[coord.y][coord.x] !== undefined) {
                 tileType = this.grid[coord.y][coord.x];
                 if (tileType === TILE_TYPE_EMPTY) {
                      console.warn(`Path coordinate ${coord.x},${coord.y} has EMPTY type in grid. Forcing PATH.`);
                     tileType = TILE_TYPE_PATH;
                     this.grid[coord.y][coord.x] = TILE_TYPE_PATH;
                 }
             } else {
                 console.warn(`Tile type not found or invalid in grid for coordinate: ${coord.x}, ${coord.y}. Drawing as default path.`);
                 if (!this.grid[coord.y]) this.grid[coord.y] = [];
                 this.grid[coord.y][coord.x] = TILE_TYPE_PATH;
             }

            let fillColor;
            switch(tileType) {
                case TILE_TYPE_ENEMY2: fillColor = 0x0000ff; break;
                case TILE_TYPE_ENEMY3: fillColor = 0x00ff00; break;
                case TILE_TYPE_ENEMY5: fillColor = 0x800080; break;
                case TILE_TYPE_PATH: 
                default: fillColor = 0x555555; break;
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

        if(this.pathIndex < 0 || this.pathIndex >= this.pathCoordsWithOffset.length) {
            console.error("Invalid pathIndex:", this.pathIndex, "Resetting to 0.");
            this.pathIndex = 0;
            // 추가 검사: 경로 자체가 비었는지
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
            this.pathIndex = (this.pathIndex + 1) % this.pathCoordsWithOffset.length;
            this.tilesMovedTotal++;
            this.tilesMovedSinceLastDay++; 

            if (this.tilesMovedSinceLastDay >= 12) {
                this.advanceDay();
            }
            if (this.pathIndex === 0) { 
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
        
        const uiScene = this.scene.get('UIScene');
        if(uiScene && uiScene.events && this.scene.isActive('UIScene')) { // 활성 상태 확인 추가
             uiScene.events.emit('updateDay', this.day);
        }
        
        if (this.hero) {
            this.hero.hp = this.hero.maxHp;
             if(uiScene && uiScene.events && this.scene.isActive('UIScene')) {
                uiScene.events.emit('updateHeroHP', this.hero.hp, this.hero.maxHp);
             }
        } else if (this.heroData){ 
             this.heroData.hp = this.heroData.maxHp;
        }
        
        this.spawnEnemy1();
        if (this.day % 2 === 0) this.spawnEnemy2();
        if (this.day % 3 === 0) this.spawnEnemy3();
    }

    spawnEnemy1() { 
        if (Math.random() < 0.10) {
            if (this.pathCoordsWithOffset.length < 2) return;
            const spawnIndex = Phaser.Math.Between(1, this.pathCoordsWithOffset.length - 2); 
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
                     const offsetX = Phaser.Math.Between(-this.TILE_SIZE * 0.2, this.TILE_SIZE * 0.2); 
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
        if (!gridCoord || typeof gridCoord.x !== 'number' || typeof gridCoord.y !== 'number') return null;
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
        
        if (!this.hero) return; // 영웅이 이미 파괴된 경우 (Game Over)

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
             const gameOverText = this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2, 'GAME OVER', { fontSize: '40px', fill: '#ff0000' }).setOrigin(0.5);
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
        if (gameScene && gameScene.events) { 
            gameScene.events.emit('combatComplete', { 
                loot: loot, 
                heroHp: this.heroHp 
            });
        } else {
             console.warn("Cannot emit combatComplete: GameScene not found or ready.");
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
        if (gameScene && gameScene.events) {
            gameScene.events.on('updateDay', (day) => {
                if (this.dayText) this.dayText.setText(`Day: ${day}`);
            }, this);
            gameScene.events.on('updateHeroHP', this.updateHeroHP, this);
        } else {
             console.warn("UIScene create: GameScene not ready for event listeners yet.");
        }
        this.events.on('addItem', this.addItem, this);
        
        console.log("UIScene calling initial redraw");
        // [수정] redraw 호출을 create 완료 후 안전하게 하기 위해 delayedCall 사용
        this.time.delayedCall(0, () => {
             console.log("Executing delayed initial redraw for UIScene");
            this.redraw(this.scale.gameSize);
        }, [], this);
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
        const currentDay = (gameSceneRef && typeof gameSceneRef.day === 'number') ? gameSceneRef.day : 1;
        this.dayText = this.add.text(80, 15, `Day: ${currentDay}`, { fontSize: '14px', fill: '#000000' });
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
        if (gameSceneRef && gameSceneRef.heroData) { 
            initialHp = gameSceneRef.heroData.hp;
            initialMaxHp = gameSceneRef.heroData.maxHp;
        } 
        if (gameSceneRef && gameSceneRef.hero) { 
             initialHp = gameSceneRef.hero.hp;
             initialMaxHp = gameSceneRef.hero.maxHp;
        } 
        this.updateHeroHP(initialHp, initialMaxHp);
        this.refreshInventory();
        console.log("UIScene redraw end");
    }
    
    updateHeroHP(hp, maxHp) {
        if (!this.scene.isActive() || !this.heroHpText || !this.heroHpBarFill) return;
        this.heroHpText.setText(`HP: ${hp}/${maxHp}`);
        const percent = Math.max(0, hp / maxHp);
        // hpBarWidth가 redraw 이전에 정의되지 않았을 수 있으므로 확인
        if (typeof this.hpBarWidth === 'number') {
            this.heroHpBarFill.width = this.hpBarWidth * percent;
        } else {
             console.warn("hpBarWidth is not defined in updateHeroHP");
        }
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
            if (typeof slotKey === 'number' && slotKey < this.inventory.length && this.inventory[slotKey]) { 
                this.selectedItemIndex = slotKey;
                this.selectedHighlight.visible = true;
                if (this.selectedHighlight) {
                     this.selectedHighlight.clear().lineStyle(2, 0xcc99ff).strokeRect(slot.x, slot.y, slot.width, slot.height);
                }
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
        if (!this.itemIcons) {
             console.warn("Item icon group not ready in refreshInventory");
             return;
        }
        this.itemIcons.clear(true, true);

        this.inventory.forEach((itemKey, index) => {
            if (itemKey) {
                const slot = (index < this.inventorySlots.length) ? this.inventorySlots[index] : null; 
                if (slot) { 
                    const itemIcon = this.add.rectangle(slot.x + slot.width/2, slot.y + slot.height/2, slot.width * 0.8, slot.height * 0.8, ItemData[itemKey].color);
                    this.itemIcons.add(itemIcon);
                } else {
                    // redraw 중 슬롯이 아직 생성되지 않았을 수 있음, 다음 redraw에서 그려짐
                    // console.warn(`Inventory slot at index ${index} not found during refresh.`);
                }
            }
        });
        Object.keys(this.equipSlots).forEach(slotKey => {
            const slot = this.equipSlots[slotKey];
            if (slot && typeof slot.getData === 'function' && slot.getData('item')) { 
                const itemKey = slot.getData('item');
                const itemIcon = this.add.rectangle(slot.x + slot.width/2, slot.y + slot.height/2, slot.width * 0.8, slot.height * 0.8, ItemData[itemKey].color);
                this.itemIcons.add(itemIcon);
            }
        });
    }
    
    equipItem(itemKey, slotKey) {
        const slot = this.equipSlots[slotKey];
        if (slot && typeof slot.setData === 'function') {
             slot.setData('item', itemKey);
        } else {
             console.error(`Equip slot ${slotKey} not found or invalid.`);
        }
    }
    
    clearSelection() {
        this.selectedItemIndex = null;
        if (this.selectedHighlight) {
             this.selectedHighlight.visible = false;
        }
    }
    
    showError(message) {
        if (this.errorText) {
            this.errorText.setText(message);
            // 씬이 활성 상태일 때만 타이머 설정
             if (this.scene.isActive()) {
                this.time.delayedCall(2000, () => {
                    if(this.errorText) this.errorText.setText('');
                });
             }
        }
    } // [수정] ★★★ showError 함수의 닫는 중괄호 추가 ★★★
} // End of UIScene class

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
