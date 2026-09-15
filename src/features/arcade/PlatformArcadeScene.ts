import Phaser from 'phaser'
import { BoardArcadeScene } from './BoardArcadeScene.ts'
import { boardGameNodes } from './arcade.model.ts'

type Sprite = Phaser.Physics.Arcade.Image
type Platform = Phaser.Physics.Arcade.Image & { body: Phaser.Physics.Arcade.StaticBody }

export class PlatformArcadeScene extends BoardArcadeScene {
  private platforms!: Phaser.Physics.Arcade.StaticGroup
  private coins!: Phaser.Physics.Arcade.StaticGroup
  private hazards!: Phaser.Physics.Arcade.Group
  private goal!: Phaser.Physics.Arcade.Image
  private checkpoint = { x: 110, y: 590 }
  private jumpBuffered = -1000
  private groundedAt = -1000
  private jumps = 0
  private timeLeft = 40
  private timerLabel!: Phaser.GameObjects.Text
  private lastSecond = -1
  private wasGrounded = false
  private portalRing!: Phaser.GameObjects.Arc
  private levelEffects!: Phaser.GameObjects.Graphics

  protected createMode() {
    this.player = this.physics.add.image(110, 590, 'player').setScale(.7).setDepth(12)
    this.player.setSize(42, 38).setOffset(8, 2).setGravityY(1250)
    this.platforms = this.physics.add.staticGroup()
    this.coins = this.physics.add.staticGroup()
    this.hazards = this.physics.add.group({ maxSize: 8 })
    this.goal = this.physics.add.image(0, 0, 'segment').setTint(0xc0fb72).setDepth(10)
    this.goal.setImmovable(true)
    this.portalRing = this.add.circle(0, 0, 30).setStrokeStyle(2, 0xc0fb72, .8).setDepth(9)
    this.levelEffects = this.add.graphics().setDepth(5)
    this.timerLabel = this.add.text(40, 692, '', { fontFamily: 'monospace', fontSize: '20px', color: '#f6db42' }).setDepth(20)
    this.physics.add.collider(this.player, this.platforms, (_a, b) => {
      const platform = b as Platform
      if (this.player.body?.touching.down) {
        this.checkpoint = { x: platform.x, y: platform.y - platform.displayHeight / 2 - 35 }
      }
    })
    this.physics.add.overlap(this.player, this.coins, (_a, b) => {
      const coin = b as Platform
      if (!coin.active || this.stats.phase !== 'playing') return
      coin.disableBody(true, true)
      this.stats.score += 10
      this.burst(coin.x, coin.y, 0xf6db42)
      this.popup(coin.x, coin.y - 12, '+10')
      this.audio.play('eat')
      this.publish()
    })
    this.physics.add.overlap(this.player, this.goal, () => {
      if (this.stats.phase !== 'playing') return
      this.stats.score += 100 + Math.floor(Math.max(0, this.timeLeft) / 5) * 10
      this.stats.level++
      this.audio.play('start')
      this.burst(this.goal.x, this.goal.y, 0xc0fb72)
      if (!this.reduced) this.cameras.main.flash(140, 60, 120, 100)
      this.makeStage()
      this.popup(600, 290, `SPRINT ${this.stats.level}`)
      this.publish()
    })
    this.physics.add.overlap(this.player, this.hazards, () => this.damage())
    this.makeStage()
    this.physics.world.pause()
  }

  private addPlatform(x: number, y: number, width: number, texture: number) {
    const platform = this.platforms.create(x, y, `card-${texture % this.textureCount}`) as Platform
    platform.setScale(width / platform.width).setAlpha(.95).setDepth(6).refreshBody()
    platform.body.checkCollision.down = false
    platform.body.checkCollision.left = false
    platform.body.checkCollision.right = false
    return platform
  }

  private makeStage() {
    this.platforms.clear(true, true)
    this.coins.clear(true, true)
    this.hazards.clear(true, true)
    this.jumps = 0
    this.jumpBuffered = -1000
    this.groundedAt = -1000
    this.wasGrounded = false
    this.timeLeft = Math.max(22, 42 - this.stats.level * 1.5)
    this.immuneUntil = this.elapsed + 1000
    const start = this.addPlatform(120, 645, 195, 0)
    this.checkpoint = { x: start.x, y: start.y - start.displayHeight / 2 - 35 }
    this.player.setPosition(this.checkpoint.x, this.checkpoint.y).setVelocity(0, 0)
    let x = 120
    const width = Math.max(95, 185 - this.stats.level * 7)
    for (let i = 1; i <= 6; i++) {
      x += Phaser.Math.Between(110, 155)
      const y = 645 - i * 70
      const platform = this.addPlatform(x, y, width, this.stats.level + i)
      const coin = this.coins.create(x, y - platform.displayHeight / 2 - 25, 'spark') as Platform
      coin.setScale(3).setAngle(45).setTint(0xf6db42).setDepth(10).refreshBody()
    }
    this.goal.setPosition(x, 140)
    this.portalRing.setPosition(x, 140)
    // Existing project cards become extra one-way ledges; generated ledges guarantee a route.
    for (const node of boardGameNodes(this.snapshot).slice(0, 10)) {
      if (node.y > 220 && node.y < 560) this.addPlatform(Phaser.Math.Clamp(node.x + node.w / 2, 80, 1120), node.y, Phaser.Math.Clamp(node.w, 90, 220), this.platforms.getLength())
    }
    for (let i = 0; i < Math.min(7, this.stats.level + 1); i++) {
      const hazard = this.hazards.create(450 + i * 90, 210 + i * 55, 'bolt') as Sprite
      hazard.setScale(1.7).setTint(0xff534b).setDepth(11).setData('home', hazard.x).setData('phase', i * 1.4)
    }
  }

