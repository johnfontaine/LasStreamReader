# LasStreamReader

Parse LIDAR files in [LAS v1.2 format](http://www.asprs.org/wp-content/uploads/2010/12/asprs_las_format_v12.pdf). Open LAS file to a ReadableStream.

##Current Features

* Support for Point Data Record Format 0
* Convert from cartesian coordinates to WGS84 projection when EPSG projection is provided
* Provides raw x,y,z coordinates and calculates offset and scale.
* Detect LAZ compressed files and warn -- future support tbd.

##Versions

* Version 1.0 Sept 3, 2016
.* Initial version focused on support for LAS 1.2 files provided by the USGS and US Coast Guard. Note currently expects vertical and horizontal measurements in meters.

##Usage

```
const fs = require("fs");
const las = require('las');
const lasStream = new las.LasStream();

/* Handle Events  */
lasStream.on("error", (error)=> {
    console.log("error", error);
});
lasStream.on("onParseHeader", (header)=>{
    //show the header when parsed
    console.log(header);
});
lasStream.on("onParseVLR", (vlr) => {
    //the variable length records
});
lasStream.on("onGotProjection", (projection)=> {
    console.log("onGotProjection");
    console.log(projection);
});

lasStream.on("onFinishedReadingRecords", (count)=> {
    console.log(`got ${count} records`);
});
const myWritableStream = createWritableSomehow();

var rs = fs.createReadStream("my_las_file.las", {autoClose : true});
rs.pipe(lasStream).pipe(myWritableStream());
/*
    myWritableStream receives an array of point_record objects.  
*/

```
