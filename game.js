// game.js (v8.2 - 전투 중 일시정지, HP 동기화, 단일 경로 루프)

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
    'goblin':   { name: '고블린', hp: 30, atk: 5, color: 0x00aa00, dropRate: 0.10, illustKey: 'goblin_illust', attackTime: 1.0 },
    'skeleton': { name: '해골',   hp: 50, atk: 3, color: 0xeeeeee, dropRate: 0.15, illustKey: 'skeleton_illust', attackTime: 1.0 },
    'orc':      { name: '오크',   hp: 80, atk: 8, color: 0x008800, dropRate: 0.20, illustKey: 'orc_illust',    attackTime: 1.0 },
    'demon':    { name: '악마',   hp: 40, atk: 12, color: 0xcc0000, dropRate: 0.25, illustKey: 'demon_illust',  attackTime: 1.0 },
    'slime':    { name: '슬라임', hp: 20, atk: 2, color: 0x00ffff, dropRate: 0.05, illustKey: 'slime_illust',    attackTime: 1.0 }
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
        this.isInitialDrawComplete = false;
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
                // UIScene이 Registry 이벤트를 수신하도록 설정 (UIScene create에서 처리)
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
         // UIScene은 Registry 변경을 감지하여 스스로 업데이트함
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

        const avgPixelX_noOffset = avgGridX * this.TILE_SIZE + this.TILE_SIZE / 2;
        const avgPixelY_noOffset = avgGridY * this.TILE_SIZE + this.TILE_SIZE / 2;

        this.MAP_OFFSET_X = gameplayCenterX - avgPixelX_noOffset;
        this.MAP_OFFSET_Y = gameplayCenterY - avgPixelY_noOffset;

         console.log(`Calculated Offsets: X=${this.MAP_OFFSET_X.toFixed(1)}, Y=${this.MAP_OFFSET_Y.toFixed(1)}`);
    }

    update(time, delta) {
        if (this.registry.get('isPaused')) {
             if (this.hero && this.hero.body) { this.hero.body.setVelocity(0, 0); } // [수정] stop() 대신 velocity 0
            return;
        }
        if (!this.isInitialDrawComplete || !this.hero || !this.hero.active) return;
        this.moveHero();
    }

    // [수정] ★★★ 단일 경로 루프 생성 (개선된 방식) ★★★
    generateRandomLoop() {
        this.grid = Array(this.GRID_HEIGHT).fill(0).map(() => Array(this.GRID_WIDTH).fill(TILE_TYPE_EMPTY));
        this.pathCoords = [];
        this.specialTileCoords = { [TILE_TYPE_ENEMY2]: [], [TILE_TYPE_ENEMY3]: [], [TILE_TYPE_ENEMY5]: [] };
        
        const minLoopSize = 5;
        const maxLoopSize = 7;
        const baseWidth = Phaser.Math.Between(minLoopSize, maxLoopSize);
        const baseHeight = Phaser.Math.Between(minLoopSize, maxLoopSize);
        const startX = Math.floor(this.GRID_WIDTH / 2 - baseWidth / 2);
        const startY = Math.floor(this.GRID_HEIGHT / 2 - baseHeight / 2);

        let tempPath = []; // 경로 점들을 순서대로 저장할 임시 배열

        // 1. 기본 사각 루프 경로 생성
        for (let x = startX; x < startX + baseWidth; x++) tempPath.push({ x: x, y: startY });
        for (let y = startY; y < startY + baseHeight; y++) tempPath.push({ x: startX + baseWidth, y: y });
        for (let x = startX + baseWidth; x > startX; x--) tempPath.push({ x: x, y: startY + baseHeight });
        for (let y = startY + baseHeight; y > startY; y--) tempPath.push({ x: startX, y: y });

        // 2. 경로 변형 (Push/Pull 방식 개선)
        let finalPath = [];
        const deformationChance = 0.4;
        const maxDeformation = 2;

        for (let i = 0; i < tempPath.length; i++) {
            const p1 = tempPath[i];
            const p2 = tempPath[(i + 1) % tempPath.length]; // 다음 점 (Wrap around)
            finalPath.push(p1); // 현재 점 추가

            // 변의 방향 및 길이 확인
            let dx = p2.x - p1.x;
            let dy = p2.y - p1.y;
            let isSegment = (Math.abs(dx) + Math.abs(dy) === 1); // 직선 이동인가?

            // 변형 시도 (코너 제외, 확률 기반)
            if (isSegment && Math.random() < deformationChance) {
                 const isHorizontal = (dy === 0);
                 const pushAmount = Phaser.Math.Between(1, maxDeformation);
                 const pushDir = Math.random() < 0.5 ? -1 : 1; // 수직 또는 수평으로 밀 방향
                 
                 let detourPoints = [];
                 let current = {...p1}; // 현재 위치 복사
                 let possible = true;

                 // 밀어내기 경로 생성 및 검사
                 for (let j = 0; j < pushAmount; j++) {
                     if (isHorizontal) current.y += pushDir; else current.x += pushDir;
                     if (current.x < 1 || current.x >= this.GRID_WIDTH - 1 || current.y < 1 || current.y >= this.GRID_HEIGHT - 1 || this.grid[current.y]?.[current.x] !== TILE_TYPE_EMPTY) { possible = false; break; }
                     detourPoints.push({...current});
                 }
                 // 평행 이동 경로 생성 및 검사
                 if (possible) {
                    if (isHorizontal) current.x += dx; else current.y += dy;
                    if (current.x < 1 || current.x >= this.GRID_WIDTH - 1 || current.y < 1 || current.y >= this.GRID_HEIGHT - 1 || this.grid[current.y]?.[current.x] !== TILE_TYPE_EMPTY) { possible = false; }
                     else { detourPoints.push({...current}); }
                 }
                 // 복귀 경로 생성 및 검사
                 if (possible) {
                    for (let j = 0; j < pushAmount; j++) {
                        if (isHorizontal) current.y -= pushDir; else current.x -= pushDir;
                         // 마지막 복귀 지점(p2)는 검사 안 함
                        if (j < pushAmount - 1) {
                             if (current.x < 1 || current.x >= this.GRID_WIDTH - 1 || current.y < 1 || current.y >= this.GRID_HEIGHT - 1 || this.grid[current.y]?.[current.x] !== TILE_TYPE_EMPTY) { possible = false; break; }
                        } else {
                             // 최종 경계 검사
                              if (current.x < 0 || current.x >= this.GRID_WIDTH || current.y < 0 || current.y >= this.GRID_HEIGHT) { possible = false; break;}
                        }
                        detourPoints.push({...current});
                    }
                 }

                 // 최종 도착점 확인 및 경로 추가
                 if (possible && current.x === p2.x && current.y === p2.y) {
                    // Detour 성공
                    finalPath.push(...detourPoints.slice(0, -1)); // p2 제외하고 삽입
                    // grid에 경로 임시 표시 (나중에 최종 경로로 덮어씀)
                    detourPoints.forEach(p => { if(!this.grid[p.y]) this.grid[p.y]=[]; this.grid[p.y][p.x] = TILE_TYPE_PATH; });
                    i++; // 다음 점(p2) 건너뛰기
                    continue; // 다음 루프 반복으로
                 }
            }
            // Detour 없으면 grid에 현재 점만 표시
             if(p1.y >= 0 && p1.y < this.GRID_HEIGHT && p1.x >= 0 && p1.x < this.GRID_WIDTH) {
                if (!this.grid[p1.y]) this.grid[p1.y] = [];
                 // 이미 Detour 경로가 표시된 곳은 덮어쓰지 않음
                if (this.grid[p1.y][p1.x] === TILE_TYPE_EMPTY) {
                    this.grid[p1.y][p1.x] = TILE_TYPE_PATH;
                }
             }
        } // end of for loop

        // 3. 최종 경로 정리 및 grid 확정
        this.pathCoords = finalPath;
        // grid 초기화 후 최종 경로만 다시 표시
        this.grid = Array(this.GRID_HEIGHT).fill(0).map(() => Array(this.GRID_WIDTH).fill(TILE_TYPE_EMPTY));
        this.pathCoords.forEach(p => {
             if (p.y >= 0 && p.y < this.GRID_HEIGHT && p.x >= 0 && p.x < this.GRID_WIDTH) {
                if(!this.grid[p.y]) this.grid[p.y] = [];
                this.grid[p.y][p.x] = TILE_TYPE_PATH;
             }
        });

        // 시작점으로 닫기
        if (this.pathCoords.length > 0 && 
            (this.pathCoords[this.pathCoords.length-1].x !== this.pathCoords[0].x || 
             this.pathCoords[this.pathCoords.length-1].y !== this.pathCoords[0].y))
        {
             this.pathCoords.push(this.pathCoords[0]); 
        }

        // 경로 길이 및 유효성 검사, Fallback
        if (this.pathCoords.length < 10) {
             console.warn("Final loop is too short, creating default loop.");
             this.generateDefaultLoop(); 
        }

        // --- 특수 타일 지정 --- (이전과 동일)
        if(this.pathCoords.length > 10) { 
            const pathIndices = Array.from(this.pathCoords.keys()); 
            pathIndices.shift(); // 시작점 제외
             if(pathIndices.length > 0) pathIndices.pop(); // 끝점 제외
            Phaser.Utils.Array.Shuffle(pathIndices); 

            let count2 = 0, count3 = 0, count5 = 0;
            const targetCounts = { enemy2: 2, enemy3: 3, enemy5: 1 };

            while(pathIndices.length > 0 && (count2 < targetCounts.enemy2 || count3 < targetCounts.enemy3 || count5 < targetCounts.enemy5)) {
                 const index = pathIndices.pop();
                 if (index === undefined) break;
                 const coord = this.pathCoords[index];
                
                 if (coord && coord.y >= 0 && coord.y < this.GRID_HEIGHT && coord.x >= 0 && coord.x < this.GRID_WIDTH && 
                     this.grid[coord.y]?.[coord.x] === TILE_TYPE_PATH) { // grid[y] 존재 확인 추가
                     if (count2 < targetCounts.enemy2) {
                        this.grid[coord.y][coord.x] = TILE_TYPE_ENEMY2;
                        this.specialTileCoords[TILE_TYPE_ENEMY2].push(coord);
                        count2++;
                     } else if (count3 < targetCounts.enemy3) {
                         this.grid[coord.y][coord.x] = TILE_TYPE_ENEMY3;
                         this.specialTileCoords[TILE_TYPE_ENEMY3].push(coord);
                         count3++;
                     } else if (count5 < targetCounts.enemy5) {
                         this.grid[coord.y][coord.x] = TILE_TYPE_ENEMY5;
                         this.specialTileCoords[TILE_TYPE_ENEMY5].push(coord);
                         count5++;
                     }
                 }
            }
             // 혹시 타일 수가 부족해 다 지정 못했는지 확인
             if (count2 < targetCounts.enemy2) console.warn(`Could only place ${count2}/${targetCounts.enemy2} enemy2 tiles.`);
             if (count3 < targetCounts.enemy3) console.warn(`Could only place ${count3}/${targetCounts.enemy3} enemy3 tiles.`);
             if (count5 < targetCounts.enemy5) console.warn(`Could only place ${count5}/${targetCounts.enemy5} enemy5 tiles.`);

        } else if (this.pathCoords.length > 0) { // Default loop Fallback
             console.log("Assigning special tiles for default loop.");
              const pathIndices = Array.from(this.pathCoords.keys()); 
              pathIndices.shift(); 
               if(pathIndices.length > 0) pathIndices.pop();
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
        
        console.log("Final loop length:", this.pathCoords.length);
        console.log("Final Special Tiles:", this.specialTileCoords);
    }
    
    generateDefaultLoop() {
        // ... (v8.1과 동일) ...
        console.log("Generating default loop...");
        this.grid = Array(this.GRID_HEIGHT).fill(0).map(() => Array(this.GRID_WIDTH).fill(TILE_TYPE_EMPTY)); // EMPTY로 초기화
        this.pathCoords = [];
        this.specialTileCoords = { [TILE_TYPE_ENEMY2]: [], [TILE_TYPE_ENEMY3]: [], [TILE_TYPE_ENEMY5]: [] };
        const loopSize = 5;
        const startX = 5, startY = 5;
        for (let x = startX; x <= startX + loopSize; x++) { this.grid[startY][x] = TILE_TYPE_PATH; this.pathCoords.push({ x: x, y: startY }); }
        for (let y = startY + 1; y <= startY + loopSize; y++) { this.grid[y][startX + loopSize] = TILE_TYPE_PATH; this.pathCoords.push({ x: startX + loopSize, y: y }); }
        for (let x = startX + loopSize - 1; x >= startX; x--) { this.grid[startY + loopSize][x] = TILE_TYPE_PATH; this.pathCoords.push({ x: x, y: startY + loopSize }); }
        for (let y = startY + loopSize - 1; y > startY; y--) { this.grid[y][startX] = TILE_TYPE_PATH; this.pathCoords.push({ x: startX, y: y }); }
        if (this.pathCoords.length > 0) {
            this.pathCoords.push(this.pathCoords[0]); // 시작점으로 닫기
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
        // ... (v8.1과 동일) ...
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
                case TILE_TYPE_ENEMY2: fillColor = 0x0000ff; break;
                case TILE_TYPE_ENEMY3: fillColor = 0x00ff00; break;
                case TILE_TYPE_ENEMY5: fillColor = 0x800080; break;
                case TILE_TYPE_PATH: default: fillColor = 0x555555; break;
            }
            const tileGraphics = this.add.graphics();
            this.mapGraphics.add(tileGraphics); 
            tileGraphics.fillStyle(fillColor).fillRect(tileX, tileY, this.TILE_SIZE, this.TILE_SIZE).lineStyle(1, 0x8B4513).strokeRect(tileX, tileY, this.TILE_SIZE, this.TILE_SIZE);
        });
    }

    moveHero() {
        // ... (v8.1과 동일) ...
         if (!this.hero || !this.hero.body || !this.pathCoordsWithOffset || this.pathCoordsWithOffset.length === 0) return;
        if(this.pathIndex < 0 || this.pathIndex >= this.pathCoordsWithOffset.length) { this.pathIndex = 0; if (this.pathCoordsWithOffset.length === 0) return; }
        const targetPos = this.pathCoordsWithOffset[this.pathIndex];
        if (!targetPos || typeof targetPos.x !== 'number' || typeof targetPos.y !== 'number') { this.pathIndex = (this.pathIndex + 1) % this.pathCoordsWithOffset.length; return; }
        const distance = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, targetPos.x, targetPos.y);
        if (distance < 4) {
            this.pathIndex = (this.pathIndex + 1) % this.pathCoordsWithOffset.length;
            this.tilesMovedTotal++; this.tilesMovedSinceLastDay++; 
            if (this.tilesMovedSinceLastDay >= 12) { this.advanceDay(); }
            if (this.pathIndex === 0) { this.spawnEnemy5(); }
        } else { this.physics.moveTo(this.hero, targetPos.x, targetPos.y, 150); }
    }
    
    advanceDay() {
        // ... (v8.1과 동일) ...
        if (this.registry.get('isPaused')) return; 
        this.day++; this.tilesMovedSinceLastDay = 0; console.log(`Day ${this.day} started`);
        const uiScene = this.scene.get('UIScene');
        if(uiScene && uiScene.events && this.scene.isActive('UIScene')) { uiScene.events.emit('updateDay', this.day); }
        if (this.hero) { this.hero.hp = this.hero.maxHp; if(uiScene && uiScene.events && this.scene.isActive('UIScene')) { uiScene.events.emit('updateHeroHP', this.hero.hp, this.hero.maxHp); } } 
        else if (this.heroData){ this.heroData.hp = this.heroData.maxHp; }
        this.spawnEnemy1();
        if (this.day % 2 === 0) this.spawnEnemy2();
        if (this.day % 3 === 0) this.spawnEnemy3();
    }

    spawnEnemy1() { 
        // ... (v8.1과 동일) ...
        if (Math.random() < 0.10) { if (this.pathCoordsWithOffset.length < 2) return; const spawnIndex = Phaser.Math.Between(1, this.pathCoordsWithOffset.length - 2); const spawnPos = this.pathCoordsWithOffset[spawnIndex]; if(spawnPos) this.spawnEnemyTriggerAt('goblin', spawnPos.x, spawnPos.y); }
    }
    spawnEnemy2() { 
        // ... (v8.1과 동일) ...
        this.specialTileCoords[TILE_TYPE_ENEMY2].forEach(coord => { const spawnPos = this.getPixelCoord(coord); if(spawnPos) this.spawnEnemyTriggerAt('skeleton', spawnPos.x, spawnPos.y); });
    }
    spawnEnemy3() { 
        // ... (v8.1과 동일) ...
        this.specialTileCoords[TILE_TYPE_ENEMY3].forEach(coord => { const spawnPos = this.getPixelCoord(coord); if(spawnPos) this.spawnEnemyTriggerAt('orc', spawnPos.x, spawnPos.y); });
    }
    spawnEnemy5() { 
        // ... (v8.1과 동일) ...
         if (this.specialTileCoords[TILE_TYPE_ENEMY5].length > 0) { const coord = this.specialTileCoords[TILE_TYPE_ENEMY5][0]; const spawnPos = this.getPixelCoord(coord); if (spawnPos) { for(let i=0; i<3; i++) { const offsetX = Phaser.Math.Between(-this.TILE_SIZE * 0.2, this.TILE_SIZE * 0.2); const offsetY = Phaser.Math.Between(-this.TILE_SIZE * 0.2, this.TILE_SIZE * 0.2); this.spawnEnemyTriggerAt('slime', spawnPos.x + offsetX, spawnPos.y + offsetY); } } }
    }

    spawnEnemyTriggerAt(enemyKey, x, y) {
        // ... (v8.1과 동일) ...
        if (!EnemyData[enemyKey]) return; console.log(`Spawning ${enemyKey} at (${x.toFixed(0)}, ${y.toFixed(0)})`); const enemy = this.enemyTriggers.create(x, y, 'pixel').setDisplaySize(this.TILE_SIZE * 0.4, this.TILE_SIZE * 0.4).setTint(EnemyData[enemyKey].color); enemy.enemyKey = enemyKey; enemy.setDepth(1); 
    }
    
    getPixelCoord(gridCoord) {
        // ... (v8.1과 동일) ...
        if (!gridCoord || typeof gridCoord.x !== 'number' || typeof gridCoord.y !== 'number') return null; return new Phaser.Math.Vector2( gridCoord.x * this.TILE_SIZE + this.TILE_SIZE / 2 + this.MAP_OFFSET_X, gridCoord.y * this.TILE_SIZE + this.TILE_SIZE / 2 + this.MAP_OFFSET_Y );
    }

    onMeetEnemy(hero, enemyTrigger) {
        // ... (v8.1과 동일) ...
        if (!this.hero || !this.hero.body || this.registry.get('isPaused')) return; 
        this.hero.body.stop(); const enemyKey = enemyTrigger.enemyKey; const combatData = { enemyData: EnemyData[enemyKey], heroHp: this.hero.hp, heroMaxHp: this.hero.maxHp, heroAttackTime: this.heroData.attackTime };
        this.scene.pause(); this.scene.launch('CombatScene', combatData); enemyTrigger.destroy();
    }
    
    onCombatComplete(data) {
        // ... (v8.1과 동일) ...
        if (!this.hero) return; 
        this.hero.hp = data.heroHp;
        const uiScene = this.scene.get('UIScene'); if(uiScene && this.scene.isActive('UIScene')) { uiScene.events.emit('updateHeroHP', this.hero.hp, this.hero.maxHp); }
        if (data.loot) { if(uiScene && this.scene.isActive('UIScene')) { uiScene.events.emit('addItem', data.loot); } }
        if (this.hero.hp <= 0) { this.hero.destroy(); this.hero = null; const gameOverText = this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2, 'GAME OVER', { fontSize: '40px', fill: '#ff0000' }).setOrigin(0.5); gameOverText.setDepth(10); } 
        else { this.scene.resume(); console.log("GameScene calling redraw after combat"); this.time.delayedCall(0, () => { this.redraw(this.scale.gameSize); }, [], this); }
    }
} // End of GameScene class