  private damage() {
    if (this.stats.phase !== 'playing' || this.elapsed < this.immuneUntil) return
    this.stats.lives--
    this.burst(this.player.x, Math.min(this.player.y, 700), 0xff534b)
    this.audio.play('hit')
    if (this.stats.lives <= 0) { this.finish(); return }
    this.immuneUntil = this.elapsed + 1700
    this.player.setPosition(this.checkpoint.x, this.checkpoint.y).setVelocity(0, 0)
    this.jumps = 0
    this.timeLeft = Math.max(12, this.timeLeft)
    this.publish()
  }

  override setKey(code: string, down: boolean) {
    if (down && !this.keys.has(code) && ['Space', 'ArrowUp', 'KeyW'].includes(code) && this.stats.phase === 'playing') this.jumpBuffered = this.elapsed
    super.setKey(code, down)
  }

  override update(_time: number, delta: number) {
    if (this.stats.phase !== 'playing') return
    const dt = Math.min(delta, 50)
    this.elapsed += dt
    this.timeLeft -= dt / 1000
    if (this.elapsed >= 3600000 || this.stats.score >= 499800) { this.finish(); return }
    const body = this.player.body as Phaser.Physics.Arcade.Body
    const grounded = body.touching.down || body.blocked.down
    if (grounded) {
      this.groundedAt = this.elapsed; this.jumps = 0
      if (!this.wasGrounded) {
        this.particles.setParticleTint(0x55e5ed).explode(this.reduced ? 4 : 18, this.player.x, this.player.y + 15)
        if (!this.reduced) {
          const ripple = this.add.ellipse(this.player.x, this.player.y + 16, 35, 8).setStrokeStyle(2, 0x55e5ed).setDepth(15)
          this.tweens.add({ targets: ripple, scaleX: 3, scaleY: 1.5, alpha: 0, duration: 350, onComplete: () => ripple.destroy() })
        }
      }
    }
    this.wasGrounded = grounded
    if (this.elapsed - this.jumpBuffered < 130 && (this.elapsed - this.groundedAt < 110 || this.jumps < 2)) {
      this.player.setVelocityY(-555)
      this.jumps++
      this.jumpBuffered = -1000
      this.groundedAt = -1000
      this.audio.play('shoot')
      this.burst(this.player.x, this.player.y + 14, this.jumps > 1 ? 0xf6db42 : 0x55e5ed)
    }
    const dx = Number(this.keys.has('ArrowRight') || this.keys.has('KeyD')) - Number(this.keys.has('ArrowLeft') || this.keys.has('KeyA'))
    this.player.setVelocityX(dx * 310).setFlipX(dx < 0)
    this.player.x = Phaser.Math.Clamp(this.player.x, 25, 1175)
    this.player.setAlpha(this.elapsed < this.immuneUntil ? .5 : 1)
    if (this.player.y > 780 || this.timeLeft <= 0) this.damage()
    for (const item of this.hazards.getChildren()) {
      const hazard = item as Sprite
      hazard.setVelocityX(Math.cos(this.elapsed / 650 + Number(hazard.getData('phase'))) * (100 + this.stats.level * 12))
      if (hazard.x < 80 || hazard.x > 1140) hazard.setPosition(Number(hazard.getData('home')), hazard.y)
    }
    if (Math.ceil(this.timeLeft) !== this.lastSecond) {
      this.lastSecond = Math.ceil(this.timeLeft)
      this.timerLabel.setText(`${String(this.lastSecond).padStart(2, '0')}s  /  SPRINT ${this.stats.level}`)
        .setColor(this.timeLeft < 10 ? '#ff534b' : '#f6db42')
    }
    this.portalRing.setScale(this.reduced ? 1 : 1 + Math.sin(this.elapsed / 230) * .12)
    if (!this.reduced) {
      this.levelEffects.clear()
      for (const item of this.platforms.getChildren()) {
        const platform = item as Platform
        const top = platform.y - platform.displayHeight / 2 + 5
        this.levelEffects.lineStyle(5, 0x55e5ed, .07).lineBetween(platform.x - platform.displayWidth / 2, top, platform.x + platform.displayWidth / 2, top)
      }
      if (this.game.loop.frame % 3 === 0) {
        if (dx || !grounded) this.particles.setParticleTint(this.jumps > 1 ? 0xf6db42 : 0x55e5ed).emitParticleAt(this.player.x, this.player.y + 10, 2)
        const angle = this.elapsed / 250
        this.particles.setParticleTint(0xc0fb72).emitParticleAt(this.goal.x + Math.cos(angle) * 30, this.goal.y + Math.sin(angle) * 30, 1)
      }
    }
  }
}
