# Use a completed Magic Hour image in Pygame

Recover a completed image through your existing Magic Hour MCP connection. Look up the project with `get_image_project`, then save the image using the returned download or `fetch_image_download`. The example takes that saved file as input.

Install Pygame and run this from the repository root with separate input and output paths.

```sh
python -m pip install pygame==2.6.1
python examples/pygame/magic_hour_sprite.py ./image.png ./scene.png
```

Use the arrow keys to move the sprite. Press **S** to save the scene as a PNG and **Esc** to exit.
