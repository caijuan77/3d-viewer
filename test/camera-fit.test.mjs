import assert from 'node:assert/strict';
import { calculateCameraFit } from '../src/viewer/cameraFit.js';

const largeFit = calculateCameraFit({ diameter: 19338.2412, fov: 45 });

assert.ok(largeFit.distance > 30000, 'large FBX sample should place the camera far from the model');
assert.ok(largeFit.far > largeFit.distance + 19338.2412, 'far plane should include the whole large model');
assert.ok(largeFit.near > 0, 'near plane should stay positive');

const smallFit = calculateCameraFit({ diameter: 1, fov: 45 });

assert.equal(smallFit.far, 1000);
assert.equal(smallFit.near, 0.01);
