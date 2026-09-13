import Phaser from 'phaser'
import { ArcadeAudio } from './arcade.audio.ts'
import { canTurn, placeFood, stepSnake, wrapArcadeTitle, type ArcadeMode, type ArcadeSnapshot, type ArcadeStats, type Cell, type Direction } from './arcade.model.ts'

const W = 1200
const H = 720
const CYAN = 0x55e5ed
const CORAL = 0xff534b
const font = 'Arial, sans-serif'
type Sprite = Phaser.Physics.Arcade.Image

export class BoardArcadeScene extends Phaser.Scene {
  private mode: ArcadeMode
  private snapshot: ArcadeSnapshot
  private reduced: boolean
  private audio: ArcadeAudio
  private report: (stats: ArcadeStats) => void
  private stats: ArcadeStats = { score: 0, lives: 3, level: 1, phase: 'ready' }
  private keys = new Set<string>()
  private body: readonly Cell[] = [{ x: 7, y: 7 }, { x: 6, y: 7 }, { x: 5, y: 7 }]
  private direction: Direction = 'right'
  private turns: Direction[] = []
  private food: Cell = { x: 16, y: 7 }
  private segments: Phaser.GameObjects.Image[] = []
  private snack!: Phaser.GameObjects.Container
  private snakeClock = 0
  private snakeConnections!: Phaser.GameObjects.Graphics
  private player!: Sprite
  private enemies!: Phaser.Physics.Arcade.Group
  private bullets!: Phaser.Physics.Arcade.Group
  private particles!: Phaser.GameObjects.Particles.ParticleEmitter
  private aim!: Phaser.GameObjects.Graphics
  private lastShot = 0
  private nextSpawn = 0
  private immuneUntil = 0
  private elapsed = 0
  private textureCount = 0
  private combo = 0
  private lastKill = 0
  private alive = false

  constructor(options: { mode: ArcadeMode; snapshot: ArcadeSnapshot; reduced: boolean; sound: ArcadeAudio; report: (stats: ArcadeStats) => void }) {
    super('board-arcade')
    this.mode = options.mode
    this.snapshot = options.snapshot
    this.reduced = options.reduced
    this.audio = options.sound
    this.report = options.report
  }

  create() {
    this.alive = true
    this.drawBoard()
    this.makeTextures()
    this.particles = this.add.particles(0, 0, 'spark', {
      speed: { min: 45, max: 310 }, lifespan: { min: 180, max: 550 },
      scale: { start: 1, end: 0 }, alpha: { start: .9, end: 0 },
      blendMode: 'ADD', emitting: false, maxParticles: this.reduced ? 70 : 280,
    }).setDepth(30)
    if (this.mode === 'snake') this.createSnake()
    else this.createShooter()
    this.events.once('shutdown', () => { this.alive = false; this.keys.clear() })
    this.report({ ...this.stats })
  }

  private drawBoard() {
    const g = this.add.graphics()
    g.fillStyle(0x080d10).fillRect(0, 0, W, H)
    g.lineStyle(1, 0x28464a, .3)
    for (let x = 24; x < W; x += 48) g.lineBetween(x, 24, x, H - 24)
    for (let y = 24; y < H; y += 48) g.lineBetween(24, y, W - 24, y)
    g.lineStyle(1, CYAN, .35).strokeRoundedRect(24, 24, W - 48, H - 48, 8)
    const nodes = this.snapshot.nodes
    if (!nodes.length) return
    const left = Math.min(...nodes.map(n => n.x))
    const top = Math.min(...nodes.map(n => n.y))
    const width = Math.max(...nodes.map(n => n.x + n.w)) - left
    const height = Math.max(...nodes.map(n => n.y + n.h)) - top
    const scale = Math.min(1000 / Math.max(1, width), 540 / Math.max(1, height), 1)
    const tx = (x: number) => (x - left) * scale + (W - width * scale) / 2
    const ty = (y: number) => (y - top) * scale + (H - height * scale) / 2
    const byId = new Map(nodes.map(n => [n.id, n]))
    g.lineStyle(1, CYAN, .12)
    this.snapshot.links.forEach(l => {
      const a = byId.get(l.from), b = byId.get(l.to)
      if (a && b) g.lineBetween(tx(a.x + a.w / 2), ty(a.y + a.h / 2), tx(b.x + b.w / 2), ty(b.y + b.h / 2))
    })
    nodes.forEach(n => {
      const color = Phaser.Display.Color.HexStringToColor(n.color).color
      g.lineStyle(1, color, .13).strokeRoundedRect(tx(n.x), ty(n.y), n.w * scale, n.h * scale, 4)
      if (n.w * scale > 90) this.add.text(tx(n.x) + 8, ty(n.y) + 8, n.title.slice(0, 28), { fontFamily: font, fontSize: '12px', color: n.color }).setAlpha(.14)
    })
    this.snapshot.texts.forEach(t => this.add.text(tx(t.x), ty(t.y), t.content.slice(0, 32), { fontFamily: font, fontSize: '20px', color: t.color }).setAlpha(.12))
  }

