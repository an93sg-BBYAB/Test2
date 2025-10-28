// game.js (v3 - 씬 분리 및 UI/전투 구현)

// --- 데이터 정의 ---

// (요청) 아이템 정의 (이미지 대신 색상과 태그 사용)
const ItemData = {
    'sword':    { name: '검', type: 'weapon', color: 0xff0000 },
    'shield':   { name: '방패', type: 'shield', color: 0x0000ff },
    'helmet':   { name: '투구', type: 'helmet', color: 0xaaaa00 },
    'armor':    { name: '갑옷', type: 'armor', color: 0x888888 },
    'gloves':   { name: '장갑', type: 'gloves', color: 0x00ff00 },
    'belt':     { name: '허리띠', type: 'belt',   color: 0x8B4513 },
    'boots':    { name: '장화', type: 'boots',  color: 0x555555 }
};
const ALL_ITEM_KEYS = Object.keys(ItemData);

// (요청) 적 정의 (드랍률 포함)
const EnemyData = {
    'goblin': { name: '고블린', hp: 30, atk: 5, color: 0x00aa00, dropRate: 0.10 },
    'skeleton': { name: '해골', hp: 50, atk: 3, color: 0xeeeeee, dropRate: 0.15 },
    'orc': { name: '오크', hp: 80, atk: 8, color: 0x008800, dropRate: 0.20 },
    'demon': { name: '악마', hp: 40, atk: 12, color: 0xcc0000, dropRate: 0.25 }
};
const ALL_ENEMY_KEYS = Object.keys(EnemyData);

