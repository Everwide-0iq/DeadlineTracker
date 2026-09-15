import Phaser from 'phaser'
import { BoardArcadeScene } from './BoardArcadeScene.ts'
import { boardGameNodes } from './arcade.model.ts'

type Sprite = Phaser.Physics.Arcade.Image
const W = 1200, H = 720

export class RogueArcadeScene extends BoardArcadeScene {
  private threats!: Phaser.Physics.Arcade.Group
  private kills = 0
  private power = 1
  private cadence = 300
  private speed = 285
  private dashUntil = 0
  private dashReady = 0
  private nextThreat = 0
  private lastBossLevel = 0
  private waveLabel!: Phaser.GameObjects.Text

  protected createMode() {
    this.physics.world.setBounds(30, 30, W - 60, H - 60)
    this.player = this.physics.add.image(W / 2, H / 2, 'player').setDepth(12).setCollideWorldBounds(true)
    this.player.setCircle(17, 12, 4)
    this.enemies = this.physics.add.group({ maxSize: 50 })
    this.bullets = this.physics.add.group({ maxSize: 100 })
    this.threats = this.physics.add.group({ maxSize: 80 })
    this.waveLabel = this.add.text(38, H - 50, 'WAVE 01', { fontFamily: 'monospace', fontSize: '16px', color: '#c0fb72' }).setDepth(20)
    this.physics.add.overlap(this.bullets, this.enemies, (a, b) => {
      const bullet = a as Sprite, enemy = b as Sprite
      if (!bullet.active || !enemy.active || this.stats.phase !== 'playing' || this.stats.upgrade) return
      bullet.disableBody(true, true)
      const hp = Number(enemy.getData('hp')) - this.power
      enemy.setData('hp', hp)
      if (hp > 0) { this.burst(enemy.x, enemy.y, 0xf6db42); return }
      const boss = enemy.getData('boss') === true
      enemy.disableBody(true, true)
      this.kills++
      const points = boss ? 100 : 20
      this.stats.score += points
      this.popup(enemy.x, enemy.y, `+${points}`)
      this.burst(enemy.x, enemy.y, boss ? 0xf6db42 : 0xc0fb72)
      this.audio.play('eat')
      if (this.kills % 12 === 0) {
        this.stats.level++
        this.stats.upgrade = true
        this.keys.clear()
        this.physics.world.pause()
        this.waveLabel.setText(`WAVE ${String(this.stats.level).padStart(2, '0')}`)
      }
      this.publish()
    })
    const damage = (_a: unknown, b: unknown) => {
      const threat = b as Sprite
      if (!threat.active || this.stats.phase !== 'playing' || this.stats.upgrade || this.elapsed < this.immuneUntil) return
      threat.disableBody(true, true)
      this.stats.lives--
      this.immuneUntil = this.elapsed + 1400
      this.burst(this.player.x, this.player.y, 0xff534b)
      this.audio.play('hit')
      if (!this.reduced) this.cameras.main.shake(120, .004)
      if (this.stats.lives <= 0) this.finish()
      else this.publish()
    }
    this.physics.add.overlap(this.player, this.enemies, damage)
    this.physics.add.overlap(this.player, this.threats, damage)
    for (const node of boardGameNodes(this.snapshot).slice(0, 5)) {
      const x = Phaser.Math.Clamp(node.x + node.w / 2, 70, W - 70)
      const y = Phaser.Math.Clamp(node.y + node.h / 2, 70, H - 70)
      if (Phaser.Math.Distance.Between(x, y, W / 2, H / 2) > 220) this.spawnAt(x, y)
    }
    this.physics.world.pause()
  }

  private spawnAt(x: number, y: number) {
    const enemy = this.enemies.get(x, y, `card-${Phaser.Math.Between(0, this.textureCount - 1)}`) as Sprite | null
    if (!enemy) return
    const boss = this.stats.level % 3 === 0 && this.lastBossLevel !== this.stats.level
    if (boss) this.lastBossLevel = this.stats.level
    enemy.enableBody(true, x, y, true, true).setTexture(`card-${Phaser.Math.Between(0, this.textureCount - 1)}`)
      .setScale(boss ? 1.2 : .55).setTint(boss ? 0xf6db42 : 0xffffff).setDepth(8)
    enemy.setSize(140, 66).setOffset(10, 9).setData('hp', boss ? 15 + this.stats.level : 1 + Math.floor(this.stats.level / 3)).setData('boss', boss)
    enemy.setData('shootAt', this.elapsed + Phaser.Math.Between(1500, 4000))
  }

