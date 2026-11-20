# Earth textures

Active textures:

- `earth-day-8k.jpg`: https://www.solarsystemscope.com/textures/download/8k_earth_daymap.jpg
- `earth-clouds-8k.jpg`: https://www.solarsystemscope.com/textures/download/8k_earth_clouds.jpg
- `earth-specular.jpg`: https://threejs.org/examples/textures/planets/earth_specular_2048.jpg

The 8192 × 4096 day and cloud maps were downloaded on 2026-11-20 from
[Solar System Scope](https://www.solarsystemscope.com/textures/), created by
Solar System Scope / INOVE and distributed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
The dashboard applies its own contrast and blue color grading to the day map,
and uses the cloud map as the opacity of an independently animated cloud layer.

Previous reference assets, downloaded on 2026-11-19 from the Three.js examples:

- `earth-surface.jpg`: https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg
- `earth-specular.jpg`: https://threejs.org/examples/textures/planets/earth_specular_2048.jpg
- `earth-clouds.png`: https://threejs.org/examples/textures/planets/earth_clouds_1024.png

Upstream collection: https://github.com/mrdoob/three.js/tree/dev/examples/textures/planets

These are local copies of the example assets. The dashboard adds its own blue
color treatment, country boundaries, labels, atmosphere and animated flight paths
in `src/screens/blue/world.ts`.
