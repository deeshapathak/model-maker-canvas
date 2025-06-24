// Cloudflare Worker for photogrammetry proxy
const BACKEND_URL = 'https://your-gpu-backend-url.com'; // Replace with your GPU backend URL
const R2_BUCKET = '3d-models-bucket';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Route requests to appropriate handlers
      if (path.startsWith('/api/upload-session/')) {
        return await handleUploadSession(request, env, corsHeaders);
      } else if (path.startsWith('/api/process-session/')) {
        return await handleProcessSession(request, env, corsHeaders);
      } else if (path.startsWith('/api/result/')) {
        return await handleGetResult(request, env, corsHeaders);
      } else if (path.startsWith('/api/download/')) {
        return await handleDownload(request, env, corsHeaders);
      } else {
        return new Response('Not Found', { status: 404, headers: corsHeaders });
      }
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
  }
};

async function handleUploadSession(request, env, corsHeaders) {
  const url = new URL(request.url);
  const sessionId = url.pathname.split('/').pop();
  
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    // Parse multipart form data
    const formData = await request.formData();
    const files = formData.getAll('images');
    
    if (!files || files.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No images provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Upload files to R2
    const uploadedFiles = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const r2Key = `sessions/${sessionId}/images/image_${i.toString().padStart(3, '0')}.jpg`;
      
      await env.BUCKET.put(r2Key, file.stream(), {
        httpMetadata: {
          contentType: file.type,
        },
      });
      
      uploadedFiles.push(r2Key);
    }

    // Forward to backend
    const backendFormData = new FormData();
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      backendFormData.append('files', file);
    }

    const backendResponse = await fetch(`${BACKEND_URL}/upload-session/${sessionId}`, {
      method: 'POST',
      body: backendFormData,
    });

    const result = await backendResponse.json();

    return new Response(
      JSON.stringify({
        ...result,
        r2_files: uploadedFiles,
      }),
      { 
        status: backendResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Upload error:', error);
    return new Response(
      JSON.stringify({ error: 'Upload failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function handleProcessSession(request, env, corsHeaders) {
  const url = new URL(request.url);
  const sessionId = url.pathname.split('/').pop();
  
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    // Forward to backend
    const backendResponse = await fetch(`${BACKEND_URL}/process-session/${sessionId}`, {
      method: 'POST',
    });

    const result = await backendResponse.json();

    return new Response(
      JSON.stringify(result),
      { 
        status: backendResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Process error:', error);
    return new Response(
      JSON.stringify({ error: 'Processing failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function handleGetResult(request, env, corsHeaders) {
  const url = new URL(request.url);
  const sessionId = url.pathname.split('/').pop();
  
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    // Forward to backend
    const backendResponse = await fetch(`${BACKEND_URL}/result/${sessionId}`);
    const result = await backendResponse.json();

    // If processing is complete, update URLs to point to R2
    if (result.status === 'completed') {
      result.glb_url = `https://${env.BUCKET.name}.r2.cloudflarestorage.com/results/${sessionId}/model.glb`;
      result.landmarks_url = `https://${env.BUCKET.name}.r2.cloudflarestorage.com/results/${sessionId}/landmarks.json`;
    }

    return new Response(
      JSON.stringify(result),
      { 
        status: backendResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Result error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to get result' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function handleDownload(request, env, corsHeaders) {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const sessionId = parts[parts.length - 2];
  const filename = parts[parts.length - 1];
  
  if (request.method !== 'GET') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
  }

  try {
    // Get file from R2
    const r2Key = `results/${sessionId}/${filename}`;
    const object = await env.BUCKET.get(r2Key);

    if (!object) {
      return new Response('File not found', { status: 404, headers: corsHeaders });
    }

    // Return file with appropriate headers
    const headers = {
      ...corsHeaders,
      'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream',
      'Content-Length': object.size,
    };

    return new Response(object.body, { headers });

  } catch (error) {
    console.error('Download error:', error);
    return new Response(
      JSON.stringify({ error: 'Download failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
