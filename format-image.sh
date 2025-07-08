#!/bin/bash

# Script to convert PNG files to JPG with max size of 1024x1024 using ImageMagick
# Usage: sh ./format-image.sh [directory]
# If no directory is specified, uses current directory

# Set the target directory (default to current directory if not provided)
TARGET_DIR="${1:-.}"

# Check if ImageMagick is installed
if ! command -v magick &> /dev/null; then
    echo "Error: ImageMagick is not installed. Please install it first."
    echo "On macOS: brew install imagemagick"
    exit 1
fi

# Check if target directory exists
if [ ! -d "$TARGET_DIR" ]; then
    echo "Error: Directory '$TARGET_DIR' does not exist."
    exit 1
fi

# Count PNG files in directory
PNG_COUNT=$(find "$TARGET_DIR" -maxdepth 1 -name "*.png" -type f | wc -l)

if [ "$PNG_COUNT" -eq 0 ]; then
    echo "No PNG files found in '$TARGET_DIR'"
    exit 0
fi

echo "Found $PNG_COUNT PNG file(s) in '$TARGET_DIR'"
echo "Converting PNG files to JPG with max size 1024x1024..."

# Counter for processed files
PROCESSED=0
ERRORS=0

# Process each PNG file in the directory
for png_file in "$TARGET_DIR"/*.png; do
    # Check if file exists (handles case where no PNG files match the pattern)
    if [ ! -f "$png_file" ]; then
        continue
    fi
    
    # Get the base filename without extension
    base_name=$(basename "$png_file" .png)
    
    # Create output filename
    jpg_file="$TARGET_DIR/${base_name}.jpg"
    
    echo "Processing: $(basename "$png_file")"
    
    # Convert PNG to JPG with resize
    # -resize 1024x1024> only resizes if image is larger than 1024x1024
    # -quality 85 sets JPG quality to 85%
    # -strip removes metadata to reduce file size
    if magick "$png_file" -resize 1024x1024\> -quality 90 -strip "$jpg_file"; then
        echo "  ✓ Created: $(basename "$jpg_file")"
        ((PROCESSED++))
        
        # Optionally remove the original PNG file (uncomment the next line if desired)
        rm "$png_file" && echo "  ✓ Removed original PNG"
    else
        echo "  ✗ Error processing: $(basename "$png_file")"
        ((ERRORS++))
    fi
done

echo ""
echo "Conversion complete!"
echo "Successfully processed: $PROCESSED files"
if [ "$ERRORS" -gt 0 ]; then
    echo "Errors encountered: $ERRORS files"
fi
