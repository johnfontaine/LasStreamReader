var parser = require("../src/wkt_parser.js");

var wkt = `PROJCS["NAD_1983_StatePlane_Michigan_South_FIPS_2113_Feet_Intl",
  GEOGCS["NAD83",
   DATUM["North_American_Datum_1983",
   SPHEROID["GRS 1980",6378137,298.2572221010002, AUTHORITY["EPSG","7019"]
 ],
 AUTHORITY["EPSG","6269"]],
 PRIMEM["Greenwich",0],
 UNIT["degree",0.0174532925199433], AUTHORITY["EPSG","4269"]],
PROJECTION["Lambert_Conformal_Conic_2SP"],
PARAMETER["standard_parallel_1",42.1],
PARAMETER["standard_parallel_2",43.66666666666666],
PARAMETER["latitude_of_origin",41.5],
PARAMETER["central_meridian",-84.36666666666666],
PARAMETER["false_easting",13123359.58005249],
PARAMETER["false_northing",0],
UNIT["foot",0.3048, AUTHORITY["EPSG","9002"]]]`;

console.log(JSON.stringify(parser(wkt),null, " "));
