# Browser parameter controls 0.1

RocketWorks uses a paired range-and-number control for bounded engineering
inputs. The range input gives a fast, tactile adjustment path for pointer,
keyboard, and touch users; the adjacent number input remains the precise entry
path for reproducible values. Both paths call the same state updater, mark the
project changed, and therefore participate in the existing simulation
fingerprint and stale-result guardrail.

The pattern now covers average thrust, burn time, drag coefficient, pad weather observations,
wind speed and azimuth, relative humidity, launch-rail geometry, recovery
canopy diameter and deployment probability, reefing settings, and uncertainty
correlation coefficients. Latitude, longitude, and launch altitude remain
number-first because their wide domains make a linear slider a poor precision
control; users can still edit them with bounded numeric inputs.

Range controls expose a label-derived accessible name and remain keyboard
reachable. They are presentation controls only: changing a slider does not
silently rerun a simulation or alter the project model outside the same
validated input path used by direct numeric editing.
