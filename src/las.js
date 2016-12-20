/*jshint esversion: 6*/
/*jslint node: true */
 "use strict";
const models = require("./models.js");
const epsg = require("./epsg.json");
const proj4 = require("proj4");
const stream = require('stream');
const util = require('util');
const wkt_parser = require("./wkt_parser.js");
const coordinate_transform_defs = {
  "1": "+proj=utm", //CT_TransverseMercator
  "3": "+proj=omerc +lat_1+45 +lat_2=55", //CT_ObliqueMercator
  "4": "+proj=labrd", //   CT_ObliqueMercator_Laborde
  "7": "+proj=merc",
  "8": "+proj=lcc", //CT_LambertConfConic_2SP
  "10": "+proj=laea"


/*
CT_TransvMercator_Modified_Alaska = 2
   CT_ObliqueMercator_Rosenmund =	5
   CT_ObliqueMercator_Spherical =	6
   CT_LambertConfConic_Helmert =	9
   CT_AlbersEqualArea =	11
   CT_AzimuthalEquidistant =	12
   CT_EquidistantConic =	13
   CT_Stereographic =	14
   CT_PolarStereographic =	15
   CT_ObliqueStereographic =	16
   CT_Equirectangular =	17
   CT_CassiniSoldner =	18
   CT_Gnomonic =	19
   CT_MillerCylindrical =	20
   CT_Orthographic =	21
   CT_Polyconic =	22
   CT_Robinson =	23
   CT_Sinusoidal =	24
   CT_VanDerGrinten =	25
   CT_NewZealandMapGrid =	26
   CT_TransvMercator_SouthOriented=	27
*/
}
const linear_unit_defs = {
  9001 : function(value) {
    return Number(value);
    //Linear_Meter
  },
  9002 : function(value) {
    //Linear_Foot
    return Number(value) * 0.3048;
  },
  9003 : function(value) {
    //Linear_Foot_US_Survey
    return Number(value) * ( 1200/3937 );
  },
  9004 : function(value) {
    //Linear_Foot_Modified_American =	9004
    return Number(value) * ( 1200/3937 );
  },
  9005 : function(value) {
    //Linear_Foot_Clarke = 9005
    return value * 0.3047972654;
  },
  9006 : function(value) {
    //Linear_Foot_Indian =	9006
    return value * 0.3047995 ;
  },
  9007 : function(value) {
    //Linear_Link =	9007
    return value * 0.201168;
  }
  /* TODO add these mostly unused units of measure.
  Linear_Link_Benoit =	9008
  Linear_Link_Sears =	9009
  Linear_Chain_Benoit =	9010
  Linear_Chain_Sears =	9011
  Linear_Yard_Sears =	9012
  Linear_Yard_Indian =	9013
  Linear_Fathom =	9014
  Linear_Mile_International_Nautical =	9015
  */
};

const proj4_linear_units_def = {
  9001 : "m",
  9002 : 'ft',
  9003 : "us-ft"
};