// --- 1. 메인 게임 씬 (필드 탐험) ---
class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.TILE_SIZE = 32;
    }

    preload() {
        // 임시 타일용 1x1 픽셀
        this.load.image('pixel', 'https://labs.phaser.io/assets/textures/white-pixel.png');
    }

    create() {
        // UI 씬을 병렬로 실행
        this.scene.run('UIScene');

        // 변수 초기화
        this.pathCoords = [];
        this.pathIndex = 0;
        this.startGridPos = null;
        this.day = 1;
        this.tilesMovedTotal = 0;

        // 적 그룹 (이제 실제 적이 아닌, '트리거' 역할만 함)
        this.enemyTriggers = this.physics.add.group();
        
        // 루프 생성 및 그리기
        this.generateRandomLoop();
        this.drawTiles();

        // 영웅 생성 (임시 사각형)
        const startPos = this.pathCoords[0];
        this.hero = this.physics.add.sprite(startPos.x, startPos.y, 'pixel').setDisplaySize(16, 24).setTint(0x00ffff);
        
        // (요청) 영웅은 이제 적 트리거와 겹쳤을 때만 전투 시작
        this.physics.add.overlap(this.hero, this.enemyTriggers, this.onMeetEnemy, null, this);
        
        // 전투 씬이 완료되었을 때 받을 이벤트 리스너
        this.events.on('combatComplete', this.onCombatComplete, this);
    }

    update(time, delta) {
        if (!this.hero.active) return;
        this.moveHero();
    }

    generateRandomLoop() {
        // (참고) 루프 생성 로직은 이전과 동일합니다.
        // 복잡한 'ㄱ,ㄴ,ㄷ' 루프는 추후 별도 알고리즘으로 교체해야 합니다.
        const GRID_WIDTH = 25;
        const GRID_HEIGHT = 18;
        this.grid = Array(GRID_HEIGHT).fill(0).map(() => Array(GRID_WIDTH).fill(0)); 
        const minSize = 5, maxSize = 10;
        const loopWidth = Phaser.Math.Between(minSize, maxSize);
        const loopHeight = Phaser.Math.Between(minSize, maxSize);
        const startX = Phaser.Math.Between(2, 18 - maxSize - 2); // UI 공간을 위해 폭 좁힘
        const startY = Phaser.Math.Between(2, GRID_HEIGHT - maxSize - 2);
        this.startGridPos = { x: startX, y: startY };
        
        // 경로 좌표 저장
        this.pathCoords = [];
        for (let x = startX; x <= startX + loopWidth; x++) { this.grid[startY][x] = 1; this.pathCoords.push(new Phaser.Math.Vector2(x * this.TILE_SIZE + 16, startY * this.TILE_SIZE + 16)); }
        for (let y = startY + 1; y <= startY + loopHeight; y++) { this.grid[y][startX + loopWidth] = 1; this.pathCoords.push(new Phaser.Math.Vector2((startX + loopWidth) * this.TILE_SIZE + 16, y * this.TILE_SIZE + 16)); }
        for (let x = startX + loopWidth - 1; x >= startX; x--) { this.grid[startY + loopHeight][x] = 1; this.pathCoords.push(new Phaser.Math.Vector2(x * this.TILE_SIZE + 16, (startY + loopHeight) * this.TILE_SIZE + 16)); }
        for (let y = startY + loopHeight - 1; y > startY; y--) { this.grid[y][startX] = 1; this.pathCoords.push(new Phaser.Math.Vector2(startX * this.TILE_SIZE + 16, y * this.TILE_SIZE + 16)); }
    }

    drawTiles() {
        // (요청) UI 공간 확보를 위해 전체 맵을 왼쪽으로 조금 이동
        const mapOffsetX = -100;
        const mapOffsetY = 0;
        
        this.add.graphics().fillStyle(0x000000).fillRect(0, 0, 800, 576); // 검은 배경
        
        for (let y = 0; y < this.grid.length; y++) {
            for (let x = 0; x < this.grid[y].length; x++) {
                if (this.grid[y][x] === 0) continue; // (요청) 길 아닌 곳은 안 그림
                
                const tileX = x * this.TILE_SIZE + mapOffsetX;
                const tileY = y * this.TILE_SIZE + mapOffsetY;
                let tint;

                if (x === this.startGridPos.x && y === this.startGridPos.y) {
                    tint = 0x0000ff; // 출발점 (파랑)
                } else {
                    tint = 0x888888; // 길 (회색)
                }
                this.add.image(tileX, tileY, 'pixel').setOrigin(0).setDisplaySize(this.TILE_SIZE, this.TILE_SIZE).setTint(tint);
            }
        }
        
        // 맵 좌표도 오프셋 적용
        this.pathCoords.forEach(coord => {
            coord.x += mapOffsetX;
            coord.y += mapOffsetY;
        });
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
                // UI 씬에 이벤트 전송
                this.scene.get('UIScene').events.emit('updateDay', this.day);
            }
        } else {
            this.physics.moveTo(this.hero, targetPos.x, targetPos.y, 100);
        }
    }

    checkSpawns() {
        // (요청) 스폰 로직 (이전과 동일)
        if (this.tilesMovedTotal % 3 === 0) this.spawnEnemyTrigger(ALL_ENEMY_KEYS[0]);
        if (this.tilesMovedTotal % 4 === 0) this.spawnEnemyTrigger(ALL_ENEMY_KEYS[1]);
        if (this.tilesMovedTotal % 5 === 0) this.spawnEnemyTrigger(ALL_ENEMY_KEYS[2]);
        if (this.tilesMovedTotal % 6 === 0) this.spawnEnemyTrigger(ALL_ENEMY_KEYS[3]);
    }

    spawnEnemyTrigger(enemyKey) {
        const randomPathTile = Phaser.Math.RND.pick(this.pathCoords);
        
        // (요청) 타일보다 작은 크기 (16x16)의 적 트리거 생성
        const enemy = this.enemyTriggers.create(randomPathTile.x, randomPathTile.y, 'pixel')
            .setDisplaySize(16, 16)
            .setTint(EnemyData[enemyKey].color);
            
        enemy.enemyKey = enemyKey; // 적 정보 저장
    }

    // (수정) 전투 트리거 발동
    onMeetEnemy(hero, enemyTrigger) {
        // (요청) 순방향 이동 시에만 전투
        // (간단한 구현: 영웅이 멈추고 전투 씬을 띄우므로, 다음 타일로 못 가게 막음)
        
        this.hero.body.stop();
        
        const enemyKey = enemyTrigger.enemyKey;
        
        // 전투 씬으로 넘길 데이터
        const combatData = {
            enemyKey: enemyKey,
            enemyData: EnemyData[enemyKey]
        };

        // 이 씬을 멈추고 전투 씬 시작
        this.scene.pause();
        this.scene.launch('CombatScene', combatData);
        
        // 만난 적 트리거는 제거
        enemyTrigger.destroy();
    }
    
    // (신규) 전투 완료 시 콜백
    onCombatComplete(data) {
        console.log("전투 종료. 획득 아이템:", data.loot);
        
        // (요청) 획득한 아이템이 있다면 UI 씬으로 전달
        if (data.loot) {
            this.scene.get('UIScene').events.emit('addItem', data.loot);
        }
        
        // 게임 씬 다시 시작
        this.scene.resume();
    }
}

// --- 2. 전투 씬 ---
class CombatScene extends Phaser.Scene {
    constructor() {
        super('CombatScene');
    }
    
