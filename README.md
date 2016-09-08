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
const lasStream = new las.LasStream(options);

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
##LasStreamReader Options
LasStreamReader may be created with the following options passed to the constructor.  

####transform_lnglat
Default: true

When processing points transform the cartesian coordinates (xyz) into wgs84 longitude and latitude using the projection specified

####projection
Default: use projection specified in the variable length records if available
Some vendors output LAS 1.2 without the required variable length records indicating the LASF projection.  
This library uses proj4 to provide the underlying transform.  I have included proj4 strings from http://spatialreference.org/ and stored them in epsg.json
```
const options = {
    transform_lnglat : true,
    projection : {
        epsg_datum : '' //the EPSG datum code e.g. 26905
    }
}
const lasStream = new las.LasStream(options);
```

##Events

###error

Emitted when a error occurs.

###onParseHeader

Emitted when LasStreamReader finishes reading the header data for the las file.  Provides a Header object.

##onParseVLR

Emitted when LasStreamReader completes parsing of the variable length records.  Returns an array of VariableLengthRecord objects

###onGotProjection

When a projection is not provided in the constructor, LasStreamReader will attempt to identify the correct projection using the variable length records.  This event fires when that determination is made and provides a Projection object.

##onFinishedReadingRecords

When LasStreamReader has parsed all PointRecords this event will fire with a count of records parsed.

##Stream output
The ReadableStream sends an array of PointRecords as it reads through the chunks of the file.

##Objects

###Header
See LAS specification for more details
####Properties
These map to the
.file_signature
.file_source_id
.global_encoding
.project_id_guid_data - array[4] of the GUID data
.version.major
.version.minor
.system_identifier
.generating_software
.file_creation.day_of_year
.file_creation.year
.header_size
.offset_to_point_data
.number_of_variable_length_records
.point_data_record.format
.point_data_record.length
.points.number_of_points
.points.points_x_return - array[5] of points by return
.scale -- array[3] (xyz)
.offset -- array[3] (xyz)
.max_min -- array[2] of array[3] (xyz) [maximum, minimum]
####Methods
.is_gps_time_type() -- returns true if points will have gps time
.is_return_numbers_synthetic() -- returns true if this data has synthetic return numbers


###VariableLengthRecordHeader
####Properties
.reserved
.user_id
.record_id
.length_after_header
.description
.record_length
.data -- if there is extra data this is provided as a Buffer

###PointRecord

####Properties
.raw -- an array[3] (xyz)point_source_id of the unscaled, not offset integers
.scaled -- an array[3] (xyz) of floats computed with the offset and scale for the raw points
.this.lng_lat -- an array[2] (longitude, latitude) of floats for the WGS84 coordinates
.intensity
.return_number
.number_of_returns
.edge_of_flight_line
.classification
.is_synthetic
.is_key_point
.is_withheld
.scan_angle_rank
.user_data
.point_source_id


###Projection
####Properties
.epsg_datum : the epsg code that defines the datum for this projection
.epsg_code : the raw string used to initialize proj4
####Methods
.convert_to_wgs84 -- a function used internally to convert the cartesian coordinates to latitude and longitude.
