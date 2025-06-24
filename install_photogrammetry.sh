/#!/bin/bash

echo "🔧 Installing Photogrammetry Tools..."

# Check if we're on macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "📱 Detected macOS, installing via Homebrew..."
    
    # Install Homebrew if not installed
    if ! command -v brew &> /dev/null; then
        echo "Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    
    # Install COLMAP
    echo "Installing COLMAP..."
    brew install colmap
    
    # Install MeshLab
    echo "Installing MeshLab..."
    brew install meshlab
    
    # Install OpenMVS dependencies
    echo "Installing OpenMVS dependencies..."
    brew install cmake boost eigen opencv cgal
    
    # Build OpenMVS from source
    echo "Building OpenMVS from source..."
    cd /tmp
    git clone https://github.com/cdcseacave/openMVS.git
    cd openMVS
    mkdir build && cd build
    cmake .. -DCMAKE_BUILD_TYPE=Release
    make -j$(nproc)
    sudo make install
    
    echo "✅ Photogrammetry tools installed successfully!"
    
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "🐧 Detected Linux, installing via package manager..."
    
    # Update package list
    sudo apt-get update
    
    # Install COLMAP
    echo "Installing COLMAP..."
    sudo apt-get install -y colmap
    
    # Install MeshLab
    echo "Installing MeshLab..."
    sudo apt-get install -y meshlab
    
    # Install OpenMVS dependencies
    echo "Installing OpenMVS dependencies..."
    sudo apt-get install -y build-essential cmake git libboost-all-dev libeigen3-dev libsuitesparse-dev libfreeimage-dev libgoogle-glog-dev libgflags-dev libglew-dev libqt5opengl5-dev libcgal-dev libcgal-qt5-dev libatlas-base-dev
    
    # Build OpenMVS from source
    echo "Building OpenMVS from source..."
    cd /tmp
    git clone https://github.com/cdcseacave/openMVS.git
    cd openMVS
    mkdir build && cd build
    cmake .. -DCMAKE_BUILD_TYPE=Release
    make -j$(nproc)
    sudo make install
    
    echo "✅ Photogrammetry tools installed successfully!"
    
else
    echo "❌ Unsupported operating system: $OSTYPE"
    echo "Please install COLMAP, OpenMVS, and MeshLab manually."
    exit 1
fi

# Verify installations
echo "🔍 Verifying installations..."

if command -v colmap &> /dev/null; then
    echo "✅ COLMAP installed: $(colmap --version | head -1)"
else
    echo "❌ COLMAP not found"
fi

if command -v meshlabserver &> /dev/null; then
    echo "✅ MeshLab installed: $(meshlabserver --version | head -1)"
else
    echo "❌ MeshLab not found"
fi

if command -v OpenMVS &> /dev/null; then
    echo "✅ OpenMVS installed"
else
    echo "❌ OpenMVS not found"
fi

echo "🎉 Installation complete!"
echo "📝 Next steps:"
echo "1. Restart your terminal"
echo "2. Run 'npm run dev:full' to start the server"
echo "3. Test the photogrammetry system at http://localhost:8080"