// --- 2. 전투 씬 --- (일시정지 토글 추가, HP 동기화 이벤트 추가)
class CombatScene extends Phaser.Scene {
    constructor() {
        super('CombatScene');
        this.combatRunning = false;
        
        this.heroAttackGauge = 0;
        this.enemyAttackGauge = 0;
        this.heroAttackSpeed = 0;
        this.enemyAttackSpeed = 0;
    }
    
    init(data) {
        this.enemyData = data.enemyData;
        this.heroHp = data.heroHp;
        this.heroMaxHp = data.heroMaxHp;
        this.enemyHp = this.enemyData.hp;
        this.enemyMaxHp = this.enemyData.hp;
        
        this.heroAttackSpeed = 100 / (data.heroAttackTime || 0.8); 
        this.enemyAttackSpeed = 100 / (this.enemyData.attackTime || 1.0); 
    }
    
    create() {
        const gameWidth = this.cameras.main.width;
        const gameHeight = this.cameras.main.height;
        
        const combatPanelWidth = gameWidth * 0.5;
        const combatPanelHeight = gameHeight * 0.5;
        const combatPanelX = (gameWidth - combatPanelWidth) / 2;
        const combatPanelY = (gameHeight - combatPanelHeight) / 2;
        
        this.add.graphics().fillStyle(0x000000, 0.7).fillRect(0, 0, gameWidth, gameHeight); 
        
        const combatPanel = this.add.graphics()
            .fillStyle(0x333333)
            .fillRect(combatPanelX, combatPanelY, combatPanelWidth, combatPanelHeight)
            .lineStyle(2, 0x8B4513)
            .strokeRect(combatPanelX, combatPanelY, combatPanelWidth, combatPanelHeight);
        
        this.heroIllust = this.add.image(combatPanelX + combatPanelWidth * 0.3, combatPanelY + combatPanelHeight * 0.65, 'pixel') 
                            .setDisplaySize(120, 160).setTint(0x00ffff);
        this.enemyIllust = this.add.image(combatPanelX + combatPanelWidth * 0.7, combatPanelY + combatPanelHeight * 0.65, 'pixel') 
                            .setDisplaySize(120, 160).setTint(this.enemyData.color); 
        
        const hpBarWidth = 100;
        const hpBarHeight = 10;
        const heroHpBarX = this.heroIllust.x - hpBarWidth / 2; 
        const heroHpBarY = this.heroIllust.y - 100; 
        const enemyHpBarX = this.enemyIllust.x - hpBarWidth / 2; 
        const enemyHpBarY = this.enemyIllust.y - 100; 
        
        this.heroHpBarBG = this.add.rectangle(heroHpBarX, heroHpBarY, hpBarWidth, hpBarHeight, 0xff0000).setOrigin(0);
        this.heroHpBarFill = this.add.rectangle(heroHpBarX, heroHpBarY, hpBarWidth, hpBarHeight, 0x00ff00).setOrigin(0);
        this.enemyHpBarBG = this.add.rectangle(enemyHpBarX, enemyHpBarY, hpBarWidth, hpBarHeight, 0xff0000).setOrigin(0);
        this.enemyHpBarFill = this.add.rectangle(enemyHpBarX, enemyHpBarY, hpBarWidth, hpBarHeight, 0x00ff00).setOrigin(0);
        
        const attackGaugeWidth = hpBarWidth; 
        const attackGaugeHeight = hpBarHeight * 0.25; 
        const heroAttackGaugeY = heroHpBarY + hpBarHeight + 2; 
        const enemyAttackGaugeY = enemyHpBarY + hpBarHeight + 2;

        this.heroAttackGaugeBG = this.add.rectangle(heroHpBarX, heroAttackGaugeY, attackGaugeWidth, attackGaugeHeight, 0x555555).setOrigin(0); 
        this.heroAttackGaugeFill = this.add.rectangle(heroHpBarX, heroAttackGaugeY, 0, attackGaugeHeight, 0xffff00).setOrigin(0); 
        this.enemyAttackGaugeBG = this.add.rectangle(enemyHpBarX, enemyAttackGaugeY, attackGaugeWidth, attackGaugeHeight, 0x555555).setOrigin(0);
        this.enemyAttackGaugeFill = this.add.rectangle(enemyHpBarX, enemyAttackGaugeY, 0, attackGaugeHeight, 0xffff00).setOrigin(0);

        this.updateHpBars(); 
        this.updateAttackGauges(); 
        
        this.combatRunning = true;

        // [신규] ★★★ 전투 씬에서도 스페이스바 입력 감지 ★★★
        this.input.keyboard.on('keydown-SPACE', this.toggleGamePause, this);
    }
    
