# Make a Magic Hour image thumbnail with Apache Hamilton

Download a completed image from Magic Hour. Run these commands from this directory with Python 3.12.

```sh
python -m pip install -r requirements.txt
python run.py /path/to/downloaded-image.png thumbnail.png
```

The workflow saves a PNG that fits within 320 by 320 pixels and keeps the image's aspect ratio. Choose an output filename that doesn't already exist.
