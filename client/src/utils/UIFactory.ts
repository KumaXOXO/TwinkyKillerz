import Phaser from 'phaser';
import { THEME, toHex } from './Theme';

export class UIFactory {
  static createPanel(scene: Phaser.Scene, x: number, y: number, width: number, height: number) {
    const bg = scene.add.rectangle(x, y, width, height, toHex(THEME.colors.panel), 0.9);
    bg.setStrokeStyle(2, toHex(THEME.colors.border));

    scene.tweens.add({
      targets: bg,
      y: y - 2,
      duration: 2000 + Math.random() * 1000,
      ease: 'Sine.easeInOut',
      yoyo: true,
      loop: -1
    });

    return bg;
  }

  static createButton(
    scene: Phaser.Scene,
    x: number, y: number,
    width: number, height: number,
    text: string,
    callback: () => void
  ): Phaser.GameObjects.Container {
    const container = scene.add.container(x, y);

    const bg = scene.add.rectangle(0, 0, width, height, toHex(THEME.colors.border));
    bg.setStrokeStyle(2, toHex(THEME.colors.secondary));
    bg.setInteractive({ useHandCursor: true });

    const label = scene.add.text(0, 0, text, {
      fontFamily: THEME.fonts.header,
      fontSize: '14px',
      color: THEME.colors.text,
    }).setOrigin(0.5);

    container.add([bg, label]);

    bg.on('pointerover', () => {
      bg.setFillStyle(toHex(THEME.colors.secondary));
      scene.tweens.add({
        targets: container,
        scale: 1.05,
        duration: 100,
        ease: 'Power1',
      });
    });

    bg.on('pointerout', () => {
      bg.setFillStyle(toHex(THEME.colors.border));
      scene.tweens.add({
        targets: container,
        scale: 1,
        duration: 100,
        ease: 'Power1',
      });
    });

    bg.on('pointerdown', () => {
      scene.tweens.add({
        targets: container,
        scaleX: 0.94,
        scaleY: 0.94,
        duration: 80,
        yoyo: true,
        ease: 'Power1',
      });
      callback();
    });

    return container;
  }

  static createHeader(scene: Phaser.Scene, x: number, y: number, text: string): Phaser.GameObjects.Text {
    return scene.add.text(x, y, text, {
      fontFamily: THEME.fonts.header,
      fontSize: '24px',
      color: THEME.colors.primary,
    }).setOrigin(0.5).setShadow(2, 2, '#000000', 0, true, true);
  }

  static createLabel(
    scene: Phaser.Scene,
    x: number, y: number,
    text: string,
    size = '16px',
    color = THEME.colors.text
  ): Phaser.GameObjects.Text {
    return scene.add.text(x, y, text, {
      fontFamily: THEME.fonts.body,
      fontSize: size,
      color,
    });
  }
}
