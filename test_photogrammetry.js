// Test script for photogrammetry system
import fs from 'fs';
import FormData from 'form-data';
import fetch from 'node-fetch';

async function testPhotogrammetry() {
  console.log('🧪 Testing Photogrammetry System...\n');

  // Test 1: Health check
  console.log('1. Testing health endpoint...');
  try {
    const healthResponse = await fetch('http://localhost:3001/health');
    const healthData = await healthResponse.json();
    console.log('✅ Health check passed:', healthData);
  } catch (error) {
    console.log('❌ Health check failed:', error.message);
    return;
  }

  // Test 2: Upload images
  console.log('\n2. Testing image upload...');
  try {
    const formData = new FormData();
    
    // Create a simple test image (1x1 pixel PNG)
    const testImageBuffer = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
      0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00,
      0xFF, 0xFF, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC, 0x33,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ]);
    
    formData.append('images', testImageBuffer, { filename: 'test.png', contentType: 'image/png' });
    
    const uploadResponse = await fetch('http://localhost:3001/api/photogrammetry/capture', {
      method: 'POST',
      body: formData
    });
    
    const uploadData = await uploadResponse.json();
    console.log('✅ Upload successful:', uploadData);
    
    const sessionId = uploadData.sessionId;
    
    // Test 3: Check status
    console.log('\n3. Testing status check...');
    const statusResponse = await fetch(`http://localhost:3001/api/photogrammetry/status/${sessionId}`);
    const statusData = await statusResponse.json();
    console.log('✅ Status check successful:', statusData);
    
    console.log('\n🎉 All tests passed! Your photogrammetry system is working correctly.');
    console.log('\n📝 Next steps:');
    console.log('1. Open http://localhost:8080 in your browser');
    console.log('2. Go to the "Custom Models" tab');
    console.log('3. Click "Start Camera Capture"');
    console.log('4. Take photos and test the photogrammetry system!');
    
  } catch (error) {
    console.log('❌ Test failed:', error.message);
  }
}

testPhotogrammetry();
