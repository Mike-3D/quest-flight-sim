# Quest Flight Sim — v0.1.1

A tiny WebXR flight experiment for Meta Quest 3 built with Three.js, deployed as a static site on GitHub Pages. No build step required.

## Run

1. Enable **Settings → Pages → Deploy from a branch → main / (root)**.
2. Open **https://mike-3d.github.io/quest-flight-sim/** over HTTPS in Quest Browser.
3. Press **Enter VR** and accept the browser's VR permission request.

Desktop mode is available on the same URL for basic smoke tests.

## Controls

- **Quest 3 right thumbstick**: yaw (horizontal) and pitch (vertical).
- **Quest 3 left thumbstick up/down**: increase/decrease forward speed.
- **A/X controller button**: reset.
- **Desktop WASD/arrow keys**: yaw/pitch. **Shift+W / Shift+S**: increase/decrease speed. **R**: reset.

This is an arcade prototype, not a physical flight simulation. Head movement and rotation are provided by WebXR and kept separate from aircraft steering.

## Known limitations

- No collisions, landing, sound, or physics.
- The 2D HUD is not visible in immersive VR.
- Source files load Three.js ES modules from a CDN, so an internet connection is required.
- Controller axis mapping is designed for Quest Touch controllers and should be verified on-device.
- WebXR requires a supported browser on HTTPS; GitHub repository URLs are not the game URL.

## Version

v0.1: minimal world, cockpit, flight motion, thumbstick inputs, desktop controls and reset.

- v0.1.1: raised ground stripes and improved depth precision to reduce flicker.