class LasStreamReader extends stream.Transform {
    constructor(options) {
        super({readableObjectMode : true});
        this.point_record_options = {};
        this.read_header = false;
        this.read_vlr = false;
        this.got_projection = false;
        this.bytes_read = 0;
        this.header_buffer = Buffer.alloc(400);
        this.header_bytes_read = 0;
        this.point_record_options.transform_latlng = true;
        this.point_record_options.parse_full_point_record = true;
        this.is_laz = false;
        this.check_laz = false;
        this.check_classification_lookup = false;
        this.has_classification_lookup_table = false;
        if (options) {
            this.point_record_options.transform_lnglat = options.transform_lnglat === false ? false : true; // raw | scaled | wgs
            this.point_record_options.parse_full_point_record = options.parse_full_point_record || false;
            if (options.filter) {
                //include a filter;;
            }
            if (options.projection && options.projection.epsg_datum) {
                let epsg_code = epsg[String(options.projection.epsg_datum)];
                this.projection = {
                    epsg_datum :  options.projection.epsg_datum,
                    epsg_code : epsg_code,
                    convert_to_wgs84 : new proj4(epsg_code, proj4.defs('EPSG:4326')),
                    convert_elevation_to_meters  : function(value) { return value }
                };
                //igore VLR projection data and use this one instead.
                this.got_projection = true;
            }
        }
    }
    _transform(data, encoding, callback) {
        let size = data.length;
        let records = [];
        this.bytes_read += size;
        let chunk_start = this.bytes_read - size;
        let total = this.bytes_read;
        if (!this.read_header) {
            this._do_read_header(data, chunk_start);
        }

        if (this.read_header && !this.read_vlr) {
            this._do_read_vlr(data, chunk_start);
        }
        if (this.read_header && this.read_vlr) {
            if (this.is_laz) {
                callback("laszip is not supported yet");
                return;
            } else {
                this._do_read_records(data, chunk_start, callback);
            }
        } else {
            callback(null, records);
        }
    }
    _flush(callback) {
    //    console.log("invoke flush");
        callback();
    }
    _do_read_header(data, chunk_start) {
        this.header_bytes_read = fill_to_buffer(data, this.header_buffer, this.header_bytes_read);
        if (this.header_bytes_read === 400) {
            this.header = new models.Header(data.buffer);
            let offset = this.header.header_size;
            let start_point_data = this.header.offset_to_point_data;
            this.vlr_buffer = new Buffer.alloc(parseInt(start_point_data) - parseInt(offset));
            this.vlr_bytes_read = 0;
            this.read_header = true;
            this.points_data_size = ( this.header.point_data_record.length * this.header.points.number_of_points );
            this.points_data_read = 0;
            this.emit('onParseHeader', this.header);
        }
    }
    _do_read_vlr(data, chunk_start) {
        if (chunk_start < this.header.header_size) {
            this.vlr_bytes_read = fill_to_buffer(data.slice(this.header.header_size), this.vlr_buffer, this.vlr_bytes_read);
        } else {
            this.vlr_bytes_read = fill_to_buffer(data, this.vlr_buffer, this.vlr_bytes_read);
        }
        let vlr_remain =  this.vlr_buffer.length - this.vlr_bytes_read;
        if (vlr_remain === 0) {
            this.vlr = {};
            let last_vlr_offset = 0;
            for (let i = 0; i < this.header.number_of_variable_length_records; i++) {
                let d = this.vlr_buffer.buffer.slice(last_vlr_offset);
                let vlr = new models.VariableLengthRecordHeader(d);

                last_vlr_offset += vlr.record_length;
                if (!this.vlr[String(vlr.user_id)]) {
                  this.vlr[String(vlr.user_id)] = {};
                }
                this.vlr[vlr.user_id][String(vlr.record_id)] = vlr;
                //this.vlr.push(vlr);
            }
            this.read_vlr = true;
            if (!this.check_laz) {
                if (this.vlr['laszip encoded'] && this.vlr['laszip encoded']['22204']) {
                  this.vlr['laszip encoded'].laz_info = new models.LazZipVlr(this.vlr['laszip encoded']['22204'].data);
                  this.is_laz = this.emit("onGotLazInfo", this.vlr['laszip encoded'].laz_info);
                };
                this.check_laz = true;
            }

            if (!this.check_classification_lookup) {
                check_classification_lookup(this);
            }
            this.emit('onParseVLR', this.vlr);
            if (!this.got_projection) {
                if (!this.vlr['LASF_Projection']) {
                    this.emit("error", new Error('Unable to determine projection from variable length records'));
                } else {
                    this.projection = computeProjection(this, this.vlr);
                    if (this.projection && this.projection.convert_to_wgs84) {
                      try {
                        let ne = this.projection.convert_to_wgs84.forward([ this.header.max_min[0][1], this.header.max_min[1][1] ]);
                        let sw = this.projection.convert_to_wgs84.forward([ this.header.max_min[0][1], this.header.max_min[1][1] ]);
                        this.projection.bounds = [
                          sw, ne
                        ];
                          this.emit("onGotProjection", this.projection);

                      } catch (error) {
                        this.emit("error", error);
                      }
                    } else {
                        this.emit("error", new Error("invalid projection\n" + JSON.stringify(this.projection, null, " ")));
                    }
                }
            }
        }
    }
    _do_read_records(data, chunk_start, callback) {
        let local_buffer;
        let rec_size = this.header.point_data_record.length;
        if (chunk_start < this.header.offset_to_point_data) {
            local_buffer = data.buffer.slice(this.header.offset_to_point_data);
        } else {
            if (this.save_buffer) {
                let tmp_buffer = Buffer.concat([Buffer.from(this.save_buffer), data]);
                local_buffer = tmp_buffer.buffer;
            } else {
                local_buffer = data.buffer;
            }
        }
        let remainder = local_buffer.byteLength % rec_size;
        let end = local_buffer.byteLength-remainder;
        let proc_buffer = local_buffer.slice(0, end);
        this.points_data_read += proc_buffer.byteLength;
        if (remainder) {
            this.save_buffer = local_buffer.slice(end);
        } else {
            this.save_buffer = null;
        }
        let num_records = parseInt(proc_buffer.byteLength / rec_size);
        let records = [];
        for (let i = 0; i < num_records; i++) {
            let start_rec = i * rec_size;
            let end_rec = (i + 1) * rec_size;
            records.push(
                new models.PointRecord(proc_buffer.slice(start_rec,end_rec), this.header, this.point_record_options, this.projection)
            );
        }

        if (this.points_data_read === this.points_data_size) {
            this.emit('onFinishedReadingRecords', this.header.points.number_of_points);
        }
        this.push(records);
        callback();
    }
}

function fill_to_buffer(in_buffer, fill_buffer, filled) {
    let remain = fill_buffer.length - filled;
    if (in_buffer.length >= remain) {
        fill_buffer.fill(in_buffer.slice(0, remain), filled);
        filled += remain;
    } else {
        fill_buffer.fill(in_buffer, filled);
        filled += in_buffer.length;
    }
    return filled;
}