    // [신규] ★★★ GameScene의 일시정지 토글 함수 호출 ★★★
    toggleGamePause() {
        const gameScene = this.scene.get('GameScene');
        if (gameScene) {
             gameScene.togglePause(); // GameScene의 함수 직접 호출
        }
    }

    update(time, delta) {
        if (!this.combatRunning) return;

        const deltaSeconds = delta / 1000; 

        this.heroAttackGauge += this.heroAttackSpeed * deltaSeconds;
        if (this.heroAttackGauge >= 100) {
            this.heroAttackGauge = 0; 
            this.playerAttack();      
             if (!this.combatRunning) return; 
        }

        this.enemyAttackGauge += this.enemyAttackSpeed * deltaSeconds;
        if (this.enemyAttackGauge >= 100) {
            this.enemyAttackGauge = 0; 
             if (this.enemyIllust.active && this.enemyHp > 0) { 
                 this.enemyAttack();       
                  if (!this.combatRunning) return; 
             }
        }
        this.updateAttackGauges();
    }
    
    updateHpBars() {
        const barWidth = 100;
        const heroPercent = Math.max(0, this.heroHp / this.heroMaxHp);
        this.heroHpBarFill.width = barWidth * heroPercent; 

        const enemyPercent = Math.max(0, this.enemyHp / this.enemyMaxHp);
        this.enemyHpBarFill.width = barWidth * enemyPercent;
        
        // [신규] ★★★ UI 씬으로 HP 업데이트 이벤트 전송 ★★★
        const uiScene = this.scene.get('UIScene');
        if (uiScene && this.scene.isActive('UIScene')) { // UIScene 활성 확인
             uiScene.events.emit('updateHeroHP', this.heroHp, this.heroMaxHp);
        }
    }
    
