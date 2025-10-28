// game.js (수정본)

class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.TILE_SIZE = 32; // 타일 크기
    }

    // 1. 리소스 불러오기 (Preload)
    preload() {
        // 타일용
        this.load.image('pixel', 'https://labs.phaser.io/assets/textures/white-pixel.png');
        
        // 영웅용
        this.load.spritesheet('hero', 'https://labs.phaser.io/assets/sprites/dude.png', {
            frameWidth: 32, frameHeight: 48
        });
        
        // (요청) 4가지 적 스프라이트 로드
        this.load.image('enemy1', 'https://labs.phaser.io/assets/sprites/enemy-bug.png'); // 버그
        this.load.image('enemy2', 'https://labs.phaser.io/assets/sprites/slime.png');    // 슬라임
        this.load.image('enemy3', 'https://labs.phaser.io/assets/sprites/spider.png');   // 거미
        this.load.image('enemy4', 'https://labs.phaser.io/assets/sprites/bat.png');      // 박쥐
    }

    // 2. 게임 요소 생성 (Create)
    create() {
        // 게임 변수
        this.pathCoords = [];       // 영웅 이동 경로 좌표
        this.pathIndex = 0;         // 현재 경로 인덱스
        this.startGridPos = null;   // (요청) 출발점 타일 좌표
        this.inCombat = false;      // 전투 중 플래그
        this.currentTarget = null;  // 현재 전투 중인 적

        // (요청) 시간 및 스폰 관련 변수
        this.day = 1;               // 현재 'Day'
        this.tilesMovedTotal = 0;   // 영웅이 총 움직인 타일 수

        // (요청) 적 종류 정의
        this.enemyTypes = [
            { key: 'enemy1', sprite: 'enemy1', hp: 30, atk: 5 },
            { key: 'enemy2', sprite: 'enemy2', hp: 50, atk: 3 },
            { key: 'enemy3', sprite: 'enemy3', hp: 20, atk: 8 },
            { key: 'enemy4', sprite: 'enemy4', hp: 40, atk: 6 }
        ];

        // (요청) 시간(Day) 표시 UI
        this.dayText = this.add.text(10, 10, `Day: ${this.day}`, { fontSize: '18px', fill: '#fff' });

        // 랜덤 루프 생성 및 타일 그리기
        this.generateRandomLoop();
        this.drawTiles();

        // 영웅 생성
        const startPos = this.pathCoords[0];
        this.hero = this.physics.add.sprite(startPos.x, startPos.y, 'hero', 4);
        this.hero.hp = 100;
        this.hero.maxHp = 100;
        
        // HP 게이지
        this.heroHpBar = this.add.graphics();

        // (요청) 적 그룹 생성 (이제 여러 마리)
        this.enemies = this.physics.add.group();

        // 영웅과 적 그룹 간의 충돌(overlap) 감지
        this.physics.add.overlap(this.hero, this.enemies, this.onMeetEnemy, null, this);
    }

    // 3. 게임 루프 (Update)
    update(time, delta) {
        // HP 게이지 업데이트
        this.updateHpBars();

        // 영웅이 없으면(죽으면) 중지
        if (!this.hero.active) {
            return;
        }

        // 전투 중이 아닐 때만 이동
        if (!this.inCombat) {
            this.moveHero();
        }
    }

    // --- 헬퍼 함수들 ---

    // (수정) 랜덤 루프 생성 함수
    generateRandomLoop() {
        const GRID_WIDTH = 25;
        const GRID_HEIGHT = 18;
        this.grid = Array(GRID_HEIGHT).fill(0).map(() => Array(GRID_WIDTH).fill(0)); // 0: 빈 공간, 1: 길

        const minSize = 5, maxSize = 10;
        const loopWidth = Phaser.Math.Between(minSize, maxSize);
        const loopHeight = Phaser.Math.Between(minSize, maxSize);
        const startX = Phaser.Math.Between(2, GRID_WIDTH - maxSize - 2);
        const startY = Phaser.Math.Between(2, GRID_HEIGHT - maxSize - 2);

        // (요청) 출발점 좌표 저장
        this.startGridPos = { x: startX, y: startY };

        // 경로 좌표를 시계 방향으로 저장
        for (let x = startX; x <= startX + loopWidth; x++) {
            this.grid[startY][x] = 1;
            this.pathCoords.push(new Phaser.Math.Vector2(x * this.TILE_SIZE + 16, startY * this.TILE_SIZE + 16));
        }
        for (let y = startY + 1; y <= startY + loopHeight; y++) {
            this.grid[y][startX + loopWidth] = 1;
            this.pathCoords.push(new Phaser.Math.Vector2((startX + loopWidth) * this.TILE_SIZE + 16, y * this.TILE_SIZE + 16));
        }
        for (let x = startX + loopWidth - 1; x >= startX; x--) {
            this.grid[startY + loopHeight][x] = 1;
            this.pathCoords.push(new Phaser.Math.Vector2(x * this.TILE_SIZE + 16, (startY + loopHeight) * this.TILE_SIZE + 16));
        }
        for (let y = startY + loopHeight - 1; y > startY; y--) {
            this.grid[y][startX] = 1;
            this.pathCoords.push(new Phaser.Math.Vector2(startX * this.TILE_SIZE + 16, y * this.TILE_SIZE + 16));
        }
    }

    // (수정) 타일 그리기
    drawTiles() {
        for (let y = 0; y < this.grid.length; y++) {
            for (let x = 0; x < this.grid[y].length; x++) {
                const tileX = x * this.TILE_SIZE;
                const tileY = y * this.TILE_SIZE;
                let tint;

                // (요청) 출발점은 파란색
                if (x === this.startGridPos.x && y === this.startGridPos.y) {
                    tint = 0x0000ff; // 파란색
                // (요청) 루프 타일은 회색
                } else if (this.grid[y][x] === 1) {
                    tint = 0x888888; // 회색
                // (요청) 나머지는 검은색
                } else {
                    tint = 0x000000; // 검은색
                }
                
                this.add.image(tileX, tileY, 'pixel').setOrigin(0).setDisplaySize(this.TILE_SIZE, this.TILE_SIZE).setTint(tint);
            }
        }
    }

    // (수정) 영웅 이동 로직
    moveHero() {
        const targetPos = this.pathCoords[this.pathIndex];
        const distance = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, targetPos.x, targetPos.y);

        if (distance < 4) {
            // 목표 지점 도착
            this.pathIndex = (this.pathIndex + 1) % this.pathCoords.length;
            
            // (요청) 타일 이동 카운트 증가
            this.tilesMovedTotal++;

            // (요청) 스폰 로직 확인
            this.checkSpawns();

            // (요청) 루프 한 바퀴 완료 (출발점으로 돌아옴)
            if (this.pathIndex === 0) {
                this.day++;
                this.dayText.setText(`Day: ${this.day}`);
                console.log(`Day ${this.day} 시작`);
            }
        } else {
            // 목표 지점을 향해 이동
            this.physics.moveTo(this.hero, targetPos.x, targetPos.y, 100); // 속도 100
        }
    }

    // (신규) 적 스폰 확인 함수
    checkSpawns() {
        // 3타일마다 enemy1 스폰
        if (this.tilesMovedTotal % 3 === 0) {
            this.spawnEnemy('enemy1');
        }
        // 4타일마다 enemy2 스폰
        if (this.tilesMovedTotal % 4 === 0) {
            this.spawnEnemy('enemy2');
        }
        // 5타일마다 enemy3 스폰
        if (this.tilesMovedTotal % 5 === 0) {
            this.spawnEnemy('enemy3');
        }
        // 6타일마다 enemy4 스폰
        if (this.tilesMovedTotal % 6 === 0) {
            this.spawnEnemy('enemy4');
        }
    }

    // (신규) 적 스폰 함수
    spawnEnemy(enemyKey) {
        const enemyData = this.enemyTypes.find(e => e.key === enemyKey);
        if (!enemyData) return;

        // (요청) 랜덤한 루프 타일 위치 선정
        const randomPathTile = Phaser.Math.RND.pick(this.pathCoords);
        
        // 적 생성
        const enemy = this.enemies.create(randomPathTile.x, randomPathTile.y, enemyData.sprite);
        enemy.hp = enemyData.hp;
        enemy.maxHp = enemyData.hp;
        enemy.atk = enemyData.atk;
        
        // 각 적에게 개별 HP bar 그래픽 객체 할당
        enemy.hpBar = this.add.graphics();
        
        console.log(`${enemyData.key} 생성됨!`);
    }

    // (신규) 영웅과 적이 만났을 때
    onMeetEnemy(hero, enemy) {
        // 이미 전투 중이거나, 만난 적이 이미 죽어가면(hpBar가 없으면) 무시
        if (this.inCombat || !enemy.hpBar) return; 

        this.inCombat = true;
        this.hero.body.stop(); // 영웅 정지
        this.currentTarget = enemy; // 현재 싸울 적 지정

        this.startCombat();
    }
    
    // 전투 시작 (타이머 설정)
    startCombat() {
        this.combatTimer = this.time.addEvent({
            delay: 1000, // 1초마다 공방
            callback: this.fightTick,
            callbackScope: this,
            loop: true
        });
    }

    // (수정) 전투 로직 (1초마다 실행)
    fightTick() {
        const enemy = this.currentTarget;
        
        // 대상이 없거나(이미 죽음) 영웅이 죽었으면 전투 중지
        if (!enemy || !enemy.active || !this.hero.active) {
            this.combatTimer.remove();
            this.inCombat = false;
            this.currentTarget = null;
            return;
        }

        // 1. 영웅이 적 공격
        enemy.hp -= 10; // (임시) 영웅 공격력 10

        // 2. 적이 영웅 공격 (적이 살아있으면)
        if (enemy.hp > 0) {
            this.hero.hp -= enemy.atk; // 적의 개별 공격력 사용
        }

        // 3. 적 사망 처리
        if (enemy.hp <= 0) {
            enemy.hpBar.destroy(); // 적 HP바 제거
            enemy.destroy();       // 적 제거
            this.combatTimer.remove(); // 전투 타이머 중지
            this.inCombat = false;     // 전투 상태 해제
            this.currentTarget = null;
        }

        // 4. 영웅 사망 처리
        if (this.hero.hp <= 0) {
            this.hero.hpBar.destroy();
            this.hero.destroy();
            this.combatTimer.remove();
            
            // 모든 적 HP바 정리
            this.enemies.getChildren().forEach(e => {
                if(e.hpBar) e.hpBar.destroy();
            });
            
            this.add.text(400, 300, 'GAME OVER', { fontSize: '32px', fill: '#fff' }).setOrigin(0.5);
        }
    }

    // (수정) HP 게이지 그리기 (이제 여러 개)
    updateHpBars() {
        // 1. 영웅 HP바
        this.heroHpBar.clear();
        if (this.hero.active) {
            this.drawHpBar(this.heroHpBar, this.hero.x - 20, this.hero.y - 30, this.hero.hp, this.hero.maxHp);
        }
        
        // 2. 모든 적 HP바
        this.enemies.getChildren().forEach(enemy => {
            if (enemy.active && enemy.hpBar) {
                enemy.hpBar.clear();
                this.drawHpBar(enemy.hpBar, enemy.x - 20, enemy.y - 20, enemy.hp, enemy.maxHp);
            }
        });
    }

    // (동일) HP바 그리는 세부 함수
    drawHpBar(bar, x, y, currentValue, maxValue) {
        const width = 40;
        const height = 5;
        const percent = Math.max(0, currentValue / maxValue);

        bar.fillStyle(0xff0000); // 배경(빨강)
        bar.fillRect(x, y, width, height);
        bar.fillStyle(0x00ff00); // 현재 체력(초록)
        bar.fillRect(x, y, width * percent, height);
    }
}

// Phaser 게임 설정 (동일)
const config = {
    type: Phaser.AUTO,
    width: 800,  // 25 * 32
    height: 576, // 18 * 32
    scene: [GameScene],
    physics: {
        default: 'arcade',
        arcade: {
            debug: false
        }
    }
};

// 게임 인스턴스 생성 (동일)
const game = new Phaser.Game(config);
