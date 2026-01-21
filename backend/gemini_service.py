"""
Gemini Vision API Service for 5-Frame Face Analysis

This module provides a clean interface to Gemini Vision API for:
- Landmark detection and normalization
- FLAME shape parameter estimation
- Multi-frame consistency validation

Architecture: Modular design allows easy replacement with internal CV pipeline later.
"""

from __future__ import annotations

import os
import json
import re
import logging
import time
from typing import Optional, Dict, List, Tuple
from io import BytesIO

try:
    import google.generativeai as genai
    from PIL import Image
    GEMINI_AVAILABLE = True
except ImportError:
    GEMINI_AVAILABLE = False
    logging.warning("google-generativeai not installed. Gemini service unavailable.")

logger = logging.getLogger("rhinovate.backend")


class GeminiService:
    """
    Modular service for Gemini Vision API integration.
    
    Designed to be easily replaceable with internal CV pipeline:
    - Clean interface: analyze_faces(frames) -> FaceAnalysisResult
    - No Gemini-specific code in FLAME fitting
    - Fallback to zero initialization if service unavailable
    """
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GEMINI_API_KEY")
        self.enabled = GEMINI_AVAILABLE and self.api_key is not None
        
        if not GEMINI_AVAILABLE:
            logger.warning("Gemini SDK not available. Install: pip install google-generativeai")
            self.enabled = False
        elif not self.api_key:
            logger.warning("GEMINI_API_KEY not set. Gemini service disabled.")
            self.enabled = False
        else:
            try:
                genai.configure(api_key=self.api_key)
                # Use gemini-1.5-flash for vision (multimodal input, faster than pro)
                # Falls back to gemini-2.0-flash-exp if available
                try:
                    self.model = genai.GenerativeModel('gemini-1.5-flash')
                    logger.info("Gemini Vision API service initialized with gemini-1.5-flash")
                except Exception:
                    # Fallback to experimental model if 1.5-flash not available
                    self.model = genai.GenerativeModel('gemini-2.0-flash-exp')
                    logger.info("Gemini Vision API service initialized with gemini-2.0-flash-exp")
            except Exception as e:
                logger.error(f"Failed to initialize Gemini: {e}")
                self.enabled = False
    
    def analyze_faces(
        self,
        frames: List[Tuple[bytes, str]],  # List of (image_bytes, pose_name)
        timeout_seconds: float = 10.0
    ) -> Optional[FaceAnalysisResult]:
        """
        Analyze 5 face frames and return normalized FLAME parameters.
        
        Args:
            frames: List of (image_bytes, pose_name) tuples
                   Expected poses: "front", "left", "right", "down", "up"
            timeout_seconds: API call timeout
        
        Returns:
            FaceAnalysisResult with shape params, landmarks, etc.
            None if API call fails (fallback to zero initialization)
        """
        if not self.enabled:
            logger.info("Gemini service disabled, skipping API call")
            return None
        
        if len(frames) != 5:
            logger.warning(f"Expected 5 frames, got {len(frames)}. Skipping Gemini analysis.")
            return None
        
        try:
            start_time = time.time()
            result = self._call_gemini_api(frames, timeout_seconds)
            elapsed = time.time() - start_time
            
            if result:
                logger.info(f"Gemini analysis complete in {elapsed:.2f}s")
                return result
            else:
                logger.warning("Gemini API returned no result")
                return None
                
        except Exception as e:
            logger.error(f"Gemini API call failed: {e}", exc_info=True)
            return None
    
    def _call_gemini_api(
        self,
        frames: List[Tuple[bytes, str]],
        timeout_seconds: float
    ) -> Optional[FaceAnalysisResult]:
        """Internal method to call Gemini API."""
        
        # Build prompt with frame metadata
        prompt_parts = [
            "You are analyzing 5 face images captured from specific angles for 3D face reconstruction:\n\n",
            "1. Front: Face forward, neutral expression\n",
            "2. Left Profile: Head turned ~90° left\n",
            "3. Right Profile: Head turned ~90° right\n",
            "4. Looking Down: Head tilted down ~30°\n",
            "5. Looking Up: Head tilted up ~30°\n\n",
            "Tasks:\n",
            "1. Detect and normalize landmarks (468 MediaPipe format) for each frame\n",
            "2. Estimate FLAME 3DMM shape parameters (100-dim) that are consistent across all views\n",
            "3. Estimate per-frame expression (50-dim) and pose (yaw, pitch, roll)\n",
            "4. Validate data quality and standardize coordinate systems\n",
            "5. Return normalized, ready-to-use data for FLAME fitting\n\n",
            "Return ONLY valid JSON (no markdown, no code blocks):\n",
            "{\n",
            '  "initial_shape_params": [100 floats],\n',
            '  "frame_estimates": [\n',
            "    {\n",
            '      "pose_name": "front",\n',
            '      "landmarks_2d": [[x, y], ...],  // 468 landmarks\n',
            '      "landmarks_3d": [[x, y, z], ...],  // if possible\n',
            '      "expression": [50 floats],\n',
            '      "pose": {"yaw": float, "pitch": float, "roll": float},\n',
            '      "quality_score": float\n',
            "    },\n",
            "    ... (5 frames)\n",
            "  ],\n",
            '  "normalization_applied": {\n',
            '    "coordinate_system": "FLAME_standard",\n',
            '    "scale_factor": float,\n',
            '    "centroid_offset": [x, y, z]\n',
            "  },\n",
            '  "validation": {\n',
            '    "all_frames_valid": bool,\n',
            '    "warnings": [string],\n',
            '    "overall_quality": float\n',
            "  }\n",
            "}\n",
        ]
        
        # Add images to prompt
        for image_bytes, pose_name in frames:
            try:
                img = Image.open(BytesIO(image_bytes))
                prompt_parts.append(f"\nFrame: {pose_name}\n")
                prompt_parts.append(img)
            except Exception as e:
                logger.error(f"Failed to load image for pose {pose_name}: {e}")
                return None
        
        # Call API with timeout
        try:
            response = self.model.generate_content(
                prompt_parts,
                request_options={"timeout": timeout_seconds}
            )
            
            if not response or not response.text:
                logger.warning("Gemini API returned empty response")
                return None
            
            # Parse JSON from response
            result = self._parse_gemini_response(response.text)
            return result
            
        except Exception as e:
            logger.error(f"Gemini API call exception: {e}")
            return None
    
    def _parse_gemini_response(self, response_text: str) -> Optional[FaceAnalysisResult]:
        """Parse JSON from Gemini response text."""
        try:
            # Extract JSON (handle markdown code blocks)
            json_text = response_text.strip()
            
            # Remove markdown code blocks if present
            json_text = re.sub(r'```json\s*', '', json_text)
            json_text = re.sub(r'```\s*', '', json_text)
            
            # Find JSON object
            json_match = re.search(r'\{.*\}', json_text, re.DOTALL)
            if not json_match:
                logger.warning("No JSON found in Gemini response")
                return None
            
            data = json.loads(json_match.group())
            
            # Validate and convert to FaceAnalysisResult
            return FaceAnalysisResult.from_dict(data)
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Gemini JSON: {e}")
            logger.debug(f"Response text: {response_text[:500]}")
            return None
        except Exception as e:
            logger.error(f"Error parsing Gemini response: {e}")
            return None