    init(data) {
        // GameScene에서 적 데이터 받기
        this.enemyData = data.enemyData;
    }
    
    create() {
        // 반투명 검은 배경
        this.add.graphics().fillStyle(0x000000, 0.7).fillRect(0, 0, 800, 576);
        
        // (요청) 일러스트 위치 (임시 사각형)
        this.heroIllust = this.add.rectangle(200, 300, 150, 200, 0x00ffff).setOrigin(0.5);
        this.enemyIllust = this.add.rectangle(600, 300, 150, 200, this.enemyData.color).setOrigin(0.5);
        
        // (요청) 체력 게이지
        this.heroHp = 100;
        this.heroMaxHp = 100;
        this.enemyHp = this.enemyData.hp;
        this.enemyMaxHp = this.enemyData.hp;
        
        this.heroHpBar = this.add.graphics();
        this.enemyHpBar = this.add.graphics();
        this.updateHpBars();
        
        // 공격 버튼 (간단하게 화면 클릭)
        this.add.text(400, 500, '[ 화면을 클릭하여 공격 ]', { fontSize: '20px', fill: '#fff' }).setOrigin(0.5);
        this.input.on('pointerdown', this.playerAttack, this);
    }
    
    updateHpBars() {
        // 영웅 HP바
        this.drawHpBar(this.heroHpBar, this.heroIllust.x - 75, this.heroIllust.y - 120, this.heroHp, this.heroMaxHp);
        // 적 HP바
        this.drawHpBar(this.enemyHpBar, this.enemyIllust.x - 75, this.enemyIllust.y - 120, this.enemyHp, this.enemyMaxHp);
    }
    
    drawHpBar(bar, x, y, currentValue, maxValue) {
        bar.clear();
        const width = 150;
        const height = 15;
        const percent = Math.max(0, currentValue / maxValue);
        // 배경
        bar.fillStyle(0xff0000);
        bar.fillRect(x, y, width, height);
        // 현재 체력
        bar.fillStyle(0x00ff00);
        bar.fillRect(x, y, width * percent, height);
    }

    playerAttack() {
        if (!this.heroIllust.active || !this.enemyIllust.active) return;
        
        // (요청) 공격 모션 (Lunge)
        this.add.tween({
            targets: this.heroIllust,
            x: this.heroIllust.x + 30,
            duration: 100,
            ease: 'Power1',
            yoyo: true,
            onComplete: () => {
                // 적 타격
                this.enemyHp -= 10; // (임시) 영웅 공격력 10
                this.updateHpBars();
                
                if (this.enemyHp <= 0) {
                    this.defeatEnemy();
                } else {
                    // 적의 반격
                    this.time.delayedCall(300, this.enemyAttack, [], this);
                }
            }
        });
    }
    
    enemyAttack() {
        if (!this.heroIllust.active || !this.enemyIllust.active) return;

        // (요청) 공격 모션 (Lunge)
        this.add.tween({
            targets: this.enemyIllust,
            x: this.enemyIllust.x - 30,
            duration: 100,
            ease: 'Power1',
            yoyo: true,
            onComplete: () => {
                this.heroHp -= this.enemyData.atk;
                this.updateHpBars();
                
                if (this.heroHp <= 0) {
                    this.defeatHero();
                }
            }
        });
    }

    defeatEnemy() {
        // (요청) Fade out 효과
        this.add.tween({
            targets: this.enemyIllust,
            alpha: 0,
            duration: 500,
            onComplete: () => {
                this.enemyIllust.active = false;
                this.enemyHpBar.clear();
                
                // (요청) 아이템 드랍
                let loot = null;
                if (Math.random() < this.enemyData.dropRate) {
                    loot = Phaser.Math.RND.pick(ALL_ITEM_KEYS);
                    this.dropItemAnimation(loot);
                } else {
                    // 드랍 실패 시 씬 바로 종료
                    this.endCombat(null);
                }
            }
        });
    }
    
    // (요청) 아이템 드랍 애니메이션
    dropItemAnimation(itemKey) {
        const itemData = ItemData[itemKey];
        // 적 위치에 아이템(임시 사각형) 생성
        const itemIcon = this.add.rectangle(this.enemyIllust.x, this.enemyIllust.y, 20, 20, itemData.color);
        
        // (요청) 인벤토리 슬롯 위치로 이동
        this.add.tween({
            targets: itemIcon,
            x: 650, // UI 씬의 인벤토리 영역 (임의의 좌표)
            y: 300,
            duration: 700,
            ease: 'Back.easeIn',
            onComplete: () => {
                itemIcon.destroy();
                this.endCombat(item
