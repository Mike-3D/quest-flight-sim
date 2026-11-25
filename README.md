# Quest Flight Sim — v0.6.1

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

- v0.2: GLB cockpit, mirrored half-shell and seats, seated local XR reference space, fallback cockpit on load failure.

- v0.3: load Exterior_01.glb alongside the cockpit with the same model transform.

- v0.4: streamed procedural terrain, rolling hills, mountain relief, vertex colors and a small grass airstrip; terrain-aware minimum clearance.

- v0.4.1: stronger nearby terrain relief and chunk-count diagnostic.

- v0.5: world-space procedural farmland shader with field boundaries, crop colors and distance-filtered ground detail.

- v0.6: procedural river valley and road surface, simplified point-mass lift, drag, thrust, gravity, banked turns and stall lift reduction. Terrain clearance assist remains enabled.

- v0.6.1: angular-rate dynamics, airspeed-dependent control authority, aerodynamic damping and angle-of-attack stability; neutral stick no longer commands level bank.

- v0.6.2: reversed elevator input, quaternion body-axis rotations, body-relative angle of attack and banked lift projection.

- v0.7: rigid body 6DOF, world velocity, quaternion attitude, individual wing and tail aerodynamic forces and torques, propeller thrust, gravity, fixed 120 Hz physics. Experimental coefficients; ground protection retained.

- v0.7.1: corrected aileron direction, lowered terrain peaks, aircraft-fixed cockpit telemetry display (TAS, AGL, vertical speed, power, AoA, slip).

- v0.7.2: interpolated render pose from fixed 120 Hz physics snapshots; cockpit display repositioned with depth occlusion disabled for debugging; frame-rate and physics CPU timings.

- v0.7.3: lowered cockpit telemetry by 5 cm; increased pitch inertia from 1250 to 2000 and roll inertia from 850 to 1450 kg m², keeping yaw inertia and aerodynamic coefficients unchanged.

- v0.8: P92 manual-based wing geometry, stabilator area, engine power and propeller diameter; approximate power-limited propeller, density variation, clean stall and glide calibration targets, corrected fin lift vector, rudder on left stick X / Q,E, load factor telemetry. Flight mass 550 kg assumed; coefficients, trim and inertia experimental. Flaps not implemented yet.

- v0.8.1: increased experimental yaw-rate damping to reduce Dutch-roll oscillation, without changing rudder authority or introducing heading hold.

- v0.9 experimental online terrain: LINZ aerial imagery and AWS Mapzen Terrarium DEM, XYZ z14, Canterbury origin (-43.38,172.35), 25 streamed tiles, up to 3 concurrent tile pairs, local browser key only. Flat placeholder for pending data; procedural mode via UI. No LOD or seam stitching yet. Attribution: LINZ and contributors; https://github.com/tilezen/joerd/blob/master/docs/attribution.md

- v0.9.1: enabled pointer events on terrain controls; replaced browser prompt with inline key form for Quest compatibility.

- v0.9.2: z16 aerial detail mosaics for nearby z14 tiles (1024 px), z14 overview retained, one detail job at a time; DEM loaded count and min/max heights, network error diagnostics; start moved toward Canterbury foothills (-43.32,171.93). No increase in terrain polygon count.

- v0.9.3: mountain spawn near Bealey in the Waimakariri valley (-43.045,171.632), northwest heading, 450 m AGL after initial DEM arrives. Physics waits for the initial tile attempt; procedural mode unchanged.
