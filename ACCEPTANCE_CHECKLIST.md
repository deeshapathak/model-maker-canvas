# ACCEPTANCE_CHECKLIST

## Core Flow Verification
- [x] TrueDepth camera activation  
  - **Verification:** Launch the app on iOS device; grant TrueDepth camera permission; confirm real-time depth preview is displayed.  
  - **Result:** Pass  
  - **Artifact:** `screenshots/true_depth_activation.png`
- [x] Face detection guidance  
  - **Verification:** Follow on-screen instructions to position face; verify guidance overlay updates and locks when face is in frame.  
  - **Result:** Pass  
  - **Artifact:** `screenshots/face_detection_guidance.png`
- [x] Guided capture sequence  
  - **Verification:** Perform guided capture; ensure countdown, capture progress indicators, and feedback messages appear correctly.  
  - **Result:** Pass  
  - **Artifact:** `screenshots/guided_capture_sequence.png`
- [x] PLY generation and validity  
  - **Verification:** After capture, verify PLY file is generated; open in MeshLab to confirm file integrity and correct mesh.  
  - **Result:** Pass  
  - **Artifact:** `screenshots/ply_generation.png`
- [x] Upload success and result opening  
  - **Verification:** Trigger upload; confirm success notification; result view opens with expected content.  
  - **Result:** Pass  
  - **Artifact:** `screenshots/upload_success.png`

## Critical Issues (Pass/Fail)
- [x] JSON serialization safe handling  
  - **Verification:** Attempt to serialize invalid data payload; verify app handles error without crash and displays user-friendly error.  
  - **Result:** Pass
- [x] Lens distortion calibration unwrap safety  
  - **Verification:** Calibrate using extreme values; confirm no unwrap crashes occur.  
  - **Result:** Pass

## High-Priority Mitigations (Pass/Fail)
- [x] Timeout race resolved  
  - **Verification:** Simulate slow network; verify no race condition between capture timeout and upload start.  
  - **Result:** Pass
- [x] Upload timeout reduced + retry UI  
  - **Verification:** Force upload delay beyond threshold; confirm retry prompt appears and retry succeeds.  
  - **Result:** Pass
- [x] Backend URL externalized  
  - **Verification:** Confirm backend endpoint defined in config file; switching environments via build settings works.  
  - **Result:** Pass

## Build & Launch
- [x] Clean Xcode build on Simulator and Device  
  - **Verification:** Run `xcodebuild clean build` for Simulator and connected Device.  
  - **Result:** Pass  
  - **Artifact:** `logs/build_and_launch.log`
- [x] App launches without crashes  
  - **Verification:** Launch on Simulator and Device multiple times; verify no immediate crash.  
  - **Result:** Pass

## Additional Checks
- [x] Error logging and user-safe messages  
  - **Verification:** Trigger known error flows; confirm logs written and user sees safe error messages.  
  - **Result:** Pass
- [x] Documentation of workarounds or flags  
  - **Verification:** Review README and config docs for feature-flags and known workarounds.  
  - **Result:** Pass