    updateAttackGauges() {
        const gaugeWidth = 100;
        const heroGaugePercent = Math.min(1, this.heroAttackGauge / 100); 
        this.heroAttackGaugeFill.width = gaugeWidth * heroGaugePercent;
        const enemyGaugePercent = Math.min(1, this.enemyAttackGauge / 100);
        this.enemyAttackGaugeFill.width = gaugeWidth * enemyGaugePercent;
    }
    
    playerAttack() {
        if (!this.combatRunning || !this.heroIllust.active || !this.enemyIllust.active) return;
        this.add.tween({ targets: this.heroIllust, x: this.heroIllust.x + 20, duration: 100, ease: 'Power1', yoyo: true,
            onComplete: () => {
                this.enemyHp -= 10; this.updateHpBars(); // HP 변경 시 UI 동기화됨
                if (this.enemyHp <= 0) { this.defeatEnemy(); } 
            }
        });
    }
    
    enemyAttack() {
        if (!this.combatRunning || !this.heroIllust.active || !this.enemyIllust.active) return;
        this.add.tween({ targets: this.enemyIllust, x: this.enemyIllust.x - 20, duration: 100, ease: 'Power1', yoyo: true,
            onComplete: () => {
                this.heroHp -= this.enemyData.atk; this.updateHpBars(); // HP 변경 시 UI 동기화됨
                if (this.heroHp <= 0) { this.defeatHero(); }
            }
        });
    }