class FaceAnalysisResult:
    """
    Structured result from Gemini face analysis.
    
    This is the interface contract - internal CV pipeline should return same structure.
    """
    
    def __init__(
        self,
        initial_shape_params: List[float],
        frame_estimates: List[Dict],
        normalization_applied: Optional[Dict] = None,
        validation: Optional[Dict] = None
    ):
        self.initial_shape_params = initial_shape_params
        self.frame_estimates = frame_estimates
        self.normalization_applied = normalization_applied or {}
        self.validation = validation or {}
    
    @classmethod
    def from_dict(cls, data: Dict) -> FaceAnalysisResult:
        """Create from Gemini API response dict."""
        shape_params = data.get("initial_shape_params", [0.0] * 100)
        if len(shape_params) != 100:
            logger.warning(f"Shape params length {len(shape_params)}, expected 100. Padding/truncating.")
            shape_params = (shape_params + [0.0] * 100)[:100]
        
        frame_estimates = data.get("frame_estimates", [])
        if len(frame_estimates) != 5:
            logger.warning(f"Frame estimates length {len(frame_estimates)}, expected 5")
        
        return cls(
            initial_shape_params=shape_params,
            frame_estimates=frame_estimates,
            normalization_applied=data.get("normalization_applied", {}),
            validation=data.get("validation", {})
        )
    
    def get_shape_params_array(self) -> List[float]:
        """Get shape params as list (for FLAME initialization)."""
        return self.initial_shape_params
    
    def get_landmarks_for_pose(self, pose_name: str) -> Optional[List[List[float]]]:
        """Get 3D landmarks for a specific pose."""
        for frame in self.frame_estimates:
            if frame.get("pose_name") == pose_name:
                return frame.get("landmarks_3d") or frame.get("landmarks_2d")
        return None


# Global service instance (singleton pattern)
_gemini_service: Optional[GeminiService] = None


def get_gemini_service() -> GeminiService:
    """Get or create Gemini service instance."""
    global _gemini_service
    if _gemini_service is None:
        _gemini_service = GeminiService()
    return _gemini_service
