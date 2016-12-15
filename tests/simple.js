const proj4 = require("proj4");
const wkt = require("../node_modules/proj4/lib/wkt");
const projStr = require('../node_modules/proj4/lib/projString');
//const s2 = '+no_defs +datum=NAD83 +rf=298.257222101 +ellps=GRS80 +a=6378137 +title=NAD_1983_StatePlane_Michigan_South_FIPS_2113_Feet_Intl +proj=lcc +units=ft +to_meter=0.3048 +lat_1=42.1 +lat_2=43.66666666666666 +lat_0=41.5 +x_0=13123359.58005249 +y_0=0 +lon_0=-84.36666666666666 +k_0=0'
///const s2 = '+no_defs +datum=NAD83 +rf=298.257222101 +ellps=GRS80 +a=6378137 +title=NAD_1983_StatePlane_Michigan_South_FIPS_2113_Feet_Intl +proj=lcc +units=ft +to_meter=0.3048 +lat_1=42.1 +lat_2=43.66666666666666 +lat_0=41.5 +x_0=3999999.999999999 +y_0=0 +lon_0=-84.36666666666666 +k_0=0'
const s2 = "+datum=NAD83 +pm=greenwich +ellps=GRS80 +a=6378137 +rf=298.257222101 +title=NAD_1983_StatePlane_Michigan_South_FIPS_2113_Feet_Intl +proj=lcc +units=ft +to_meter=0.3048 +lat_1=42.1 +lat_2=43.66666666666666 +lat_0=41.5 +x_0=3999999.999999999 +y_0=0 +lon_0=-84.36666666666666 +k_0=0"; 
const source = 'PROJCS["NAD_1983_StatePlane_Michigan_South_FIPS_2113_Feet_Intl", GEOGCS["NAD83", DATUM["North_American_Datum_1983", SPHEROID["GRS 1980",6378137,298.2572221010002, AUTHORITY["EPSG","7019"]], AUTHORITY["EPSG","6269"]], PRIMEM["Greenwich",0], UNIT["degree",0.0174532925199433], AUTHORITY["EPSG","4269"]], PROJECTION["Lambert_Conformal_Conic_2SP"], PARAMETER["standard_parallel_1",42.1], PARAMETER["standard_parallel_2",43.66666666666666], PARAMETER["latitude_of_origin",41.5], PARAMETER["central_meridian",-84.36666666666666], PARAMETER["false_easting",13123359.58005249], PARAMETER["false_northing",0], UNIT["foot",0.3048, AUTHORITY["EPSG","9002"]]]'
var convert = new proj4(s2,proj4.defs('EPSG:4326'));
var x = wkt(source);
var y = projStr(s2);
for (let key of Object.keys(x)) {
  console.log(key,"\t", x[key], "\t",y[key]);
}
console.log(convert.forward([13180940.59,389396.54]));
