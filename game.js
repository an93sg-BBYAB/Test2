// game.js

class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');
        this.TILE_SIZE = 32; // 타일 크기 (픽셀)
    }

    // 1. 리소스 불러오기 (Preload)
    // 필요한 이미지 리소스를 웹에서 임시로 불러옵니다.
    preload() {
        // 타일용: 1x1 흰색 픽셀 (색상을 입혀서 사용할 것입니다)
        this.load.image('pixel', 'https://labs.phaser.io/assets/textures/white-pixel.png');
        
        // 영웅용: Phaser 튜토리얼 기본 스프라이트 시트
        this.load.spritesheet('hero', 'https://labs.phaser.io/assets/sprites/dude.png', {
            frameWidth: 32, frameHeight: 48
        });
        
        // 적용: Phaser 튜토리얼 적 스프라이트
        this.load.image('enemy', 'https://labs.phaser.io/assets/sprites/enemy-bug.png');
    }

    // 2. 게임 요소 생성 (Create)
    create() {
        // 게임 변수 초기화
        this.pathCoords = [];   // 영웅이 이동할 경로 좌표 배열
        this.pathIndex = 0;     // 현재 영웅의 경로 인덱스
        this.inCombat = false;  // 전투 중인지 확인
        
        // 랜덤 루프 경로 생성 및 그리기
        this.generateRandomLoop();
        this.drawTiles();

        // 영웅 생성
        const startPos = this.pathCoords[0];
        this.hero = this.physics.add.sprite(startPos.x, startPos.y, 'hero', 4); // 4번 프레임(서있는 모습)
        this.hero.hp = 100;
        this.hero.maxHp = 100;
        
        // 적 생성 (루프의 중간 지점쯤에)
        const enemyPos = this.pathCoords[Math.floor(this.pathCoords.length / 2)];
        this.enemy = this.physics.add.sprite(enemyPos.x, enemyPos.y, 'enemy');
        this.enemy.hp = 50;
        this.enemy.maxHp = 50;
        
        // HP 게이지용 그래픽 객체 생성
        this.heroHpBar = this.add.graphics();
        this.enemyHpBar = this.add.graphics();
    }

    // 3. 게임 루프 (Update)
    // 매 프레임마다 실행됩니다.
    update(time, delta) {
        // HP 게이지 업데이트 (항상 위치를 따라다니며 다시 그림)
        this.updateHpBars();

        // 영웅이나 적이 없으면(죽으면) 업데이트 중지
        if (!this.hero.active || !this.enemy.active) {
            return;
        }

        // 전투 중이 아닐 때만 이동
        if (!this.inCombat) {
            this.moveHero();
        }

        // 전투 중이 아니고, 영웅과 적이 겹치면 전투 시작
        if (!this.inCombat && Phaser.Geom.Intersects.RectangleToRectangle(this.hero.getBounds(), this.enemy.getBounds())) {
            this.startCombat();
        }
    }

    // --- 헬퍼 함수들 ---

    // (요청) 랜덤 루프 생성 함수
    generateRandomLoop() {
        const GRID_WIDTH = 25;
        const GRID_HEIGHT = 18;
        this.grid = Array(GRID_HEIGHT).fill(0).map(() => Array(GRID_WIDTH).fill(0)); // 0: 풀, 1: 길

        // 랜덤한 사각형 루프 생성
        const minSize = 5;
        const maxSize = 10;
        const loopWidth = Phaser.Math.Between(minSize, maxSize);
        const loopHeight = Phaser.Math.Between(minSize, maxSize);
        const startX = Phaser.Math.Between(2, GRID_WIDTH - maxSize - 2);
        const startY = Phaser.Math.Between(2, GRID_HEIGHT - maxSize - 2);

        // 경로 좌표를 시계 방향으로 저장
        // 1. 윗줄 (좌 -> 우)
        for (let x = startX; x <= startX + loopWidth; x++) {
            this.grid[startY][x] = 1;
            this.pathCoords.push(new Phaser.Math.Vector2(x * this.TILE_SIZE + 16, startY * this.TILE_SIZE + 16));
        }
        // 2. 오른쪽 줄 (상 -> 하)
        for (let y = startY + 1; y <= startY + loopHeight; y++) {
            this.grid[y][startX + loopWidth] = 1;
            this.pathCoords.push(new Phaser.Math.Vector2((startX + loopWidth) * this.TILE_SIZE + 16, y * this.TILE_SIZE + 16));
        }
        // 3. 아랫줄 (우 -> 좌)
        for (let x = startX + loopWidth - 1; x >= startX; x--) {
            this.grid[startY + loopHeight][x] = 1;
            this.pathCoords.push(new Phaser.Math.Vector2(x * this.TILE_SIZE + 16, (startY + loopHeight) * this.TILE_SIZE + 16));
        }
        // 4. 왼쪽 줄 (하 -> 상)
        for (let y = startY + loopHeight - 1; y > startY; y--) {
            this.grid[y][startX] = 1;
            this.pathCoords.push(new Phaser.Math.Vector2(startX * this.TILE_SIZE + 16, y * this.TILE_SIZE + 16));
        }
    }

    // 타일 그리기
    drawTiles() {
        for (let y = 0; y < this.grid.length; y++) {
            for (let x = 0; x < this.grid[y].length; x++) {
                const tileX = x * this.TILE_SIZE;
                const tileY = y * this.TILE_SIZE;
                
                if (this.grid[y][x] === 1) {
                    // 1: 길 (회색)
                    this.add.image(tileX, tileY, 'pixel').setOrigin(0).setDisplaySize(this.TILE_SIZE, this.TILE_SIZE).setTint(0x888888);
                } else {
                    // 0: 풀 (녹색)
                    this.add.image(tileX, tileY, 'pixel').setOrigin(0).setDisplaySize(this.TILE_SIZE, this.TILE_SIZE).setTint(0x228B22);
                }
            }
        }
    }

    // 영웅 이동 로직
    moveHero() {
        const targetPos = this.pathCoords[this.pathIndex];
        const distance = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, targetPos.x, targetPos.y);

        if (distance < 4) {
            // 목표 지점 도착 시 다음 인덱스로
            this.pathIndex = (this.pathIndex + 1) % this.pathCoords.length;
        } else {
            // 목표 지점을 향해 이동 (속도 100)
            this.physics.moveTo(this.hero, targetPos.x, targetPos.y, 100);
        }
    }

    // 전투 시작
    startCombat() {
        this.inCombat = true;
        this.hero.body.stop(); // 영웅 정지

        // 1초마다 전투 로직 실행 (fightTick 함수 호출)
        this.combatTimer = this.time.addEvent({
            delay: 1000,
            callback: this.fightTick,
            callbackScope: this,
            loop: true
        });
    }

    // 전투 로직 (1초마다 실행)
    fightTick() {
        // 영웅이 적 공격
        this.enemy.hp -= 10;
        console.log(`적 체력: ${this.enemy.hp}`);

        // 적이 영웅 공격
        if (this.enemy.hp > 0) {
            this.hero.hp -= 5;
            console.log(`영웅 체력: ${this.hero.hp}`);
        }

        // 적 사망
        if (this.enemy.hp <= 0) {
            this.enemy.destroy(); // 적 제거
            this.enemyHpBar.clear(); // 적 HP바 제거
            this.combatTimer.remove(); // 전투 타이머 중지
            this.inCombat = false; // 전투 상태 해제
        }

        // 영웅 사망
        if (this.hero.hp <= 0) {
            this.hero.destroy(); // 영웅 제거
            this.heroHpBar.clear(); // 영웅 HP바 제거
            this.combatTimer.remove(); // 전투 타이머 중지
            this.add.text(400, 300, 'GAME OVER', { fontSize: '32px', fill: '#fff' }).setOrigin(0.5);
        }
    }

    // (요청) HP 게이지 그리기
    updateHpBars() {
        // 기존 HP바 지우기
        this.heroHpBar.clear();
        this.enemyHpBar.clear();

        // 영웅 HP바
        if (this.hero.active) {
            this.drawHpBar(this.heroHpBar, this.hero.x - 20, this.hero.y - 30, this.hero.hp, this.hero.maxHp);
        }
        // 적 HP바
        if (this.enemy.active) {
            this.drawHpBar(this.enemyHpBar, this.enemy.x - 20, this.enemy.y - 20, this.enemy.hp, this.enemy.maxHp);
        }
    }

    // HP바 그리는 세부 함수
    drawHpBar(bar, x, y, currentValue, maxValue) {
        const width = 40;
        const height = 5;
        const percent = Math.max(0, currentValue / maxValue);

        // HP 배경 (빨간색)
        bar.fillStyle(0xff0000);
        bar.fillRect(x, y, width, height);

        // 현재 HP (초록색)
        bar.fillStyle(0x00ff00);
        bar.fillRect(x, y, width * percent, height);
    }
}

// Phaser 게임 설정
const config = {
    type: Phaser.AUTO,
    width: 800,  // 25 * 32
    height: 576, // 18 * 32
    scene: [GameScene],
    physics: {
        default: 'arcade',
        arcade: {
            debug: false // true로 바꾸면 물리 영역(네모 박스)이 보입니다
        }
    }
};

// 게임 인스턴스 생성
const game = new Phaser.Game(config);