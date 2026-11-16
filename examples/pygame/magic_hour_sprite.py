import argparse
from pathlib import Path

import pygame


def main():
    parser = argparse.ArgumentParser(description="Use a completed Magic Hour image as a Pygame sprite.")
    parser.add_argument("image", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()

    pygame.display.init()
    pygame.font.init()
    window = pygame.display.set_mode((848, 544))
    pygame.display.set_caption("Magic Hour sprite")
    font = pygame.font.Font(None, 27)

    source = pygame.image.load(str(args.image)).convert_alpha()
    fitted = source.get_rect().fit(pygame.Rect(0, 0, 296, 296))
    sprite = pygame.sprite.Sprite()
    sprite.image = pygame.transform.smoothscale(source, fitted.size)
    sprite.rect = sprite.image.get_rect(topleft=(64, 150))
    sprites = pygame.sprite.Group(sprite)
    play_area = pygame.Rect(40, 108, 768, 394)
    clock = pygame.time.Clock()
    running = True

    while running:
        save = False
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    running = False
                elif event.key == pygame.K_s:
                    save = True

        keys = pygame.key.get_pressed()
        sprite.rect.move_ip(
            5 * (keys[pygame.K_RIGHT] - keys[pygame.K_LEFT]),
            5 * (keys[pygame.K_DOWN] - keys[pygame.K_UP]),
        )
        sprite.rect.clamp_ip(play_area)
        window.fill("#f0f2ee")
        title = font.render("Magic Hour sprite", True, "#172622")
        controls = font.render("Arrow keys move the sprite. Press S to save a PNG.", True, "#334943")
        window.blit(title, (40, 32))
        window.blit(controls, (40, 66))
        pygame.draw.rect(window, "#dce7e1", play_area)
        sprites.draw(window)
        pygame.display.flip()
        if save:
            pygame.image.save(window, str(args.output))
        clock.tick(60)

    pygame.quit()


if __name__ == "__main__":
    main()