  private makeTextures() {
    const graphics = this.make.graphics({ x: 0, y: 0 })
    graphics.fillStyle(0xffffff).fillRect(0, 0, 4, 4).generateTexture('spark', 4, 4)
    graphics.clear().fillStyle(0xffffff).fillRoundedRect(0, 0, 18, 5, 2).generateTexture('bolt', 18, 5)
    graphics.clear().fillStyle(0x123436).fillRoundedRect(0, 0, 42, 36, 5)
    graphics.lineStyle(2, CYAN).strokeRoundedRect(1, 1, 40, 34, 5)
    graphics.lineStyle(2, CYAN, .5).lineBetween(8, 13, 33, 13).lineBetween(8, 20, 25, 20)
    graphics.generateTexture('segment', 42, 36)
    graphics.clear().fillStyle(0x12383c).fillRoundedRect(0, 0, 58, 42, 6)
    graphics.lineStyle(2, CYAN).strokeRoundedRect(1, 1, 56, 40, 6)
    graphics.fillStyle(CYAN).fillTriangle(20, 12, 39, 21, 20, 30).generateTexture('player', 58, 42)
    graphics.destroy()
    const templates = this.snapshot.nodes.length ? this.snapshot.nodes.slice(0, 24) : [
      { title: 'SHIP IT', color: '#ff534b' }, { title: 'ONE MORE THING', color: '#55e5ed' },
      { title: 'SIDE QUEST', color: '#f6db42' }, { title: 'NEXT LEVEL', color: '#83ef75' },
    ]
    this.textureCount = templates.length
    templates.forEach((n, i) => {
      const texture = this.textures.createCanvas(`card-${i}`, 160, 84)
      if (!texture) return
      const ctx = texture.context
      ctx.fillStyle = '#10191d'
      ctx.strokeStyle = n.color
      ctx.lineWidth = 2
      ctx.shadowColor = n.color; ctx.shadowBlur = this.reduced ? 0 : 8
      ctx.beginPath(); ctx.roundRect(7, 7, 146, 70, 6); ctx.fill(); ctx.stroke()
      ctx.shadowBlur = 0
      ctx.fillStyle = n.color; ctx.fillRect(17, 63, 94, 3)
      ctx.fillStyle = '#ff7058'; ctx.fillRect(132, 61, 6, 6)
      ctx.font = 'bold 12px Arial'; ctx.fillStyle = '#f6f8f9'
      wrapArcadeTitle(n.title, text => ctx.measureText(text).width, 126).forEach((line, row) => ctx.fillText(line, 17, 29 + row * 17))
      texture.refresh()
    })
  }

  private createSnake() {
    this.stats.lives = 1
    this.snakeConnections = this.add.graphics().setDepth(9)
    this.snack = this.add.container(0, 0).setDepth(10)
    this.snack.add(this.add.image(0, -22, 'card-0').setScale(.75))
    this.snack.add(this.add.rectangle(0, 24, 10, 10, 0xf6db42).setAngle(45))
    this.drawSnake(false)
  }

  private drawSnake(animate: boolean) {
    this.snakeConnections.clear()
    if (!this.reduced && this.body.length > 1) {
      for (const [width, alpha] of [[12, .06], [5, .15], [1, .8]]) {
        this.snakeConnections.lineStyle(width, CYAN, alpha).beginPath()
        this.body.forEach((cell, i) => {
          if (i === 0) this.snakeConnections.moveTo(48 + cell.x * 48, 48 + cell.y * 48)
          else this.snakeConnections.lineTo(48 + cell.x * 48, 48 + cell.y * 48)
        })
        this.snakeConnections.strokePath()
      }
      if (animate) {
        const tail = this.segments.at(-1)
        if (tail) this.particles.setParticleTint(CYAN).emitParticleAt(tail.x, tail.y, 3)
      }
    }
    this.body.forEach((cell, i) => {
      const x = 48 + cell.x * 48, y = 48 + cell.y * 48
      let segment = this.segments[i]
      if (!segment) {
        segment = this.add.image(x, y, i === 0 ? 'player' : `card-${(i - 1) % this.textureCount}`).setDepth(12 - i * .001)
        if (i === 0) segment.setScale(.8)
        else segment.setDisplaySize(44, 34)
        this.segments.push(segment)
      }
      segment.setAlpha(Math.max(.4, 1 - i * .012))
      if (animate && !this.reduced) this.tweens.add({ targets: segment, x, y, duration: Math.max(60, 175 - this.stats.level * 8), ease: 'Linear' })
      else segment.setPosition(x, y)
    })
    this.segments[0].setAngle({ right: 0, down: 90, left: 180, up: 270 }[this.direction])
    this.snack.setPosition(48 + this.food.x * 48, 24 + this.food.y * 48)
  }

