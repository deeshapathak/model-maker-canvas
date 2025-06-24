# 3D Models Directory

Place your Elon Musk GLB model file here.

## File Naming
Name your file `elon-musk.glb` and place it in this directory.

## Supported Formats
- GLB (recommended)
- GLTF

## File Structure
```
public/
  models/
    elon-musk.glb  <- Place your file here
    README.md
```

## Usage
The model will be automatically loaded by the FaceModel component in `src/components/FaceModel.tsx`.

If the model fails to load, a fallback sphere will be displayed instead. 