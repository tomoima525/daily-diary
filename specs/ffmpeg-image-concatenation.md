# FFmpeg Image Concatenation Specification

## Overview

This document outlines the approach for concatenating images with different sizes and aspect ratios using ffmpeg, with a focus on standardizing to landscape layout while handling portrait photos appropriately.

## Use Case

- **Default Layout**: Landscape orientation
- **Portrait Handling**: Shrink portrait images so their height fits the landscape layout
- **Goal**: Maintain aspect ratios while ensuring consistent output dimensions

## Recommended Approach: Scale with Padding

### Basic Command Structure

```bash
ffmpeg -i input.jpg -vf \
"scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black" \
output.jpg
```

### Parameters Explained

- `scale=1920:1080`: Target landscape dimensions
- `force_original_aspect_ratio=decrease`: Scales down to fit within bounds while preserving aspect ratio
- `pad=1920:1080`: Adds padding to reach exact output dimensions
- `(ow-iw)/2:(oh-ih)/2`: Centers the image (equal padding on all sides)
- `:black`: Padding color (can be changed to any color)

## Multiple Image Concatenation

### Sequential Video Creation

```bash
ffmpeg -loop 1 -t 3 -i portrait1.jpg -loop 1 -t 3 -i landscape1.jpg -loop 1 -t 3 -i portrait2.jpg \
-filter_complex \
"[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black[v0]; \
 [1:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black[v1]; \
 [2:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black[v2]; \
 [v0][v1][v2]concat=n=3:v=1:a=0[out]" \
-map "[out]" output.mp4
```

### Grid Layout (2x2)

```bash
ffmpeg -i img1.jpg -i img2.jpg -i img3.jpg -i img4.jpg -filter_complex \
"[0:v]scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2[v0]; \
 [1:v]scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2[v1]; \
 [2:v]scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2[v2]; \
 [3:v]scale=960:540:force_original_aspect_ratio=decrease,pad=960:540:(ow-iw)/2:(oh-ih)/2[v3]; \
 [v0][v1][v2][v3]xstack=inputs=4:layout=0_0|960_0|0_540|960_540" output.mp4
```

## Alternative Approach: Blurred Background Fill

For a more aesthetic appearance instead of solid color padding:

```bash
ffmpeg -i portrait.jpg -filter_complex \
"[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,boxblur=50[bg]; \
 [0:v]scale=1920:1080:force_original_aspect_ratio=decrease[fg]; \
 [bg][fg]overlay=(W-w)/2:(H-h)/2" \
output.jpg
```

### How Blurred Background Works

1. `scale=...increase,crop=1920:1080`: Creates a full-frame version by scaling up and cropping
2. `boxblur=50`: Applies blur effect to the background
3. `scale=...decrease`: Creates the properly fitted foreground image
4. `overlay=(W-w)/2:(H-h)/2`: Centers the foreground over the blurred background

## Key Benefits

- **No Cropping**: Portrait images remain fully visible
- **Consistent Output**: All results have the same landscape dimensions
- **Aspect Ratio Preservation**: Original proportions maintained
- **Professional Appearance**: Clean padding or aesthetic blur options
- **Flexible**: Works with any mix of portrait/landscape inputs

## Common Use Cases

### Slideshow Creation
- Use sequential concatenation with timing controls (`-t` parameter)
- Add fade transitions between images if needed

### Social Media Content
- Standardize to platform-specific dimensions (e.g., 1920x1080 for YouTube)
- Use blurred background for more engaging visual appeal

### Batch Processing
```bash
# Process all images in a directory
for img in *.jpg; do
    ffmpeg -i "$img" -vf \
    "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black" \
    "processed_$img"
done
```

## Implementation Notes

- Choose target dimensions based on your specific use case
- Consider output format requirements (JPEG for images, MP4 for videos)
- Test with sample images to verify padding color and positioning
- For video output, consider frame rate and duration parameters