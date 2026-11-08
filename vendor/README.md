# Bibliothèques embarquées

Copiées telles quelles depuis leur paquet npm, pour que l'outil fonctionne sans CDN et sans étape de compilation.

| Bibliothèque | Version | Licence | Fichiers |
|---|---|---|---|
| MapLibre GL JS | 6.14.0 | BSD-3-Clause (`maplibre-gl/LICENSE.txt`) | `maplibre-gl.mjs`, `maplibre-gl-worker.mjs`, `maplibre-gl.css` |
| CesiumJS | 1.147.0 | Apache-2.0 (`cesium/LICENSE.md`) | `index.js`, `Assets/`, `ThirdParty/`, `Widgets/`, `Workers/` (chargés seulement à l'ouverture de la vue 3D) |

Mise à jour : `npm pack maplibre-gl@<version>`, puis recopier les mêmes fichiers depuis `package/dist/` (MapLibre) ou `package/Build/Cesium/` (CesiumJS).
