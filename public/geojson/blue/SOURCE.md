# Provincial drilldown boundaries

Downloaded on 2026-11-19 from Alibaba DataV GeoAtlas:

`https://geo.datav.aliyun.com/areas_v3/bound/{adcode}_full.json`

The directory contains all 31 mainland provincial-level regions, plus Hong Kong
and Macao. Each numeric filename is a nonempty GeoJSON FeatureCollection of the
region's immediate administrative subdivisions. Municipalities use district
boundaries; provinces and autonomous regions use prefectural boundaries.

Guangdong (`440000.json`, 21 features) and Chongqing (`500000.json`, 38 features)
reuse the project's existing GeoAtlas-derived files.

Available subdivision codes:

110000, 120000, 130000, 140000, 150000, 210000, 220000, 230000, 310000,
320000, 330000, 340000, 350000, 360000, 370000, 410000, 420000, 430000,
440000, 450000, 460000, 500000, 510000, 520000, 530000, 540000, 610000,
620000, 630000, 640000, 650000, 810000, 820000.

Taiwan's `_full.json` endpoint returned HTTP 404. `710000-outline.json` is the
actual single-region outline from the corresponding `710000.json` endpoint;
it does not provide prefectural boundaries and must not be presented as a
subdivision collection. No synthetic geographic fallback was generated.

Validation: all 33 subdivision collections are nonempty and contain 475 features
in total. All files retain the source coordinates and administrative metadata.

## City and county drilldown

Added on 2026-11-19 from the same GeoAtlas `areas_v3/bound` source:

- `100000.json`: nationwide collection containing 34 named provincial-level
  regions and the source nine-dash-line feature.
- `100000-outline.json`: the corresponding national outline.
- All 329 cities/prefectures whose provincial source metadata has
  `childrenNum > 0`, using `{adcode}_full.json`. These collections contain
  2,728 immediate county/district features, totaling 22,687,163 bytes.

All city files are nonempty FeatureCollections with Polygon/MultiPolygon
geometry, named numeric administrative codes, and the expected parent adcode.
No downloads failed. Geometry and metadata remain unmodified.

Navigation follows the actual source hierarchy: country → province → city →
county/district, while municipalities and Hong Kong/Macao go directly from
province level to districts. A feature with `childrenNum = 0` is a leaf and
uses its own outline for the final zoom; no nonexistent child collection is
requested. Taiwan retains the existing single-region outline limitation.