function computeProjection(obj, records) { //variable length records
    if(records['LASF_Projection']) {
      if (records['LASF_Projection']['34735']) {
        return computeProjectionWithGeoTag(obj,records['LASF_Projection']);
      } else if (records['LASF_Projection']['2111']) {
        obj.emit("error", new Error("Math WKT transform not supported"));
      } else if (records['LASF_Projection']['2112']) {
        let projection = {
          target_proj : proj4.defs('EPSG:4326'),
          got_projection : true,
          wkt : records['LASF_Projection']['2112'].ascii_data,
          parse_wkt : wkt_parser(records['LASF_Projection']['2112'].ascii_data),
          convert_to_wgs84 : null,
          convert_elevation_to_meters : function(value) { return value; },
          convert_linear_to_meters : function(value) { return value; }
        };
        if (projection.parse_wkt.PROJCS && projection.parse_wkt.PROJCS.UNIT && projection.parse_wkt.PROJCS.UNIT.name != 'meter') {
          projection.convert_elevation_to_meters = function(value) {
            return value * Number(projection.parse_wkt.PROJCS.UNIT.value);
          }
        }
        try {
          projection.convert_to_wgs84 = new proj4(projection.wkt, projection.target_proj); //to
          projection.got_projection = true;
          return projection;
        } catch(error) {
          obj.emit("log", { level : 'error', message: "error building projection: " +  JSON.stringify(projection, null, " ")});
          obj.emit("error", new Error(`error building projection from wkt ${error}`));
        }
        //obj.emit("error", new Error("WKT projection not supported"))
      }
    }
    return;
}
function check_classification_lookup(self) {
    if (self.vlr['LASF_Spec'] && self.vlr['LASF_Spec']['0']) {
        self.classification_table = new models.ClassificationTable(self.vlr['LASF_Spec']['0']);
    }
    self.check_classification_lookup = true;
}

function computeProjectionWithGeoTag(obj, projection_records) {
//    console.log("record is", record);
    let projection = {
      codes : {},
      got_projection : false,
      convert_to_wgs84 : null,
      target_proj : proj4.defs('EPSG:4326'),
      convert_elevation_to_meters : function(value) { return value; },
      convert_linear_to_meters : function(value) { return value; }
    };
    let geokey = new models.GeoKey(projection_records);
    projection.geokey = geokey;
    //get the EPSG code held in key 3072 or throw an error because this file lacks common decency.
    //See http://gis.stackexchange.com/questions/173111/converting-geotiff-projection-definition-to-proj4
    //todo: other projection options.
    //http://www.remotesensing.org/geotiff/spec/geotiff6.html#6.3.3.1
    let epsg_code;
    //check for Unit code
    if (geokey.has_epsg_projection) {
        epsg_code = String(epsg[String(geokey.epsg_projection_code)]);
        if (epsg_code && epsg_code !== "unknown") {
            projection.epsg_proj4 = epsg_code;
            projection.epsg_datum = geokey.epsg_projection_code;
            if (projection.geokey.proj4_values["+units"] != "m") {
              projection.epsg_proj4 = projection.epsg_proj4.replace("+units=m", "+units=" + projection.geokey.proj4_values["+units"])
            }
            projection.got_projection = true;
        } else {
          obj.emit("log", { level : 'info', message: "failed to determine epsg_projection from code: " + geokey.epsg_projection_code });
        }
    }
    if (!projection.got_projection && getkey.hasKey(3076)) {
      if (Number(geokey.getKey(3076).value) > 9015 ) {
        epsg_code = String(epsg[String(geokey.getKey(3076).value)]);
        if (epsg_code && epsg_code !== "unknown") {
          projection.epsg_proj4  = epsg_code;
          if (geokey.hasKey(2052) && geokey.getKey(2052).value) {
              projection.epsg_proj4 = projection.epsg_proj4.replace("+units=m", "+units=" + geokey.getProjValueForKey(2052));
          }
          projection.got_projection = true;
        } else {
          obj.emit("log", { level : 'info', message: "failed to determine epsg_projection from ProjLinearUnits custom value: " + getkey.hasKey(3076).value });
        }
      }
    }
    if (!projection.got_projection) {
        projection.epsg_proj4 = geokey.computeProj4Args();
        projection.got_projection = true;
    }
    try {
      projection.convert_to_wgs84 = new proj4(projection.epsg_proj4, projection.target_proj); //to
      projection.got_projection = true;

    } catch(error) {
      console.log("error", error);
      obj.emit("log", { level : 'error', message: "error building projection: " +  JSON.stringify(projection, null, " ")});
      obj.emit("error", new Error(`error building projection ${error}`));
      return;
    }

    //VerticalCSTypeGeoKey
    //http://www.remotesensing.org/geotiff/spec/geotiff6.html#6.3.4.1

    if (geokey.key[String("4096")]) {
      let key = geokey.key[String("4096")];
      projection.epsg_vertical_datum = key.wValue_Offset;
    }
    if (geokey.key[String("4099")]) {
        let key = geokey.key[String("4099")];
        projection.vertical_unit_key = String(key.wValue_Offset);
        projection.convert_elevation_to_meters = linear_unit_defs[projection.vertical_unit_key];
    }
    return projection;
}



module.exports = {
    models : models,
    LasStreamReader : LasStreamReader
};
