# Elon Musk 3D Model Integration Guide

This guide explains how to replace the placeholder sphere with your Elon Musk 3D model.

## Quick Setup

1. **Place your GLB file** in the `public/models/` directory
2. **Name it** `elon-musk.glb` (or update the path in the code)
3. **Restart the development server** if it's running

## File Structure

```
public/
  models/
    elon-musk.glb  ← Your Elon Musk 3D model goes here
    README.md
```

## Supported Formats

- **GLB** (recommended - binary format, smaller file size)
- **GLTF** (text-based format)

## How It Works

The application now uses the `useGLTF` hook from `@react-three/drei` to load your 3D model:

```tsx
// In src/components/FaceModel.tsx
const { scene } = useGLTF('/models/elon-musk.glb');
```

## Customization Options

### 1. Different Model Path

If your file has a different name or location:

```tsx
<ModelViewer modelPath="/models/my-elon-model.glb" />
```

### 2. Adjust Model Scale

```tsx
<ModelViewer 
  modelPath="/models/elon-musk.glb" 
  scale={[1.5, 1.5, 1.5]} // Make it 50% larger
/>
```

### 3. Different Scale for X, Y, Z

```tsx
<ModelViewer 
  modelPath="/models/elon-musk.glb" 
  scale={[1.2, 1.0, 0.8]} // Wider, same height, thinner
/>
```

## Fallback Behavior

If the GLB model fails to load:
- A fallback sphere will be displayed
- Console logs will show loading status
- The application continues to work normally

## Troubleshooting

### Model Not Loading

1. **Check file path**: Ensure your GLB file is in `public/models/`
2. **Check file name**: Default is `elon-musk.glb`
3. **Check browser console**: Look for error messages
4. **File format**: Ensure it's a valid GLB/GLTF file

### Model Too Big/Small

Adjust the scale prop:

```tsx
// Make it smaller
<ModelViewer scale={[0.5, 0.5, 0.5]} />

// Make it larger  
<ModelViewer scale={[2.0, 2.0, 2.0]} />
```

### Model Position Issues

The model is centered at `[0, 0, 0]`. If it appears off-center:

1. Check your GLB file's origin point
2. Adjust the position in the FaceModel component
3. Consider re-exporting the model with proper centering

## Development Tips

### Console Logging

The application logs model loading status to the browser console:
- Model path being loaded
- Model scene object details

### Hot Reload

After placing your GLB file:
1. Save the file
2. The development server should automatically reload
3. If not, manually refresh the browser

### File Size Optimization

For better performance:
- Keep GLB files under 10MB
- Use compressed textures
- Optimize geometry (reduce polygon count if needed)

## Example Usage

```tsx
// Basic usage with default settings
<ModelViewer />

// Custom model with specific scale
<ModelViewer 
  modelPath="/models/elon-musk-high-res.glb"
  scale={[1.2, 1.2, 1.2]}
/>

// Multiple models
<div className="grid grid-cols-2 gap-4">
  <ModelViewer modelPath="/models/elon-front.glb" />
  <ModelViewer modelPath="/models/elon-side.glb" />
</div>
```

## Next Steps

Once your model is loaded:

1. **Test interactions**: Click on the model to see editing areas
2. **Adjust lighting**: Modify the Stage environment in ModelViewer
3. **Add animations**: Extend the useFrame hook for custom animations
4. **Add materials**: Customize the model's appearance

## Support

If you encounter issues:
1. Check the browser console for error messages
2. Verify your GLB file opens in other 3D viewers
3. Try a different GLB file to isolate the issue
4. Check the file size and format compatibility 