  override chooseUpgrade(index: number) {
    if (!this.stats.upgrade || this.stats.phase !== 'playing') return
    if (index === 0) { this.power = Math.min(15, this.power + 1); this.cadence = Math.max(100, this.cadence - 15) }
    else if (index === 1) { this.stats.lives = Math.min(3, this.stats.lives + 1); this.immuneUntil = this.elapsed + 2500 }
    else if (index === 2) { this.speed = Math.min(440, this.speed + 25); this.dashReady = 0 }
    else return
    this.stats.upgrade = false
    this.keys.clear()
    this.physics.world.resume()
    this.audio.play('start')
    this.publish()
  }

  override setKey(code: string, down: boolean) {
    if (down && this.stats.upgrade) this.chooseUpgrade(Number(code.replace('Digit', '')) - 1)
    else super.setKey(code, down)
  }

  override resume() {
    super.resume()
    if (this.stats.upgrade) this.physics.world.pause()
  }

  override update(_time: number, delta: number) {
    if (this.stats.phase !== 'playing' || this.stats.upgrade) return
    this.elapsed += Math.min(delta, 50)
    if (this.elapsed >= 3600000 || this.stats.score >= 499900) { this.finish(); return }
    const dx = Number(this.keys.has('KeyD') || this.keys.has('ArrowRight')) - Number(this.keys.has('KeyA') || this.keys.has('ArrowLeft'))
    const dy = Number(this.keys.has('KeyS') || this.keys.has('ArrowDown')) - Number(this.keys.has('KeyW') || this.keys.has('ArrowUp'))
    if ((this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) && this.elapsed >= this.dashReady && (dx || dy)) {
      this.dashUntil = this.elapsed + 160
      this.dashReady = this.elapsed + 2200
      this.immuneUntil = Math.max(this.immuneUntil, this.dashUntil)
      this.audio.play('shoot')
    }
    const speed = this.elapsed < this.dashUntil ? 800 : this.speed
    const length = Math.hypot(dx, dy) || 1
    this.player.setVelocity(dx / length * speed, dy / length * speed)
      .setAlpha(this.elapsed < this.immuneUntil ? .55 : 1)
    let nearest: Sprite | null = null, distance = Infinity
    for (const item of this.enemies.getChildren()) {
      const enemy = item as Sprite
      if (!enemy.active) continue
      const next = Phaser.Math.Distance.BetweenPoints(this.player, enemy)
      if (next < distance) { nearest = enemy; distance = next }
      this.physics.moveToObject(enemy, this.player, Math.min(210, 48 + this.stats.level * 9))
      if (this.stats.level >= 2 && this.elapsed > Number(enemy.getData('shootAt'))) {
        const shot = this.threats.get(enemy.x, enemy.y, 'spark') as Sprite | null
        if (shot) {
          shot.enableBody(true, enemy.x, enemy.y, true, true).setScale(2.5).setTint(0xff534b).setDepth(14)
          this.physics.moveToObject(shot, this.player, 160 + Math.min(100, this.stats.level * 8))
        }
        enemy.setData('shootAt', this.elapsed + (enemy.getData('boss') ? 650 : 3200))
      }
    }
    if (nearest && this.elapsed - this.lastShot >= this.cadence) {
      const angle = Phaser.Math.Angle.BetweenPoints(this.player, nearest)
      this.player.setRotation(angle)
      const shot = this.bullets.get(this.player.x, this.player.y, 'bolt') as Sprite | null
      if (shot) {
        shot.enableBody(true, this.player.x, this.player.y, true, true).setTint(0xc0fb72).setRotation(angle).setDepth(14)
        shot.setVelocity(Math.cos(angle) * 750, Math.sin(angle) * 750)
        this.audio.play('shoot')
      }
      this.lastShot = this.elapsed
    }
    for (const group of [this.bullets, this.threats]) for (const item of group.getChildren()) {
      const shot = item as Sprite
      if (shot.active && (shot.x < -100 || shot.x > W + 100 || shot.y < -100 || shot.y > H + 100)) shot.disableBody(true, true)
    }
    if (this.elapsed >= this.nextThreat) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2)
      this.spawnAt(W / 2 + Math.cos(angle) * 650, H / 2 + Math.sin(angle) * 410)
      this.nextThreat = this.elapsed + Math.max(250, 1200 - this.stats.level * 100)
    }
    if (!this.reduced && (dx || dy) && this.game.loop.frame % 3 === 0) this.particles.setParticleTint(0xc0fb72).emitParticleAt(this.player.x, this.player.y, 2)
    this.waveLabel.setColor(this.elapsed >= this.dashReady ? '#c0fb72' : '#64736b')
  }
}