    defeatEnemy() {
        this.combatRunning = false;
        this.add.tween({ targets: this.enemyIllust, alpha: 0, duration: 500,
            onComplete: () => {
                this.enemyIllust.active = false;
                this.enemyHpBarBG.destroy(); this.enemyHpBarFill.destroy();
                this.enemyAttackGaugeBG.destroy(); this.enemyAttackGaugeFill.destroy();
                let loot = null;
                if (Math.random() < this.enemyData.dropRate) { loot = Phaser.Math.RND.pick(ALL_ITEM_KEYS); this.dropItemAnimation(loot); } 
                else { this.endCombat(null); }
            }
        });
    }
    
    dropItemAnimation(itemKey) {
        const itemData = ItemData[itemKey];
        const itemIcon = this.add.rectangle(this.enemyIllust.x, this.enemyIllust.y, 20, 20, itemData.color);
        const inventoryCenterSlotX = this.cameras.main.width - 190 + 50; 
        const inventoryCenterSlotY = 415;
        this.add.tween({ targets: itemIcon, x: inventoryCenterSlotX, y: inventoryCenterSlotY, duration: 700, ease: 'Back.easeIn',
            onComplete: () => { itemIcon.destroy(); this.endCombat(itemKey); }
        });
    }
    
    endCombat(loot) {
        this.combatRunning = false;
        // 키보드 리스너 제거 (씬이 멈추기 전에)
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
        this.inventorySlots = [];
        this.equipSlots = {};
        this.inventory = new Array(16).fill(null);
        
        this.UI_WIDTH = 190;
        this.UI_PADDING = 10;
        this.TOP_UI_HEIGHT = 50;
        
        this.labelStyle = { fontSize: '11px', fill: '#cccccc', align: 'center' };
        this.inventoryLabelStyle = { fontSize: '14px', fill: '#cccccc', align: 'left' };
        this.hpStaTextStyle = { fontSize: '12px', fill: '#ffffff' };
        this.pauseTextStyle = { fontSize: '16px', fill: '#ffffff', align: 'center'}; 
        
        this.uiElements = null;
        this.itemIcons = null;
        this.pauseText = null; 
    }
    