  private createShooter() {
    this.physics.world.setBounds(30, 30, W - 60, H - 60)
    this.player = this.physics.add.image(W / 2, H / 2, 'player').setDepth(12).setCollideWorldBounds(true)
    this.player.setCircle(20, 9, 1)
    this.enemies = this.physics.add.group({ maxSize: 32 })
    this.bullets = this.physics.add.group({ maxSize: 90 })
    this.aim = this.add.graphics().setDepth(5)
    this.physics.add.overlap(this.bullets, this.enemies, (a, b) => {
      const bullet = a as Sprite, enemy = b as Sprite
      if (!bullet.active || !enemy.active || this.stats.phase !== 'playing') return
      bullet.disableBody(true, true)
      enemy.disableBody(true, true)
      this.combo = this.elapsed - this.lastKill < 1600 ? Math.min(5, this.combo + 1) : 1
      this.lastKill = this.elapsed
      const points = 10 * this.combo
      this.stats.score += points
      this.stats.level = 1 + Math.floor(this.stats.score / 200)
      this.burst(enemy.x, enemy.y, CORAL)
      this.popup(enemy.x, enemy.y, `+${points}${this.combo > 1 ? `  x${this.combo}` : ''}`)
      this.audio.play('hit')
      this.publish()
    })
    this.physics.add.overlap(this.player, this.enemies, (_a, b) => {
      const enemy = b as Sprite
      if (this.stats.phase !== 'playing' || this.elapsed < this.immuneUntil || !enemy.active) return
      enemy.disableBody(true, true)
      this.stats.lives--
      this.immuneUntil = this.elapsed + 1600
      this.burst(this.player.x, this.player.y, CYAN)
      this.audio.play('hit')
      if (!this.reduced) this.cameras.main.shake(140, .004)
      if (this.stats.lives <= 0) this.finish()
      else this.publish()
    })
    for (let i = 0; i < 5; i++) this.spawnEnemy()
    this.physics.world.pause()
  }

  private spawnEnemy() {
    if (this.enemies.countActive(true) >= 28) return
    const side = Phaser.Math.Between(0, 3)
    const x = side === 0 ? -70 : side === 1 ? W + 70 : Phaser.Math.Between(90, W - 90)
    const y = side === 2 ? -45 : side === 3 ? H + 45 : Phaser.Math.Between(75, H - 75)
    const enemy = this.enemies.get(x, y, `card-${Phaser.Math.Between(0, this.textureCount - 1)}`) as Sprite | null
    if (!enemy) return
    enemy.enableBody(true, x, y, true, true).setTexture(`card-${Phaser.Math.Between(0, this.textureCount - 1)}`).setDepth(8)
    enemy.setSize(146, 68).setOffset(7, 8)
    enemy.setData('sway', Phaser.Math.FloatBetween(-1, 1))
  }

  private burst(x: number, y: number, color: number) {
    this.particles.setParticleTint(color)
    this.particles.explode(this.reduced ? 6 : 25, x, y)
    if (this.reduced) return
    const ring = this.add.circle(x, y, 8).setStrokeStyle(2, color).setDepth(20)
    this.tweens.add({ targets: ring, scale: 6, alpha: 0, duration: 330, onComplete: () => ring.destroy() })
  }

  private popup(x: number, y: number, value: string) {
    const text = this.add.text(x, y, value, { fontFamily: font, fontSize: '21px', fontStyle: 'bold', color: '#f6db42' }).setOrigin(.5).setDepth(40)
    this.tweens.add({ targets: text, y: y - 50, alpha: 0, duration: 600, onComplete: () => text.destroy() })
  }