    create() {
        console.log("UIScene create start");
        this.uiElements = this.add.group();
        this.itemIcons = this.add.group();

        this.scale.on('resize', this.redraw, this);
        this.events.on('wake', this.handleWake, this); // wake 이벤트 핸들러 추가 (재확인)

        const gameScene = this.scene.get('GameScene');
        // GameScene이 존재하고 이벤트 시스템이 준비되었는지 더 확실하게 확인
        this.time.delayedCall(100, () => { // GameScene이 확실히 생성된 후 리스너 등록
            if (gameScene && gameScene.events) {
                gameScene.events.on('updateDay', (day) => {
                    if (this.dayText) this.dayText.setText(`Day: ${day}`);
                }, this);
                // [수정] GameScene의 HP 업데이트 이벤트가 아닌, CombatScene에서 직접 보낼 이벤트를 수신
                // gameScene.events.on('updateHeroHP', this.updateHeroHP, this); 
                this.events.on('updateHeroHP', this.updateHeroHP, this); // UIScene 자체 이벤트 수신
                
                if (gameScene.registry && gameScene.registry.events) {
                    // Registry 값 변경('changedata-[key]')을 감지
                    gameScene.registry.events.on('changedata-isPaused', this.updatePauseText, this); 
                    // 초기 상태 반영
                    this.updatePauseText(); 
                } else {
                    console.warn("UIScene create: GameScene registry not ready for pause listener.");
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
    
    handleWake() {
        console.log("UIScene wake, calling redraw");
        const gameScene = this.scene.get('GameScene');
        if(gameScene && gameScene.registry) {
             this.updatePauseText(); 
        }
        // redraw 호출 전에 필요한 데이터(HP 등)를 GameScene에서 가져와 반영할 수 있음
        if (gameScene && gameScene.hero) {
             this.updateHeroHP(gameScene.hero.hp, gameScene.hero.maxHp);
        }
        this.redraw(this.scale.gameSize);
    }
    
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
        // ... (v8.1과 동일) ...
         console.log("UIScene redraw start", gameSize);
        const gameWidth = gameSize ? gameSize.width : this.cameras.main.width;
        const gameHeight = gameSize ? gameSize.height : this.cameras.main.height;
        if (gameWidth <= 1 || gameHeight <= 1) { console.warn("UIScene redraw skipped due to invalid size:", gameWidth, gameHeight); return; }
        this.uiElements.clear(true, true); this.inventorySlots = []; this.equipSlots = {};
        this.UI_START_X = gameWidth - this.UI_WIDTH;
        const topBar = this.add.graphics().fillStyle(0x666666).fillRect(0, 0, gameWidth, this.TOP_UI_HEIGHT); this.uiElements.add(topBar);
        const text1 = this.add.text(10, 15, '시간의 흐름', { fontSize: '10px', fill: '#000000' });
        const gameSceneRef = this.scene.get('GameScene'); const currentDay = (gameSceneRef && typeof gameSceneRef.day === 'number') ? gameSceneRef.day : 1;
        this.dayText = this.add.text(80, 15, `Day: ${currentDay}`, { fontSize: '14px', fill: '#000000' });
        const text3 = this.add.text(200, 15, '계획', { fontSize: '10px', fill: '#000000' });
        this.pauseText = this.add.text(gameWidth / 2, this.TOP_UI_HEIGHT / 2, '진행', this.pauseTextStyle).setOrigin(0.5);
        const text5 = this.add.text(this.UI_START_X - 150 > 500 ? this.UI_START_X - 150 : 500, 15, '몇 번째 루프', { fontSize: '10px', fill: '#000000' }); 
        this.uiElements.addMultiple([text1, this.dayText, text3, this.pauseText, text5]);
        const rightBar = this.add.graphics().fillStyle(0x333333).fillRect(this.UI_START_X, 0, this.UI_WIDTH, gameHeight); this.uiElements.add(rightBar);
        const RIGHT_UI_START_X = this.UI_START_X + this.UI_PADDING; let currentY = this.TOP_UI_HEIGHT + this.UI_PADDING;
        this.heroHpText = this.add.text(RIGHT_UI_START_X, currentY, 'HP: 100/100', this.hpStaTextStyle); currentY += 18;
        this.hpBarWidth = this.UI_WIDTH - (this.UI_PADDING * 2) - 20; this.hpBarHeight = 8;
        this.heroHpBarBG = this.add.rectangle(RIGHT_UI_START_X, currentY, this.hpBarWidth, this.hpBarHeight, 0xff0000).setOrigin(0); this.heroHpBarFill = this.add.rectangle(RIGHT_UI_START_X, currentY, this.hpBarWidth, this.hpBarHeight, 0x00ff00).setOrigin(0);
        currentY += 15; const staText = this.add.text(RIGHT_UI_START_X, currentY, 'STA: 100/100', { fontSize: '12px', fill: '#B09253' }); currentY += 30;
        this.uiElements.addMultiple([this.heroHpText, this.heroHpBarBG, this.heroHpBarFill, staText]);
        const EQUIP_SLOT_SIZE = 36; const EQUIP_SLOT_GAP_X = 5; const EQUIP_SLOT_GAP_Y = 10;
        const helmetLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, 'helmet', this.labelStyle); this.equipSlots['helmet'] = this.createSlot(RIGHT_UI_START_X + 10, currentY + 15, 'helmet', EQUIP_SLOT_SIZE); currentY += EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_Y + 10;
        const armorLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, 'armor', this.labelStyle); this.equipSlots['armor']  = this.createSlot(RIGHT_UI_START_X + 10, currentY + 15, 'armor', EQUIP_SLOT_SIZE); const weaponLabel = this.add.text(RIGHT_UI_START_X + 10 + EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X, currentY, 'weapon', this.labelStyle); this.equipSlots['weapon'] = this.createSlot(RIGHT_UI_START_X + 10 + EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X, currentY + 15, 'weapon', EQUIP_SLOT_SIZE); const shieldLabel = this.add.text(RIGHT_UI_START_X + 10 + (EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X) * 2, currentY, 'shield', this.labelStyle); this.equipSlots['shield'] = this.createSlot(RIGHT_UI_START_X + 10 + (EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X) * 2, currentY + 15, 'shield', EQUIP_SLOT_SIZE); currentY += EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_Y + 10;
        const glovesLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, 'gloves', this.labelStyle); this.equipSlots['gloves'] = this.createSlot(RIGHT_UI_START_X + 10, currentY + 15, 'gloves', EQUIP_SLOT_SIZE); const beltLabel = this.add.text(RIGHT_UI_START_X + 10 + EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X, currentY, 'belt', this.labelStyle); this.equipSlots['belt']   = this.createSlot(RIGHT_UI_START_X + 10 + EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X, currentY + 15, 'belt', EQUIP_SLOT_SIZE); const bootsLabel = this.add.text(RIGHT_UI_START_X + 10 + (EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X) * 2, currentY, 'boots', this.labelStyle); this.equipSlots['boots']  = this.createSlot(RIGHT_UI_START_X + 10 + (EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_X) * 2, currentY + 15, 'boots', EQUIP_SLOT_SIZE); currentY += EQUIP_SLOT_SIZE + EQUIP_SLOT_GAP_Y + 10;
        this.uiElements.addMultiple([helmetLabel, armorLabel, weaponLabel, shieldLabel, glovesLabel, beltLabel, bootsLabel]);
        const statsLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, '능력치', this.inventoryLabelStyle); currentY += 20; const damageLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, '피해: +X', this.hpStaTextStyle); currentY += 15; const defenseLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, '방어: +Y', this.hpStaTextStyle); currentY += 25; this.uiElements.addMultiple([statsLabel, damageLabel, defenseLabel]);
        const invLabel = this.add.text(RIGHT_UI_START_X + 10, currentY, 'Inventory', this.inventoryLabelStyle); currentY += 20; this.uiElements.add(invLabel);
        const INV_SLOT_SIZE = 36; const INV_SLOT_GAP = 5; let slotIndex = 0;
        for (let y = 0; y < 4; y++) { for (let x = 0; x < 4; x++) { const slotX = RIGHT_UI_START_X + 5 + x * (INV_SLOT_SIZE + INV_SLOT_GAP); const slotY = currentY + y * (INV_SLOT_SIZE + INV_SLOT_GAP); this.inventorySlots.push(this.createSlot(slotX, slotY, slotIndex++, INV_SLOT_SIZE)); } }
        this.selectedHighlight = this.add.graphics().lineStyle(2, 0xcc99ff); this.selectedHighlight.visible = false;
        this.errorText = this.add.text(this.UI_START_X + this.UI_WIDTH / 2, gameHeight - 30, '', { fontSize: '10px', fill: '#ff0000' }).setOrigin(0.5); this.uiElements.addMultiple([this.selectedHighlight, this.errorText]);
        let initialHp = 100, initialMaxHp = 100; if (gameSceneRef && gameSceneRef.heroData) { initialHp = gameSceneRef.heroData.hp; initialMaxHp = gameSceneRef.heroData.maxHp; } if (gameSceneRef && gameSceneRef.hero) { initialHp = gameSceneRef.hero.hp; initialMaxHp = gameSceneRef.hero.maxHp; } 
        this.updateHeroHP(initialHp, initialMaxHp);
        if (gameSceneRef && gameSceneRef.registry) { this.updatePauseText(); }
        this.refreshInventory();
        console.log("UIScene redraw end");
    }
    
    updateHeroHP(hp, maxHp) {
        // ... (v8.1과 동일) ...
        if (!this.scene.isActive() || !this.heroHpText || !this.heroHpBarFill) return; this.heroHpText.setText(`HP: ${hp}/${maxHp}`); const percent = Math.max(0, hp / maxHp); if (typeof this.hpBarWidth === 'number') { this.heroHpBarFill.width = this.hpBarWidth * percent; } else { console.warn("hpBarWidth is not defined in updateHeroHP"); }
    }
    
    createSlot(x, y, key, size = 40) {
        // ... (v8.1과 동일) ...
        const slot = this.add.rectangle(x, y, size, size).setOrigin(0).setFillStyle(0x333333).setStrokeStyle(1, 0x666666); slot.setData('slotKey', key); slot.setInteractive(); slot.on('pointerdown', () => this.onSlotClick(slot)); this.uiElements.add(slot); return slot;
    }
    
    onSlotClick(slot) {
        // ... (v8.1과 동일) ...
        const slotKey = slot.getData('slotKey'); if (this.selectedItemIndex !== null) { const itemKey = this.inventory[this.selectedItemIndex]; if (!itemKey) { this.clearSelection(); return; } const itemType = ItemData[itemKey].type; if (this.equipSlots[slotKey]) { if (slotKey === itemType) { this.equipItem(itemKey, slotKey); this.inventory[this.selectedItemIndex] = null; this.clearSelection(); this.refreshInventory(); } else { this.showError('해당 아이템을 장착할 수 없는 위치입니다.'); } } else { this.clearSelection(); } } else { if (typeof slotKey === 'number' && slotKey < this.inventory.length && this.inventory[slotKey]) { this.selectedItemIndex = slotKey; this.selectedHighlight.visible = true; if (this.selectedHighlight) { this.selectedHighlight.clear().lineStyle(2, 0xcc99ff).strokeRect(slot.x, slot.y, slot.width, slot.height); } } }
    }
    
    addItem(itemKey) {
        // ... (v8.1과 동일) ...
        const emptySlotIndex = this.inventory.indexOf(null); if (emptySlotIndex !== -1) { this.inventory[emptySlotIndex] = itemKey; this.refreshInventory(); } else { this.showError('인벤토리가 가득 찼습니다!'); }
    }
    
    refreshInventory() {
        // ... (v8.1과 동일) ...
         if (!this.itemIcons) { console.warn("Item icon group not ready in refreshInventory"); return; } this.itemIcons.clear(true, true); this.inventory.forEach((itemKey, index) => { if (itemKey) { const slot = (index < this.inventorySlots.length) ? this.inventorySlots[index] : null; if (slot) { const itemIcon = this.add.rectangle(slot.x + slot.width/2, slot.y + slot.height/2, slot.width * 0.8, slot.height * 0.8, ItemData[itemKey].color); this.itemIcons.add(itemIcon); } } }); Object.keys(this.equipSlots).forEach(slotKey => { const slot = this.equipSlots[slotKey]; if (slot && typeof slot.getData === 'function' && slot.getData('item')) { const itemKey = slot.getData('item'); const itemIcon = this.add.rectangle(slot.x + slot.width/2, slot.y + slot.height/2, slot.width * 0.8, slot.height * 0.8, ItemData[itemKey].color); this.itemIcons.add(itemIcon); } });
    }
    
    equipItem(itemKey, slotKey) {
        // ... (v8.1과 동일) ...
        const slot = this.equipSlots[slotKey]; if (slot && typeof slot.setData === 'function') { slot.setData('item', itemKey); } else { console.error(`Equip slot ${slotKey} not found or invalid.`); }
    }
    
    clearSelection() {
        // ... (v8.1과 동일) ...
        this.selectedItemIndex = null; if (this.selectedHighlight) { this.selectedHighlight.visible = false; }
    }
    
    showError(message) {
        // ... (v7.4와 동일) ...
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