  setKey(code: string, down: boolean) {
    if (!this.alive) return
    if (down) this.keys.add(code)
    else this.keys.delete(code)
    if (!down || this.stats.phase !== 'playing' || this.mode !== 'snake' || this.turns.length >= 2) return
    const next = ({ ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' } as Record<string, Direction>)[code]
    const previous = this.turns.at(-1) ?? this.direction
    if (next && next !== previous && canTurn(previous, next)) this.turns.push(next)
  }

  start() {
    if (!this.alive || this.stats.phase !== 'ready') return
    this.stats.phase = 'playing'
    this.physics.world.resume()
    this.audio.play('start')
    this.publish()
  }

  pause() {
    this.keys.clear()
    if (!this.alive || this.stats.phase !== 'playing') return
    this.stats.phase = 'paused'
    this.physics.world.pause()
    this.publish()
    this.scene.pause()
  }

  resume() {
    if (!this.alive || this.stats.phase !== 'paused') return
    this.stats.phase = 'playing'
    this.keys.clear()
    this.scene.resume()
    this.physics.world.resume()
    this.publish()
  }

  private publish() { this.report({ ...this.stats, elapsedMs: Math.floor(this.elapsed) }) }

  private finish() {
    this.stats.phase = 'over'
    this.keys.clear()
    this.physics.world.pause()
    this.audio.play('over')
    this.publish()
  }

  update(_time: number, delta: number) {
    if (this.stats.phase !== 'playing') return
    this.elapsed += Math.min(delta, 50)
    if (this.elapsed >= 3600000 || this.stats.score >= 499950) { this.finish(); return }
    if (this.mode === 'snake') {
      this.snakeClock += Math.min(delta, 50)
      const interval = Math.max(90, 210 - this.stats.level * 8)
      if (this.snakeClock < interval) return
      this.snakeClock %= interval
      this.direction = this.turns.shift() ?? this.direction
      const result = stepSnake(this.body, this.direction, this.food, 24, 14)
      if (result.collision) {
        this.burst(this.segments[0].x, this.segments[0].y, CORAL)
        this.finish(); return
      }
      this.body = result.body
      if (result.ate) {
        this.stats.score += 25
        this.stats.level = 1 + Math.floor(this.stats.score / 100)
        this.burst(48 + this.food.x * 48, 48 + this.food.y * 48, 0xf6db42)
        this.audio.play('eat')
        const food = placeFood(this.body, 24, 14)
        if (!food) { this.finish(); return }
        this.food = food
        ;(this.snack.list[0] as Phaser.GameObjects.Image).setTexture(`card-${(this.body.length - 3) % this.textureCount}`)
        this.publish()
      }
      this.drawSnake(true)
      return
    }
    const axis = (positive: string[], negative: string[]) => Number(positive.some(k => this.keys.has(k))) - Number(negative.some(k => this.keys.has(k)))
    const dx = axis(['KeyD', 'ArrowRight'], ['KeyA', 'ArrowLeft'])
    const dy = axis(['KeyS', 'ArrowDown'], ['KeyW', 'ArrowUp'])
    const length = Math.hypot(dx, dy) || 1
    this.player.setVelocity(dx / length * 340, dy / length * 340)
    const pointer = this.input.activePointer
    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, pointer.x || W, pointer.y || H / 2)
    this.player.setRotation(angle).setAlpha(this.elapsed < this.immuneUntil ? .4 + Math.sin(this.elapsed / 60) * .25 : 1)
    this.aim.clear().lineStyle(1, CYAN, .22).lineBetween(this.player.x, this.player.y, pointer.x, pointer.y)
    this.aim.lineStyle(1, CYAN, .75).strokeCircle(pointer.x, pointer.y, 11)
    if ((pointer.isDown || this.keys.has('Space')) && this.elapsed - this.lastShot > 145) {
      const bullet = this.bullets.get(this.player.x, this.player.y, 'bolt') as Sprite | null
      if (bullet) {
        bullet.enableBody(true, this.player.x, this.player.y, true, true).setTint(CYAN).setRotation(angle).setDepth(15)
        bullet.setVelocity(Math.cos(angle) * 820, Math.sin(angle) * 820)
        this.audio.play('shoot')
      }
      this.lastShot = this.elapsed
    }
    for (const child of this.bullets.getChildren()) {
      const bullet = child as Sprite
      if (bullet.active && (bullet.x < -30 || bullet.x > W + 30 || bullet.y < -30 || bullet.y > H + 30)) bullet.disableBody(true, true)
    }
    for (const child of this.enemies.getChildren()) {
      const enemy = child as Sprite
      if (enemy.active) {
        this.physics.moveToObject(enemy, this.player, Math.min(155, 46 + this.stats.level * 7))
        if (!this.reduced) enemy.setAngle(Math.sin(this.elapsed / 700 + enemy.getData('sway')) * 5)
      }
    }
    if (this.elapsed > this.nextSpawn) {
      this.spawnEnemy()
      this.nextSpawn = this.elapsed + Math.max(300, 1100 - this.stats.level * 65)
    }
    if (!this.reduced && (dx || dy) && this.game.loop.frame % 3 === 0) {
      this.particles.setParticleTint(CYAN).emitParticleAt(this.player.x - Math.cos(angle) * 25, this.player.y - Math.sin(angle) * 25, 1)
    }
  }
}

export function createArcadeGame(parent: HTMLElement, scene: BoardArcadeScene) {
  return new Phaser.Game({
    type: Phaser.AUTO, parent, width: W, height: H, backgroundColor: '#080d10',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { debug: false } },
    input: { keyboard: false }, audio: { noAudio: true },
    render: { antialias: true, powerPreference: 'high-performance' },
    fps: { target: 60 }, scene, banner: false,
  })
}
